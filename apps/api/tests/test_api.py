from fastapi.testclient import TestClient

from twin_api import data
from twin_api.main import app
from twin_api.schedule import Scheduler, is_close, repair

client = TestClient(app)


def test_health_and_field_counts():
    assert client.get("/health").json()["status"] == "ok"
    f = client.get("/field").json()
    assert f["field"] == {"name": "Heavy-oil field", "wellsDrilled": 52, "wellsProducing": 33, "wellsOnCss": 19}


def test_wells_cycles_and_telemetry():
    assert len(client.get("/wells").json()) == 52
    cycles = client.get("/wells/BGW-14/cycles").json()
    assert [c["cycleNumber"] for c in cycles] == [1, 2, 3, 4, 5]
    rows = client.get("/wells/BGW-14/telemetry", params={"date_from": "2026-09-01"}).json()
    assert 20 <= len(rows) <= 27
    assert {"oil_bbl", "prl_max_kN", "card_drift", "fillage_frac"} <= set(rows[0])
    assert client.get("/wells/BGW-99").status_code == 404


def test_failures_in_the_published_range():
    assert 60 <= len(client.get("/failures").json()) <= 80


def test_issued_plan_fits_the_generators():
    plan = client.get("/schedules/issued").json()
    res = client.post("/schedules/check", json={"plan": plan}).json()
    assert res["overloadDays"] == []
    assert res["capacity_t_per_h"] == 24


def test_repair_matches_the_typescript_twin():
    """The golden answer was written by packages/simulate from the TypeScript scheduler."""
    tables = data.tables()
    golden = tables["golden"]
    sched = Scheduler(tables)
    plan = [dict(s, start_d=golden["editedStart_d"]) if s["id"] == golden["editedSlotId"] else s for s in tables["issuedPlan"]]
    edited = sched.evaluate(plan, 24)
    assert edited.overload_days == golden["editedOverloadDays"]
    assert is_close(sched.evaluate(tables["issuedPlan"], 24).value, golden["issuedValue_bbl"])
    res = repair(sched, plan, {golden["editedSlotId"]}, 24)
    assert [(m["wellId"], m["delta_d"]) for m in res["moves"]] == [(m["wellId"], m["delta_d"]) for m in golden["moves"]]
    for mine, theirs in zip(res["moves"], golden["moves"], strict=True):
        assert is_close(mine["valueChange_bbl"], theirs["valueChange_bbl"])
        assert is_close(mine["oilChange_bbl"], theirs["oilChange_bbl"])
    assert is_close(res["totals"]["value_bbl"], golden["proposalValue_bbl"])
    assert is_close(res["totals"]["fieldOil90_bbl"], golden["proposalOil90_bbl"])


def test_repair_endpoint_holds_the_pinned_slot():
    tables = data.tables()
    golden = tables["golden"]
    plan = [dict(s, start_d=golden["editedStart_d"]) if s["id"] == golden["editedSlotId"] else s for s in tables["issuedPlan"]]
    res = client.post("/schedules/repair", json={"plan": plan, "pinned": [golden["editedSlotId"]]}).json()
    assert res["feasible"] is True
    held = next(s for s in res["proposal"] if s["id"] == golden["editedSlotId"])
    assert held["start_d"] == golden["editedStart_d"]


def test_unknown_slots_are_rejected():
    bad = {
        "id": "BGW-99#1",
        "wellId": "BGW-99",
        "cycleNumber": 1,
        "start_d": 5,
        "injection_d": 10,
        "soak_d": 5,
        "rate_t_per_h": 5,
        "injectionTemperature_C": 280,
    }
    assert client.post("/schedules/check", json={"plan": [bad]}).status_code == 422


def _issued_plan():
    return client.get("/schedules/issued").json()


def test_a_slot_cannot_start_before_the_plan():
    """A negative start used to index past the oil curve and return a 500."""
    plan = _issued_plan()
    plan[0] = dict(plan[0], start_d=-1000)
    res = client.post("/schedules/check", json={"plan": plan})
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["body", "plan", 0, "start_d"]


def test_a_slot_can_be_deferred_past_the_horizon():
    plan = _issued_plan()
    plan[0] = dict(plan[0], start_d=500)
    assert client.post("/schedules/check", json={"plan": plan}).status_code == 200


def test_a_slot_listed_twice_is_rejected():
    plan = _issued_plan()
    res = client.post("/schedules/check", json={"plan": [*plan, plan[0]]})
    assert res.status_code == 422
    assert plan[0]["id"] in res.json()["detail"]


def test_a_slot_moved_to_another_well_is_rejected():
    plan = _issued_plan()
    other = next(s["wellId"] for s in plan if s["wellId"] != plan[0]["wellId"])
    plan[0] = dict(plan[0], wellId=other)
    res = client.post("/schedules/check", json={"plan": plan})
    assert res.status_code == 422
    assert f"{plan[0]['id']} belongs to" in res.json()["detail"]


def test_repair_rejects_a_pin_outside_the_plan():
    res = client.post("/schedules/repair", json={"plan": _issued_plan(), "pinned": ["BGW-99#1"]})
    assert res.status_code == 422
    assert "BGW-99#1" in res.json()["detail"]
