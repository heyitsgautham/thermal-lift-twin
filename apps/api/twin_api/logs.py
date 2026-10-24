"""JSON logging: one object per line on stderr, so a log shipper can parse it.

Fields passed through `extra=` land as top-level keys next to ts, level,
logger and msg. LOG_LEVEL sets the level, INFO by default.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime

# Attributes every LogRecord has. Anything else on a record came from `extra=`.
_STANDARD = set(vars(logging.LogRecord("", 0, "", 0, "", None, None))) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        out.update({k: v for k, v in vars(record).items() if k not in _STANDARD})
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def configure(level: str | None = None) -> None:
    """Send the service's loggers to stderr as JSON. Safe to call more than once."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("twin_api")
    logger.handlers[:] = [handler]
    logger.setLevel((level or os.environ.get("LOG_LEVEL") or "INFO").upper())
