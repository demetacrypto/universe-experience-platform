#!/usr/bin/env bash
# One-command demo: bootstrap venv -> ingest -> curate -> deliver -> serve.
set -euo pipefail
cd "$(dirname "$0")/.."

VENV=".venv"
PORT="${PORT:-8000}"

echo "==> Creating an isolated virtual environment in ./${VENV}"
# A dedicated venv avoids conda/Homebrew/system-Python conflicts and the
# PEP 668 "externally-managed-environment" error entirely.
if [ ! -d "$VENV" ]; then
  python3 -m venv "$VENV"
fi
PY="$VENV/bin/python"

echo "==> Installing backend dependencies into ${VENV}"
"$PY" -m pip install --upgrade pip -q
"$PY" -m pip install -r backend/requirements.txt

echo "==> Running ingestion pipeline (live Gaia DR3, sample fallback)"
"$PY" backend/pipeline.py --release "DR3-$(date +%Y.%m.%d)"

echo "==> Verifying delivery data exists"
test -f data/delivery/scene.json && echo "    scene.json OK ($(wc -c < data/delivery/scene.json) bytes)" \
  || { echo "    ERROR: data/delivery/scene.json missing"; exit 1; }

echo "==> Running QA harness"
"$PY" -m pytest tests/ -q

echo "==> Freeing port ${PORT} if a stale server is holding it"
lsof -ti "tcp:${PORT}" | xargs kill -9 2>/dev/null || true

echo "==> Starting API + web client at http://127.0.0.1:${PORT}  (Ctrl-C to stop)"
"$PY" -m uvicorn backend.api.server:app --host 127.0.0.1 --port "${PORT}"
