# Build from the repository root: docker build -f apps/api/Dockerfile .
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.24 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    BGW_DATA_DIR=/app/data/demo \
    PATH="/app/apps/api/.venv/bin:$PATH"

WORKDIR /app/apps/api
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev

COPY apps/api/twin_api ./twin_api
COPY data/demo /app/data/demo

USER nobody
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
# The service logs each request as JSON itself, so uvicorn's access log is off.
CMD ["uvicorn", "twin_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
