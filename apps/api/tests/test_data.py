import importlib
import json

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from twin_api import data


def test_files_load_once():
    assert data.field() is data.field()
    assert data.tables() is data.tables()


def test_well_lookup():
    assert data.well("BGW-14")["id"] == "BGW-14"
    assert data.well("BGW-99") is None


def test_telemetry_filters_by_well_and_inclusive_dates():
    rows = data.telemetry("BGW-14", "2026-09-01", "2026-09-05")
    assert {r["well_id"] for r in rows} == {"BGW-14"}
    assert [r["date"] for r in rows] == [f"2026-09-0{d}" for d in range(1, 6)]


def test_telemetry_without_dates_returns_the_whole_history():
    rows = data.telemetry("BGW-14", None, None)
    dates = [r["date"] for r in rows]
    assert dates == sorted(dates)
    assert dates[-1] == "2026-09-27"
    assert len(rows) == len(set(dates)) > 2000


@pytest.fixture
def tiny_data_dir(tmp_path, monkeypatch):
    (tmp_path / "field.json").write_text(json.dumps({"wells": [{"id": "W-1"}]}))
    (tmp_path / "tables.json").write_text("{}")
    daily = pa.table({"well_id": ["W-1", "W-1", "W-2"], "date": ["2026-01-01", "2026-01-02", "2026-01-01"]})
    pq.write_table(daily, tmp_path / "daily.parquet")
    monkeypatch.setenv("BGW_DATA_DIR", str(tmp_path))
    yield importlib.reload(data)
    monkeypatch.delenv("BGW_DATA_DIR")
    importlib.reload(data)


def test_bgw_data_dir_points_the_service_at_another_dataset(tiny_data_dir, tmp_path):
    assert tiny_data_dir.DATA_DIR == tmp_path
    assert tiny_data_dir.well("W-1") == {"id": "W-1"}
    assert [r["date"] for r in tiny_data_dir.telemetry("W-1", "2026-01-02", None)] == ["2026-01-02"]


@pytest.fixture
def empty_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(data, "DATA_DIR", tmp_path)
    data.reset()
    yield tmp_path
    monkeypatch.undo()
    data.reset()


def test_status_is_ok_for_the_demo_dataset():
    assert data.status() == {"field": "ok", "tables": "ok", "daily": "ok"}


def test_status_names_each_missing_file(empty_data_dir):
    assert data.status() == {
        "field": "FileNotFoundError reading field.json",
        "tables": "FileNotFoundError reading tables.json",
        "daily": "FileNotFoundError reading daily.parquet",
    }


def test_status_reports_a_corrupt_file(empty_data_dir):
    (empty_data_dir / "field.json").write_text("{not json")
    assert data.status()["field"] == "JSONDecodeError reading field.json"


def test_status_recovers_once_the_file_appears(empty_data_dir):
    assert data.status()["tables"] != "ok"
    (empty_data_dir / "tables.json").write_text("{}")
    assert data.status()["tables"] == "ok"
