"""Generator scheduling on the exported oil curves.

A line-for-line port of `packages/optimise` (FieldModel.evaluate, slotBounds
and repairPlan). The physics is not re-implemented here: every cycle's daily
oil comes from tables.json, which the TypeScript twin wrote. The tests hold
this port to the TypeScript answer for the demo edit, recorded in the same file.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field as dc_field
from typing import Any

EPS = 1e-9
VALUE_TOLERANCE_BBL = 5.0


@dataclass
class Cycle:
    slot_id: str | None
    start: int
    injection: int
    soak: int
    rate: float
    steam_t: float
    leg: int
    oil: list[float]


@dataclass
class Evaluation:
    load: list[float]
    segments: list[list[tuple[str, str | None, float]]]
    overload_days: list[int]
    field_oil: float
    css_oil: float
    steam_t: float
    carried: float
    value: float
    well_oil: dict[str, float] = dc_field(default_factory=dict)


class Scheduler:
    def __init__(self, tables: dict[str, Any]):
        self.h = tables["horizon_d"]
        self.steam_cost = tables["steamCost_bbl_per_t"]
        self.min_leg = tables["minProductionLeg_d"]
        self.downtime = {k: set(v) for k, v in tables["downtime"].items()}
        self.wells: list[str] = []
        self.anchor: dict[str, Cycle] = {}
        self.slot_table: dict[str, Cycle] = {}
        self.slot_well: dict[str, str] = {}
        self.opportunity: dict[str, float] = {}
        for w in tables["css"]:
            wid = w["wellId"]
            self.wells.append(wid)
            self.anchor[wid] = self._cycle(w["anchor"])
            self.opportunity[wid] = w["opportunityRate_bbl_per_d"]
            for s in w["slots"]:
                self.slot_table[s["slotId"]] = self._cycle(s)
                self.slot_well[s["slotId"]] = wid
        self.cold = {c["wellId"]: c["oil"] for c in tables["cold"]}

    @staticmethod
    def _cycle(t: dict[str, Any]) -> Cycle:
        return Cycle(t["slotId"], t["start_d"], t["injection_d"], t["soak_d"], t["rate_t_per_h"], t["steam_t"], t["productionLeg_d"], t["oil"])

    def cycles_for(self, well_id: str, plan: list[dict[str, Any]]) -> list[Cycle]:
        slots = sorted((s for s in plan if s["wellId"] == well_id), key=lambda s: s["start_d"])
        out = [self.anchor[well_id]]
        for s in slots:
            base = self.slot_table[s["id"]]
            out.append(Cycle(s["id"], s["start_d"], base.injection, base.soak, base.rate, base.steam_t, base.leg, base.oil))
        return out

    def evaluate(self, plan: list[dict[str, Any]], capacity_t_per_h: float) -> Evaluation:
        h = self.h
        load = [0.0] * h
        segments: list[list[tuple[str, str | None, float]]] = [[] for _ in range(h)]
        css_oil = 0.0
        steam = 0.0
        carried = 0.0
        well_oil: dict[str, float] = {}
        instances: list[tuple[int, str, Cycle]] = []
        for wid in self.wells:
            cycles = self.cycles_for(wid, plan)
            down = self.downtime.get(wid, set())
            total = 0.0
            for d in range(h):
                c = cycles[0]
                for cand in cycles:
                    if cand.start <= d:
                        c = cand
                rel = d - c.start
                if rel < c.injection:
                    steam += c.rate * 24
                elif rel < c.injection + c.soak:
                    pass
                elif d in down:
                    pass
                else:
                    total += c.oil[rel - c.injection - c.soak]
            well_oil[wid] = total
            css_oil += total
            last = [c for c in cycles if c.start < h][-1]
            carried += self._carried(wid, last)
            for c in cycles:
                instances.append((c.start, wid, c))
        instances.sort(key=lambda x: (x[0], x[1]))
        for _, wid, c in instances:
            for d in range(max(0, c.start), min(h, c.start + c.injection)):
                load[d] += c.rate
                segments[d].append((wid, c.slot_id, c.rate))
        cold_oil = 0.0
        for wid, oil in self.cold.items():
            down = self.downtime.get(wid, set())
            total = sum(q for d, q in enumerate(oil) if d not in down)
            well_oil[wid] = total
            cold_oil += total
        field_oil = css_oil + cold_oil
        committed = sum(self.slot_table[s["id"]].steam_t for s in plan if s["start_d"] < h)
        overload = [d for d in range(h) if load[d] > capacity_t_per_h + EPS]
        return Evaluation(
            load=load,
            segments=segments,
            overload_days=overload,
            field_oil=field_oil,
            css_oil=css_oil,
            steam_t=steam,
            carried=carried,
            value=field_oil - self.steam_cost * committed + carried,
            well_oil=well_oil,
        )

    def _carried(self, well_id: str, c: Cycle) -> float:
        shut = c.injection + c.soak
        end = max(self.h, c.start + shut + c.leg)
        oil = 0.0
        for d in range(self.h, end):
            t = d - c.start - shut
            if t >= 0:
                oil += c.oil[t]
        return oil - self.opportunity[well_id] * (end - self.h)

    def bounds(self, plan: list[dict[str, Any]], slot_id: str) -> tuple[int, int]:
        slot = next(s for s in plan if s["id"] == slot_id)
        cycles = self.cycles_for(slot["wellId"], plan)
        i = next(k for k, c in enumerate(cycles) if c.slot_id == slot_id)
        prev = cycles[i - 1]
        nxt = cycles[i + 1] if i + 1 < len(cycles) else None
        cur = cycles[i]
        lo = max(1, prev.start + prev.injection + prev.soak + self.min_leg)
        hi = min(self.h - 1, nxt.start - (cur.injection + cur.soak + self.min_leg) if nxt else self.h - 1)
        return lo, hi


def _shift(plan: list[dict[str, Any]], slot_id: str, delta: int) -> list[dict[str, Any]]:
    return [dict(s, start_d=s["start_d"] + delta) if s["id"] == slot_id else s for s in plan]


def _better(a: tuple[int, float, int], b: tuple[int, float, int] | None) -> bool:
    """a and b are (overload days, value, delta)."""
    if b is None:
        return True
    if a[0] != b[0]:
        return a[0] < b[0]
    if abs(a[1] - b[1]) > VALUE_TOLERANCE_BBL:
        return a[1] > b[1]
    if abs(a[2]) != abs(b[2]):
        return abs(a[2]) < abs(b[2])
    if abs(a[1] - b[1]) > 1e-6:
        return a[1] > b[1]
    return a[2] > b[2]


def repair(
    sched: Scheduler,
    plan: list[dict[str, Any]],
    pinned: set[str],
    capacity_t_per_h: float,
    max_shift: int = 21,
    max_rounds: int = 3,
) -> dict[str, Any]:
    edited = sched.evaluate(plan, capacity_t_per_h)
    current = list(plan)
    cur_eval = edited
    moves: list[dict[str, Any]] = []
    options: list[dict[str, Any]] = []
    tested_shifts = 0
    for round_no in range(max_rounds):
        if not cur_eval.overload_days:
            break
        over = set(cur_eval.overload_days)
        round_options: list[dict[str, Any]] = []
        best_pick: tuple[dict[str, Any], tuple[int, float, int], list[dict[str, Any]], Evaluation] | None = None
        for slot in current:
            if not any(d in over for d in range(slot["start_d"], slot["start_d"] + slot["injection_d"])):
                continue
            if slot["id"] in pinned:
                round_options.append({"wellId": slot["wellId"], "slotId": slot["id"], "status": "blocked", "reason": "your edit, held"})
                continue
            lo, hi = sched.bounds(current, slot["id"])
            best: tuple[tuple[int, float, int], list[dict[str, Any]], Evaluation] | None = None
            for delta in range(-max_shift, max_shift + 1):
                if delta == 0 or not lo <= slot["start_d"] + delta <= hi:
                    continue
                candidate = _shift(current, slot["id"], delta)
                ev = sched.evaluate(candidate, capacity_t_per_h)
                tested_shifts += 1
                score = (len(ev.overload_days), ev.value, delta)
                if _better(score, best[0] if best else None):
                    best = (score, candidate, ev)
            if best is None:
                round_options.append({"wellId": slot["wellId"], "slotId": slot["id"], "status": "blocked", "reason": "no room to move"})
                continue
            option = {
                "wellId": slot["wellId"],
                "slotId": slot["id"],
                "status": "clears" if best[0][0] == 0 else "partial",
                "delta_d": best[0][2],
                "valueChange_bbl": best[0][1] - cur_eval.value,
                "overloadDaysAfter": best[0][0],
            }
            round_options.append(option)
            if best_pick is None or _better(best[0], best_pick[1]):
                best_pick = (option, best[0], best[1], best[2])
        if round_no == 0:
            options = round_options
        if best_pick is None or best_pick[1][0] >= len(cur_eval.overload_days):
            break
        option, score, candidate, ev = best_pick
        slot = next(s for s in current if s["id"] == option["slotId"])
        moves.append(
            {
                "slotId": slot["id"],
                "wellId": slot["wellId"],
                "delta_d": score[2],
                "fromStart_d": slot["start_d"],
                "toStart_d": slot["start_d"] + score[2],
                "valueChange_bbl": ev.value - cur_eval.value,
                "oilChange_bbl": ev.field_oil - cur_eval.field_oil,
            }
        )
        current, cur_eval = candidate, ev
    return {
        "proposal": current,
        "moves": moves,
        "options": options,
        "editedOverloadDays": edited.overload_days,
        "feasible": not cur_eval.overload_days,
        "testedShifts": tested_shifts,
        "totals": {
            "fieldOil90_bbl": cur_eval.field_oil,
            "steam90_t": cur_eval.steam_t,
            "value_bbl": cur_eval.value,
            "sor90": (cur_eval.steam_t * 6.289811 / cur_eval.css_oil) if cur_eval.css_oil > 0 else None,
        },
    }


def is_close(a: float, b: float, rel: float = 1e-9) -> bool:
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-6)
