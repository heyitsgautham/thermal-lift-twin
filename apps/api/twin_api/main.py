"""HTTP routes. Run with `uvicorn twin_api.main:app` from apps/api."""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections import Counter
from collections.abc import Awaitable, Callable
from datetime import date
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from . import __version__, data, logs, metrics, tracking
from .models import Health, PlanCheck, PlanRequest, RepairRequest, RepairResult, WellSummary
from .schedule import Scheduler, repair

logs.configure()
tracking.configure()
log = logging.getLogger("twin_api.http")

# A caller's X-Request-ID is echoed and logged only if it is short and plain,
# so it cannot inject fake fields or lines into the log.
_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")

app = FastAPI(
    title="Thermal Lift Twin API",
    version=__version__,
    description="Seeded synthetic heavy-oil field: wells, cycles, telemetry, failures, schedules, and the generator repair.",
)


# A full plan is one slot per issued slot, a few kilobytes. Anything that
# declares far more is refused before the body is read or parsed.
MAX_BODY_BYTES = 256 * 1024


@app.middleware("http")
async def limit_body(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return JSONResponse({"detail": f"Request body over {MAX_BODY_BYTES} bytes"}, status_code=413)
    return await call_next(request)


@app.middleware("http")
async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    given = request.headers.get("x-request-id", "")
    request_id = given if _REQUEST_ID.fullmatch(given) else uuid.uuid4().hex
    request.state.request_id = request_id
    context = {"request_id": request_id, "method": request.method, "path": request.url.path}
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error", extra=context)
        response = JSONResponse({"detail": "Internal server error", "request_id": request_id}, status_code=500)
    response.headers["x-request-id"] = request_id
    seconds = time.perf_counter() - start
    route = getattr(request.scope.get("route"), "path", metrics.UNMATCHED)
    metrics.observe(request.method, route, response.status_code, seconds)
    log.info("request", extra={**context, "route": route, "status": response.status_code, "duration_ms": round(seconds * 1000, 1)})
    return response


@app.exception_handler(RequestValidationError)
async def log_validation_error(request: Request, exc: RequestValidationError) -> Response:
    errors = [{"loc": list(e["loc"]), "type": e["type"]} for e in exc.errors()]
    log.warning(
        "validation failed",
        extra={"request_id": getattr(request.state, "request_id", None), "path": request.url.path, "errors": errors},
    )
    return await request_validation_exception_handler(request, exc)


_scheduler: Scheduler | None = None


def scheduler() -> Scheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler(data.tables())
    return _scheduler


def _plan(req: PlanRequest) -> list[dict[str, Any]]:
    sched = scheduler()
    unknown = [s.id for s in req.plan if s.id not in sched.slot_table]
    if unknown:
        raise HTTPException(422, f"Unknown slots {unknown}. Slots must come from the issued plan; move them by changing start_d.")
    repeated = sorted(slot_id for slot_id, n in Counter(s.id for s in req.plan).items() if n > 1)
    if repeated:
        raise HTTPException(422, f"Slots {repeated} appear more than once. Each issued slot can be scheduled once.")
    misplaced = [f"{s.id} belongs to {sched.slot_well[s.id]}" for s in req.plan if s.wellId != sched.slot_well[s.id]]
    if misplaced:
        raise HTTPException(422, f"Slots on the wrong well: {', '.join(misplaced)}.")
    return [s.model_dump() for s in req.plan]


@app.get("/health", response_model=Health, responses={503: {"model": Health, "description": "A dataset file is missing or unreadable"}})
def health() -> JSONResponse:
    """Ready when all three dataset files load. Docker's healthcheck polls this."""
    datasets = data.status()
    ready = all(v == "ok" for v in datasets.values())
    if not ready:
        log.warning("dataset unavailable", extra={"datasets": datasets})
    body = {"status": "ok" if ready else "unavailable", "data": "synthetic", "datasets": datasets}
    return JSONResponse(body, status_code=200 if ready else 503)


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics() -> Response:
    return Response(metrics.render(), media_type=metrics.CONTENT_TYPE)


@app.get("/field")
def field_summary() -> dict[str, Any]:
    f = data.field()
    return {"meta": f["meta"], "field": f["field"], "assumptions": f["assumptions"], "history": f["history"]}


@app.get("/wells", response_model=list[WellSummary])
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
def telemetry(well_id: str, date_from: date | None = None, date_to: date | None = None) -> list[dict[str, Any]]:
    if data.well(well_id) is None:
        raise HTTPException(404, f"No well {well_id}")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, f"date_from {date_from} is after date_to {date_to}")
    # The parquet stores dates as ISO strings, which compare in date order.
    return data.telemetry(well_id, date_from.isoformat() if date_from else None, date_to.isoformat() if date_to else None)


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


@app.post("/schedules/check", response_model=PlanCheck)
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


@app.post("/schedules/repair", response_model=RepairResult)
def repair_plan(req: RepairRequest) -> dict[str, Any]:
    cap = req.capacity.units * req.capacity.unitCapacity_t_per_h
    plan = _plan(req)
    in_plan = {s["id"] for s in plan}
    stray = [p for p in req.pinned if p not in in_plan]
    if stray:
        raise HTTPException(422, f"Pinned slots {stray} are not in the plan.")
    return repair(scheduler(), plan, set(req.pinned), cap)
