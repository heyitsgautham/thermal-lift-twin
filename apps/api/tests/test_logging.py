import json
import logging
import sys

import pytest
from fastapi.testclient import TestClient

from twin_api import data, logs
from twin_api.main import app

client = TestClient(app)


def _records(caplog: pytest.LogCaptureFixture, message: str) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "twin_api.http" and r.getMessage() == message]


def test_formatter_writes_one_json_object_with_extras():
    record = logging.LogRecord("twin_api.http", logging.INFO, __file__, 1, "request", None, None)
    record.status = 200
    record.path = "/health"
    out = json.loads(logs.JsonFormatter().format(record))
    assert out["level"] == "info"
    assert out["logger"] == "twin_api.http"
    assert out["msg"] == "request"
    assert out["status"] == 200
    assert out["path"] == "/health"
    assert out["ts"].endswith("+00:00")


def test_formatter_includes_the_traceback():
    try:
        raise ValueError("boom")
    except ValueError:
        record = logging.LogRecord("twin_api", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    out = json.loads(logs.JsonFormatter().format(record))
    assert "ValueError: boom" in out["exc"]


def test_configure_reads_the_level_from_the_environment(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LOG_LEVEL", "warning")
    logs.configure()
    try:
        logger = logging.getLogger("twin_api")
        assert logger.level == logging.WARNING
        assert len(logger.handlers) == 1
    finally:
        logs.configure("INFO")


def test_every_request_is_logged_with_its_status_and_duration(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.INFO, logger="twin_api"):
        res = client.get("/wells/BGW-99")
    assert res.status_code == 404
    (rec,) = _records(caplog, "request")
    assert (rec.method, rec.path, rec.status) == ("GET", "/wells/BGW-99", 404)
    assert rec.duration_ms >= 0
    assert rec.request_id == res.headers["x-request-id"]


def test_a_plain_request_id_is_echoed_back():
    res = client.get("/health", headers={"X-Request-ID": "trace-42"})
    assert res.headers["x-request-id"] == "trace-42"


def test_a_request_id_that_could_forge_log_lines_is_replaced():
    res = client.get("/health", headers={"X-Request-ID": 'x" "level": "error'})
    assert res.headers["x-request-id"] != 'x" "level": "error'
    assert len(res.headers["x-request-id"]) == 32


def test_validation_errors_are_logged_with_their_fields(caplog: pytest.LogCaptureFixture):
    with caplog.at_level(logging.INFO, logger="twin_api"):
        res = client.get("/wells/BGW-14/telemetry", params={"date_to": "soon"})
    assert res.status_code == 422
    (rec,) = _records(caplog, "validation failed")
    assert rec.levelno == logging.WARNING
    assert rec.errors == [{"loc": ["query", "date_to"], "type": "date_from_datetime_parsing"}]


def test_an_unhandled_error_returns_a_500_that_names_the_request(caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch):
    def broken() -> dict:
        raise RuntimeError("field.json is unreadable")

    monkeypatch.setattr(data, "field", broken)
    with caplog.at_level(logging.INFO, logger="twin_api"):
        res = client.get("/field")
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error", "request_id": res.headers["x-request-id"]}
    (rec,) = _records(caplog, "unhandled error")
    assert rec.exc_info is not None
    assert str(rec.exc_info[1]) == "field.json is unreadable"
