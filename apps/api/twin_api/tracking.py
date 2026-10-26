"""Optional error tracking with Sentry.

Set SENTRY_DSN to send unhandled errors to a Sentry project. Without it the
service runs exactly as before and sends nothing. Every `log.exception` and
`log.error` becomes a Sentry event through the SDK's logging integration, so
the middleware's "unhandled error" line, with its request id, is what arrives.
"""

from __future__ import annotations

import os
from typing import Any

import sentry_sdk

from . import __version__


def configure(dsn: str | None = None, **options: Any) -> bool:
    """Start the Sentry SDK if a DSN is set. Returns whether tracking is on."""
    dsn = dsn if dsn is not None else os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "development"),
        release=f"thermal-lift-twin-api@{__version__}",
        # Errors only: no performance tracing, and no request bodies, cookies or client IPs.
        traces_sample_rate=0.0,
        send_default_pii=False,
        **options,
    )
    return True
