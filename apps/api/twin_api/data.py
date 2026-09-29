"""Loads the demo dataset written by `pnpm gen`.

field.json holds wells, cycles, the issued plan, health and assumptions.
tables.json holds each cycle's daily oil curve, so the scheduler here uses
exactly the physics the TypeScript twin computed. daily.parquet holds the
eight-year daily history.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import pyarrow.compute as pc
import pyarrow.parquet as pq

DATA_DIR = Path(os.environ.get("BGW_DATA_DIR", Path(__file__).resolve().parents[3] / "data" / "demo"))


@lru_cache(maxsize=1)
def field() -> dict[str, Any]:
    return json.loads((DATA_DIR / "field.json").read_text())


@lru_cache(maxsize=1)
def tables() -> dict[str, Any]:
    return json.loads((DATA_DIR / "tables.json").read_text())


@lru_cache(maxsize=1)
def daily():
    return pq.read_table(DATA_DIR / "daily.parquet")


def well(well_id: str) -> dict[str, Any] | None:
    return next((w for w in field()["wells"] if w["id"] == well_id), None)


def telemetry(well_id: str, date_from: str | None, date_to: str | None) -> list[dict[str, Any]]:
    table = daily()
    mask = pc.equal(table["well_id"], well_id)
    if date_from:
        mask = pc.and_(mask, pc.greater_equal(table["date"], date_from))
    if date_to:
        mask = pc.and_(mask, pc.less_equal(table["date"], date_to))
    return table.filter(mask).to_pylist()
