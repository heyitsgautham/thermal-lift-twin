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

DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"
# A blank BGW_DATA_DIR counts as unset. Path("") is the working directory, which never holds the dataset.
DATA_DIR = Path(os.environ.get("BGW_DATA_DIR", "").strip() or DEFAULT_DATA_DIR)


@lru_cache(maxsize=1)
def field() -> dict[str, Any]:
    return json.loads((DATA_DIR / "field.json").read_text())


@lru_cache(maxsize=1)
def tables() -> dict[str, Any]:
    return json.loads((DATA_DIR / "tables.json").read_text())


@lru_cache(maxsize=1)
def daily():
    return pq.read_table(DATA_DIR / "daily.parquet")


FILES = {"field": (field, "field.json"), "tables": (tables, "tables.json"), "daily": (daily, "daily.parquet")}


def status() -> dict[str, str]:
    """Load each dataset file and report "ok", or the error that stopped it.

    The loaders cache only a successful load, so a file that appears or is
    fixed after start-up reads as "ok" on the next check.
    """
    out = {}
    for name, (load, filename) in FILES.items():
        try:
            load()
            out[name] = "ok"
        except Exception as exc:  # any load failure makes the service unready
            out[name] = f"{type(exc).__name__} reading {filename}"
    return out


def reset() -> None:
    """Drop the cached datasets so the next request reads the files again."""
    for load, _ in FILES.values():
        load.cache_clear()


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
