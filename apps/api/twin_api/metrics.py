"""Prometheus metrics for the service, served at GET /metrics.

Requests are labelled by route template, such as /wells/{well_id}, rather than
the raw path, so the number of series stays fixed whatever ids callers send.
"""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest

# A registry of our own keeps the default process collectors out and lets tests read it.
REGISTRY = CollectorRegistry()

REQUESTS = Counter(
    "twin_api_requests_total",
    "HTTP requests by method, route template and status code.",
    ["method", "route", "status"],
    registry=REGISTRY,
)
LATENCY = Histogram(
    "twin_api_request_duration_seconds",
    "HTTP request duration by method and route template.",
    ["method", "route"],
    registry=REGISTRY,
)

UNMATCHED = "unmatched"
CONTENT_TYPE = CONTENT_TYPE_LATEST


def observe(method: str, route: str, status: int, seconds: float) -> None:
    REQUESTS.labels(method, route, str(status)).inc()
    LATENCY.labels(method, route).observe(seconds)


def render() -> bytes:
    return generate_latest(REGISTRY)
