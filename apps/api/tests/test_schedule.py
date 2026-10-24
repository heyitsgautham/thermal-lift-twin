"""Scheduler unit tests on a two-well field small enough to check by hand."""

from twin_api.schedule import Scheduler, _better, _shift, is_close, repair


def _cycle(slot_id, start, injection=2, soak=1, rate=10.0, oil=5.0, leg=3):
    return {
        "slotId": slot_id,
        "start_d": start,
        "injection_d": injection,
        "soak_d": soak,
        "rate_t_per_h": rate,
        "steam_t": rate * 24 * injection,
        "productionLeg_d": leg,
        "oil": [oil] * 40,
    }


def _tables(downtime=None):
    return {
        "horizon_d": 10,
        "steamCost_bbl_per_t": 0.01,
        "minProductionLeg_d": 3,
        "downtime": downtime or {},
        "css": [
            {"wellId": "A", "opportunityRate_bbl_per_d": 1.0, "anchor": _cycle(None, -10), "slots": [_cycle("A#2", 4)]},
            {"wellId": "B", "opportunityRate_bbl_per_d": 1.0, "anchor": _cycle(None, -10), "slots": [_cycle("B#2", 4)]},
        ],
        "cold": [{"wellId": "C", "oil": [2.0] * 10}],
    }


PLAN = [
    {"id": "A#2", "wellId": "A", "start_d": 4, "injection_d": 2},
    {"id": "B#2", "wellId": "B", "start_d": 4, "injection_d": 2},
]


def test_steam_load_adds_up_across_wells():
    ev = Scheduler(_tables()).evaluate(PLAN, 24)
    assert ev.load == [0, 0, 0, 0, 20, 20, 0, 0, 0, 0]
    assert ev.overload_days == []
    assert ev.steam_t == 2 * 2 * 10 * 24


def test_two_slots_on_the_same_days_overload_one_generator():
    ev = Scheduler(_tables()).evaluate(PLAN, 12)
    assert ev.overload_days == [4, 5]


def test_oil_stops_for_injection_soak_and_downtime():
    sched = Scheduler(_tables(downtime={"A": [0, 1]}))
    ev = sched.evaluate(PLAN, 24)
    # Well A: 10 days minus 2 down, 2 steaming and 1 soaking leaves 5 producing days at 5 bbl/d.
    assert ev.well_oil["A"] == 25
    assert ev.well_oil["B"] == 35
    assert ev.well_oil["C"] == 20
    assert ev.field_oil == ev.css_oil + 20


def test_bounds_keep_the_minimum_leg_after_the_cycle_before():
    sched = Scheduler(_tables())
    lo, hi = sched.bounds(PLAN, "A#2")
    # The anchor's soak ends on day -7, and three production days must follow.
    assert lo == 1
    assert hi == 9


def test_shift_moves_only_the_named_slot():
    moved = _shift(PLAN, "A#2", 3)
    assert [s["start_d"] for s in moved] == [7, 4]
    assert PLAN[0]["start_d"] == 4


def test_better_prefers_fewer_overload_days_then_value_then_a_smaller_move():
    assert _better((0, 100.0, 5), (1, 900.0, 1))
    assert _better((0, 120.0, 5), (0, 100.0, 1))
    assert _better((0, 101.0, 1), (0, 100.0, 5))
    assert not _better((0, 101.0, 5), (0, 100.0, 1))
    assert _better((0, 0.0, 0), None)


def test_repair_moves_one_slot_off_the_shared_days():
    sched = Scheduler(_tables())
    res = repair(sched, PLAN, {"A#2"}, 12)
    assert res["feasible"] is True
    assert res["editedOverloadDays"] == [4, 5]
    assert [m["slotId"] for m in res["moves"]] == ["B#2"]
    held = next(s for s in res["proposal"] if s["id"] == "A#2")
    assert held["start_d"] == 4
    assert any(o["status"] == "blocked" and o["slotId"] == "A#2" for o in res["options"])


def test_repair_reports_when_nothing_can_move():
    res = repair(Scheduler(_tables()), PLAN, {"A#2", "B#2"}, 12)
    assert res["feasible"] is False
    assert res["moves"] == []


def test_is_close_allows_float_noise_only():
    assert is_close(1000.0, 1000.0 + 1e-7)
    assert not is_close(1000.0, 1001.0)
