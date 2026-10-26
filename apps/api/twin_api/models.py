"""Request and response schemas for the HTTP routes.

FastAPI validates requests against these, filters responses through them, and
publishes both in the OpenAPI document at /docs.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field


class Slot(BaseModel):
    """One steam slot of a plan: which well, which cycle, when and how hard."""

    id: str
    wellId: str
    cycleNumber: int
    start_d: int
    injection_d: int
    soak_d: int
    rate_t_per_h: float
    injectionTemperature_C: float


class SlotIn(Slot):
    # Day 0 is the plan's first day. A slot can move past the horizon, which
    # defers it out of the window, but not before the plan starts.
    start_d: int = Field(ge=0)


class Capacity(BaseModel):
    units: int = Field(2, ge=1, le=4)
    unitCapacity_t_per_h: float = Field(12.0, gt=0)


# The issued plan holds one slot per steam well, and a plan may only use issued
# slots once each, so no valid request comes near these caps.
MAX_PLAN_SLOTS = 200


class PlanRequest(BaseModel):
    plan: list[SlotIn] = Field(max_length=MAX_PLAN_SLOTS)
    capacity: Capacity = Capacity()


class RepairRequest(PlanRequest):
    pinned: list[str] = Field(default_factory=list, max_length=MAX_PLAN_SLOTS)


class Health(BaseModel):
    status: Literal["ok", "unavailable"]
    data: Literal["synthetic"]
    datasets: dict[str, str] = Field(description='"ok" for each dataset file that loads, else the error that stopped it')


class WellSummary(BaseModel):
    id: str
    status: Literal["css", "cold", "shut-in", "observation"]
    completion: str
    location: dict[str, Any]
    fluid: dict[str, Any]


class PlanCheck(BaseModel):
    capacity_t_per_h: float
    load_t_per_h: list[float] = Field(description="Total generator load on each day of the window")
    overloadDays: list[int]
    fieldOil90_bbl: float
    steam90_t: float
    value_bbl: float
    sor90: float | None = Field(description="Steam-oil ratio of the cyclic-steam wells, null when they make no oil")


class BlockedOption(BaseModel):
    wellId: str
    slotId: str
    status: Literal["blocked"]
    reason: str


class ShiftOption(BaseModel):
    wellId: str
    slotId: str
    status: Literal["clears", "partial"]
    delta_d: int
    valueChange_bbl: float
    overloadDaysAfter: int


RepairOption = Annotated[BlockedOption | ShiftOption, Field(discriminator="status")]


class RepairMove(BaseModel):
    slotId: str
    wellId: str
    delta_d: int
    fromStart_d: int
    toStart_d: int
    valueChange_bbl: float
    oilChange_bbl: float


class RepairTotals(BaseModel):
    fieldOil90_bbl: float
    steam90_t: float
    value_bbl: float
    sor90: float | None


class RepairResult(BaseModel):
    proposal: list[Slot]
    moves: list[RepairMove]
    options: list[RepairOption] = Field(description="Every slot the first round tried, and what moving it would do")
    editedOverloadDays: list[int]
    feasible: bool
    testedShifts: int
    totals: RepairTotals
