"""HTTP routes. Run with `uvicorn twin_api.main:app` from apps/api."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import data
from .schedule import Scheduler, repair

app = FastAPI(
    title="Thermal Lift Twin API",
    version="0.1.0",
    description="Seeded synthetic heavy-oil field: wells, cycles, telemetry, failures, schedules, and the generator repair.",
)

_scheduler: Scheduler | None = None


def scheduler() -> Scheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler(data.tables())
    return _scheduler


class SlotIn(BaseModel):
    id: str
    wellId: str
    cycleNumber: int
    start_d: int
    injection_d: int
    soak_d: int
    rate_t_per_h: float
    injectionTemperature_C: float


class Capacity(BaseModel):
    units: int = Field(2, ge=1, le=4)
    unitCapacity_t_per_h: float = Field(12.0, gt=0)


class PlanRequest(BaseModel):
    plan: list[SlotIn]
    capacity: Capacity = Capacity()


class RepairRequest(PlanRequest):
    pinned: list[str] = []


def _plan(req: PlanRequest) -> list[dict[str, Any]]:
    known = scheduler().slot_table
    unknown = [s.id for s in req.plan if s.id not in known]
    if unknown:
        raise HTTPException(422, f"Unknown slots {unknown}. Slots must come from the issued plan; move them by changing start_d.")
    return [s.model_dump() for s in req.plan]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "data": "synthetic"}


@app.get("/field")
def field_summary() -> dict[str, Any]:
    f = data.field()
    return {"meta": f["meta"], "field": f["field"], "assumptions": f["assumptions"], "history": f["history"]}


@app.get("/wells")
def wells() -> list[dict[str, Any]]:
    return [
        {"id": w["id"], "status": w["status"], "completion": w["completion"], "location": w["location"], "fluid": w["fluid"]}
        for w in data.field()["wells"]
    ]


@app.get("/wells/{well_id}")
def well(well_id: str) -> dict[str, Any]:
    w = data.well(well_id)
    if w is None:
        raise HTTPException(404, f"No well {well_id}")
    return w


@app.get("/wells/{well_id}/cycles")
def cycles(well_id: str) -> list[dict[str, Any]]:
    if data.well(well_id) is None:
        raise HTTPException(404, f"No well {well_id}")
    return [c for c in data.field()["cycles"] if c["wellId"] == well_id]


@app.get("/wells/{well_id}/telemetry")
def telemetry(well_id: str, date_from: str | None = None, date_to: str | None = None) -> list[dict[str, Any]]:
    if data.well(well_id) is None:
        raise HTTPException(404, f"No well {well_id}")
    return data.telemetry(well_id, date_from, date_to)


@app.get("/wells/{well_id}/health")
def health_record(well_id: str) -> dict[str, Any]:
    rec = next((h for h in data.field()["health"] if h["wellId"] == well_id), None)
    if rec is None:
        raise HTTPException(404, f"No health record for {well_id}")
    return rec


@app.get("/failures")
def failures() -> list[dict[str, Any]]:
    return data.field()["failures"]


@app.get("/schedules/issued")
def issued() -> list[dict[str, Any]]:
    return data.field()["issuedPlan"]


@app.post("/schedules/check")
def check(req: PlanRequest) -> dict[str, Any]:
    cap = req.capacity.units * req.capacity.unitCapacity_t_per_h
    ev = scheduler().evaluate(_plan(req), cap)
    return {
        "capacity_t_per_h": cap,
        "load_t_per_h": ev.load,
        "overloadDays": ev.overload_days,
        "fieldOil90_bbl": ev.field_oil,
        "steam90_t": ev.steam_t,
        "value_bbl": ev.value,
        "sor90": (ev.steam_t * 6.289811 / ev.css_oil) if ev.css_oil > 0 else None,
    }


@app.post("/schedules/repair")
def repair_plan(req: RepairRequest) -> dict[str, Any]:
    cap = req.capacity.units * req.capacity.unitCapacity_t_per_h
    return repair(scheduler(), _plan(req), set(req.pinned), cap)
