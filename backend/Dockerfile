# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Install all deps (including heavy ones like sentence-transformers) in a
# full image, then copy only what's needed into the slim runtime image.
FROM python:3.12 AS builder

WORKDIR /build

# Install system deps needed to compile some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 1. Update pip and install heavy ML deps first (stable layer)
# This layer will ONLY rebuild if these version numbers change
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --prefix=/install \
        torch==2.11.0 \
        transformers==5.4.0 \
        sentence-transformers==5.3.0 \
        --extra-index-url https://download.pytorch.org/whl/cpu

# 2. Copy and install remaining deps
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --prefix=/install -r requirements.txt \
        --extra-index-url https://download.pytorch.org/whl/cpu


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12

WORKDIR /app

# Runtime system deps only (libpq for asyncpg, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app/ ./app/
COPY alembic.ini .

# Create directories that will be mounted as volumes
RUN mkdir -p uploads .chroma

# Non-root user for security
RUN useradd -m -u 1001 talk2doc \
 && chown -R talk2doc:talk2doc /app
USER talk2doc

EXPOSE 8000

# Run Alembic migrations then start uvicorn
# Using sh -c so we can chain commands
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
