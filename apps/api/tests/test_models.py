"""The response schemas: what /docs publishes, and that filtering through them changes no response."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from twin_api import data
from twin_api.main import app, scheduler
from twin_api.schedule import repair

client = TestClient(app)


def _demo_edit() -> tuple[list[dict[str, Any]], str]:
    """The story's edit: BGW-14's slot dragged to its re-steam day, which overloads the generators."""
    golden = data.tables()["golden"]
    plan = [dict(s, start_d=golden["editedStart_d"]) if s["id"] == golden["editedSlotId"] else s for s in data.tables()["issuedPlan"]]
    return plan, golden["editedSlotId"]


@pytest.mark.parametrize(
    ("path", "method", "schema"),
    [
        ("/health", "get", "Health"),
        ("/schedules/check", "post", "PlanCheck"),
        ("/schedules/repair", "post", "RepairResult"),
    ],
)
def test_openapi_names_each_response_schema(path: str, method: str, schema: str) -> None:
    spec = client.get("/openapi.json").json()
    ok = spec["paths"][path][method]["responses"]["200"]["content"]["application/json"]["schema"]
    assert ok == {"$ref": f"#/components/schemas/{schema}"}


def test_openapi_documents_the_unready_health_answer() -> None:
    spec = client.get("/openapi.json").json()
    unready = spec["paths"]["/health"]["get"]["responses"]["503"]
    assert unready["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/Health"}


def test_wells_list_items_follow_the_summary_schema() -> None:
    spec = client.get("/openapi.json").json()
    items = spec["paths"]["/wells"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["items"]
    assert items == {"$ref": "#/components/schemas/WellSummary"}
    assert {w["status"] for w in client.get("/wells").json()} == {"css", "cold", "shut-in", "observation"}


def test_repair_response_is_exactly_what_the_scheduler_returned() -> None:
    plan, pinned = _demo_edit()
    direct = repair(scheduler(), plan, {pinned}, 24.0)
    res = client.post("/schedules/repair", json={"plan": plan, "pinned": [pinned]})
    assert res.status_code == 200
    assert res.json() == direct
    statuses = {o["status"] for o in direct["options"]}
    assert "blocked" in statuses
    assert statuses & {"clears", "partial"}


def test_check_response_is_exactly_what_the_route_computed() -> None:
    plan, _ = _demo_edit()
    res = client.post("/schedules/check", json={"plan": plan}).json()
    ev = scheduler().evaluate(plan, 24.0)
    assert res["load_t_per_h"] == ev.load
    assert res["overloadDays"] == ev.overload_days
    assert set(res) == {"capacity_t_per_h", "load_t_per_h", "overloadDays", "fieldOil90_bbl", "steam90_t", "value_bbl", "sor90"}
