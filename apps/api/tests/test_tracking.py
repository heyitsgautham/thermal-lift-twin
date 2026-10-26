import pytest
import sentry_sdk
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from twin_api import __version__, data, tracking
from twin_api.main import app


class CaptureTransport(Transport):
    """Keeps events in memory instead of sending them anywhere."""

    def __init__(self, options=None):
        super().__init__(options)
        self.events = []

    def capture_envelope(self, envelope):
        event = envelope.get_event()
        if event is not None:
            self.events.append(event)


@pytest.fixture
def sentry_off():
    yield
    # Leave no live client behind for the other tests.
    sentry_sdk.get_client().close()
    sentry_sdk.init()


def test_tracking_stays_off_without_a_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    assert tracking.configure() is False
    assert calls == []


def test_dsn_from_the_environment_starts_the_sdk_without_pii(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "https://key@o0.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "ci")
    calls = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: calls.append(kw))
    assert tracking.configure() is True
    assert calls == [
        {
            "dsn": "https://key@o0.ingest.sentry.io/1",
            "environment": "ci",
            "release": f"thermal-lift-twin-api@{__version__}",
            "traces_sample_rate": 0.0,
            "send_default_pii": False,
        }
    ]


def test_an_unhandled_route_error_reaches_sentry_with_its_request_id(monkeypatch, sentry_off):
    transport = CaptureTransport()
    assert tracking.configure("https://key@o0.ingest.sentry.io/1", transport=transport)

    def broken():
        raise RuntimeError("field.json unreadable")

    monkeypatch.setattr(data, "field", broken)
    res = TestClient(app).get("/field", headers={"X-Request-ID": "trace-42"})
    sentry_sdk.flush()

    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error", "request_id": "trace-42"}
    [event] = transport.events
    assert event["logentry"]["message"] == "unhandled error"
    assert event["extra"]["request_id"] == "trace-42"
    assert event["exception"]["values"][-1]["value"] == "field.json unreadable"
    assert event["release"] == f"thermal-lift-twin-api@{__version__}"
