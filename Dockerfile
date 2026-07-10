# Universe Experience Platform — API + web client container.
# Multi-stage-friendly single image: builds the delivery payloads at start and
# serves the FastAPI app (which also serves the static web client).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# system deps for healpy / numpy wheels are bundled; keep image lean
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && groupadd --gid 10001 uep \
    && useradd --uid 10001 --gid uep --home-dir /app --no-create-home \
        --shell /usr/sbin/nologin uep \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY --chown=uep:uep . .

USER uep

# Build payloads at image build time (offline/sample fallback so builds are
# hermetic). Override at runtime with a live ingest if desired.
RUN python backend/pipeline.py --no-live --release "docker-build"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=4s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

# UEP_INGEST=live requires every archive and fails closed. Use
# UEP_INGEST=prefer-live to permit explicitly labelled fallbacks.
CMD ["sh", "-c", "set -e; if [ \"${UEP_INGEST:-sample}\" = live ]; then python backend/pipeline.py --strict-live; elif [ \"${UEP_INGEST:-sample}\" = prefer-live ]; then python backend/pipeline.py; fi; \
     exec uvicorn backend.api.server:app --host 0.0.0.0 --port 8000"]
