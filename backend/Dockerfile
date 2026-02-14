# --- Build stage ---
FROM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /usr/local/bin/uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .

# --- Runtime stage ---
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /usr/local/bin/uv

WORKDIR /app

COPY --from=builder /app /app

ENV PATH="/app/.venv/bin:$PATH"

RUN groupadd -r app && useradd -r -g app app
USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
