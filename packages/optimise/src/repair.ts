import { FieldModel, shiftSlot, type Plan, type PlanEvaluation } from "./field-model";
import type { Capacity, SteamSlot } from "./types";

// Generator repair. When a plan asks for more steam than the generators make,
// the twin tries moving each other steam slot that injects on an overloaded
// day, one day at a time within +/- maxShift days, and keeps the move that
// clears the overload for the least plan value (PlanTotals.value_bbl). Slots the engineer placed are pinned
// and never moved. Cycles already injecting are fixed. If no single move
// clears it, the best partial move is applied and the search repeats.

export interface RepairMove {
  slotId: string;
  wellId: string;
  delta_d: number;
  fromStart_d: number;
  toStart_d: number;
  /** Change in plan value (see PlanTotals.value_bbl) caused by this move alone. Negative is a cost. */
  valueChange_bbl: number;
  /** Change in 90-day field oil caused by this move alone. */
  oilChange_bbl: number;
}

export type RepairOptionStatus = "clears" | "partial" | "blocked";

export interface RepairOption {
  wellId: string;
  slotId: string | null;
  status: RepairOptionStatus;
  delta_d: number | null;
  valueChange_bbl: number | null;
  oilChange_bbl: number | null;
  overloadDaysAfter: number | null;
  reason: string | null;
}

export interface RepairResult {
  edited: PlanEvaluation;
  proposal: SteamSlot[];
  after: PlanEvaluation;
  moves: RepairMove[];
  /** First-round options, best first. The chosen move is first when one clears. */
  options: RepairOption[];
  tested: { slots: number; shifts: number };
  feasible: boolean;
}

interface Scored {
  delta_d: number;
  overloadDays: number;
  value_bbl: number;
  plan: SteamSlot[];
  evaluation: PlanEvaluation;
}

/**
 * Moves whose value differs by less than this are treated as equally good, and
 * the smaller shift wins. Planners prefer the move that disturbs the calendar least.
 */
export const VALUE_TOLERANCE_BBL = 5;

function better(a: Scored, b: Scored | null): boolean {
  if (!b) return true;
  if (a.overloadDays !== b.overloadDays) return a.overloadDays < b.overloadDays;
  if (Math.abs(a.value_bbl - b.value_bbl) > VALUE_TOLERANCE_BBL) return a.value_bbl > b.value_bbl;
  if (Math.abs(a.delta_d) !== Math.abs(b.delta_d)) return Math.abs(a.delta_d) < Math.abs(b.delta_d);
  if (Math.abs(a.value_bbl - b.value_bbl) > 1e-6) return a.value_bbl > b.value_bbl;
  return a.delta_d > b.delta_d;
}

export function repairPlan(
  field: FieldModel,
  plan: Plan,
  pinned: ReadonlySet<string>,
  capacity: Capacity,
  maxShift_d = 21,
  maxRounds = 3,
): RepairResult {
  const edited = field.evaluate(plan, capacity);
  let current: SteamSlot[] = [...plan];
  let currentEval = edited;
  const moves: RepairMove[] = [];
  let options: RepairOption[] = [];
  let testedSlots = 0;
  let testedShifts = 0;

  for (let round = 0; round < maxRounds && currentEval.overloadDays.length > 0; round++) {
    const over = new Set(currentEval.overloadDays);
    const onOverloadedDays = (start: number, len: number) => {
      for (let d = start; d < start + len; d++) if (over.has(d)) return true;
      return false;
    };

    const roundOptions: (RepairOption & { scored?: Scored })[] = [];

    // Cycles already injecting on day 0 cannot move. Report them so the reason is visible.
    const blockedWells = new Set<string>();
    for (const day of currentEval.overloadDays) {
      for (const seg of currentEval.load[day]!.segments) {
        if (seg.slotId === null && !blockedWells.has(seg.wellId)) {
          blockedWells.add(seg.wellId);
          roundOptions.push({
            wellId: seg.wellId,
            slotId: null,
            status: "blocked",
            delta_d: null,
            valueChange_bbl: null,
            oilChange_bbl: null,
            overloadDaysAfter: null,
            reason: "already injecting",
          });
        }
      }
    }

    for (const slot of current) {
      if (!onOverloadedDays(slot.start_d, slot.injection_d)) continue;
      if (pinned.has(slot.id)) {
        roundOptions.push({
          wellId: slot.wellId,
          slotId: slot.id,
          status: "blocked",
          delta_d: null,
          valueChange_bbl: null,
          oilChange_bbl: null,
          overloadDaysAfter: null,
          reason: "your edit, held",
        });
        continue;
      }
      testedSlots++;
      const bounds = field.slotBounds(current, slot.id);
      let best: Scored | null = null;
      for (let delta = -maxShift_d; delta <= maxShift_d; delta++) {
        if (delta === 0) continue;
        const start = slot.start_d + delta;
        if (start < bounds.min_d || start > bounds.max_d) continue;
        const candidatePlan = shiftSlot(current, slot.id, delta);
        const evaluation = field.evaluate(candidatePlan, capacity);
        testedShifts++;
        const scored: Scored = {
          delta_d: delta,
          overloadDays: evaluation.overloadDays.length,
          value_bbl: evaluation.totals.value_bbl,
          plan: candidatePlan,
          evaluation,
        };
        if (better(scored, best)) best = scored;
      }
      if (!best) {
        roundOptions.push({
          wellId: slot.wellId,
          slotId: slot.id,
          status: "blocked",
          delta_d: null,
          valueChange_bbl: null,
          oilChange_bbl: null,
          overloadDaysAfter: null,
          reason: "no room to move",
        });
        continue;
      }
      roundOptions.push({
        wellId: slot.wellId,
        slotId: slot.id,
        status: best.overloadDays === 0 ? "clears" : "partial",
        delta_d: best.delta_d,
        valueChange_bbl: best.value_bbl - currentEval.totals.value_bbl,
        oilChange_bbl: best.evaluation.totals.fieldOil90_bbl - currentEval.totals.fieldOil90_bbl,
        overloadDaysAfter: best.overloadDays,
        reason: null,
        scored: best,
      });
    }

    let pick: (RepairOption & { scored?: Scored }) | null = null;
    for (const o of roundOptions) {
      if (!o.scored) continue;
      if (!pick || better(o.scored, pick.scored!)) pick = o;
    }

    const rank = (o: RepairOption & { scored?: Scored }) =>
      o === pick ? -1 : o.status === "clears" ? 0 : o.status === "partial" ? 1 : 2;
    const sorted = [...roundOptions].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.overloadDaysAfter ?? 99) - (b.overloadDaysAfter ?? 99) ||
        (b.valueChange_bbl ?? -Infinity) - (a.valueChange_bbl ?? -Infinity),
    );
    if (round === 0) options = sorted.map(({ scored, ...o }) => o);

    if (!pick?.scored || pick.scored.overloadDays >= currentEval.overloadDays.length) break;
    const slot = current.find((s) => s.id === pick!.slotId)!;
    moves.push({
      slotId: slot.id,
      wellId: slot.wellId,
      delta_d: pick.scored.delta_d,
      fromStart_d: slot.start_d,
      toStart_d: slot.start_d + pick.scored.delta_d,
      valueChange_bbl: pick.scored.value_bbl - currentEval.totals.value_bbl,
      oilChange_bbl: pick.scored.evaluation.totals.fieldOil90_bbl - currentEval.totals.fieldOil90_bbl,
    });
    current = pick.scored.plan;
    currentEval = pick.scored.evaluation;
  }

  return {
    edited,
    proposal: current,
    after: currentEval,
    moves,
    options,
    tested: { slots: testedSlots, shifts: testedShifts },
    feasible: currentEval.overloadDays.length === 0,
  };
}
