from fastapi.testclient import TestClient

from twin_api import metrics
from twin_api.main import app

client = TestClient(app)


def _count(method: str, route: str, status: str) -> float:
    return metrics.REGISTRY.get_sample_value("twin_api_requests_total", {"method": method, "route": route, "status": status}) or 0.0


def test_requests_are_counted_by_route_template_not_raw_path():
    before = _count("GET", "/wells/{well_id}", "200")
    client.get("/wells/BGW-14")
    client.get("/wells/BGW-22")
    assert _count("GET", "/wells/{well_id}", "200") == before + 2


def test_errors_are_counted_with_their_status():
    before = _count("GET", "/wells/{well_id}", "404")
    client.get("/wells/BGW-99")
    assert _count("GET", "/wells/{well_id}", "404") == before + 1


def test_paths_with_no_route_share_one_label():
    before = _count("GET", metrics.UNMATCHED, "404")
    client.get("/no/such/path")
    client.get("/another/missing/path")
    assert _count("GET", metrics.UNMATCHED, "404") == before + 2


def test_durations_land_in_the_histogram():
    labels = {"method": "GET", "route": "/health"}
    before = metrics.REGISTRY.get_sample_value("twin_api_request_duration_seconds_count", labels) or 0.0
    client.get("/health")
    assert metrics.REGISTRY.get_sample_value("twin_api_request_duration_seconds_count", labels) == before + 1


def test_metrics_endpoint_serves_the_prometheus_text_format():
    client.get("/health")
    res = client.get("/metrics")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/plain")
    assert 'twin_api_requests_total{method="GET",route="/health",status="200"}' in res.text
    assert "# TYPE twin_api_request_duration_seconds histogram" in res.text
