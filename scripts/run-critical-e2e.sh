#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${E2E_API_BASE_URL:-http://127.0.0.1:3002}"
APP_URL="${E2E_BASE_URL:-http://127.0.0.1:5003}"
BACKEND_LOG="${ROOT_DIR}/.tmp-e2e-backend.log"
FRONTEND_LOG="${ROOT_DIR}/.tmp-e2e-frontend.log"
STARTED_BACKEND=0
STARTED_FRONTEND=0
BACKEND_PID=""
FRONTEND_PID=""

extract_host() {
  python3 - "$1" <<'PY'
from urllib.parse import urlparse
import sys
print(urlparse(sys.argv[1]).hostname or '')
PY
}

extract_port() {
  python3 - "$1" <<'PY'
from urllib.parse import urlparse
import sys
parsed = urlparse(sys.argv[1])
print(parsed.port or '')
PY
}

is_local_url() {
  local host
  host="$(extract_host "$1")"
  [[ "$host" == "127.0.0.1" || "$host" == "localhost" ]]
}

wait_for_url() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[critical-e2e] ${label} did not become ready: ${url}" >&2
  return 1
}

cleanup() {
  if [[ -n "${FRONTEND_PID}" ]]; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if ! curl -fsS "${API_URL}/api/health" >/dev/null 2>&1; then
  if ! is_local_url "${API_URL}"; then
    echo "[critical-e2e] API not reachable and E2E_API_BASE_URL is not local: ${API_URL}" >&2
    exit 1
  fi

  API_PORT="$(extract_port "${API_URL}")"
  API_PORT="${API_PORT:-3002}"
  echo "[critical-e2e] Starting backend on port ${API_PORT}"
  PORT="${API_PORT}" npm --prefix "${ROOT_DIR}/backend" run dev >"${BACKEND_LOG}" 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND=1
  wait_for_url "${API_URL}/api/health" "backend" || {
    cat "${BACKEND_LOG}" >&2
    exit 1
  }
fi

if ! curl -fsS "${APP_URL}/" >/dev/null 2>&1; then
  if ! is_local_url "${APP_URL}"; then
    echo "[critical-e2e] Frontend not reachable and E2E_BASE_URL is not local: ${APP_URL}" >&2
    exit 1
  fi

  APP_PORT="$(extract_port "${APP_URL}")"
  APP_PORT="${APP_PORT:-5003}"
  echo "[critical-e2e] Starting frontend on port ${APP_PORT}"
  E2E_API_BASE_URL="${API_URL}" npm --prefix "${ROOT_DIR}/app" run dev -- --host 127.0.0.1 --port "${APP_PORT}" >"${FRONTEND_LOG}" 2>&1 &
  FRONTEND_PID=$!
  STARTED_FRONTEND=1
  wait_for_url "${APP_URL}/" "frontend" || {
    cat "${FRONTEND_LOG}" >&2
    exit 1
  }
fi

if [[ "${STARTED_BACKEND}" == "1" ]]; then
  echo "[critical-e2e] Backend started for this run"
fi
if [[ "${STARTED_FRONTEND}" == "1" ]]; then
  echo "[critical-e2e] Frontend started for this run"
fi

cd "${ROOT_DIR}"
exec bash scripts/e2e.sh \
  tests/e2e/smoke.spec.ts \
  tests/e2e/ai-fallback.spec.ts \
  tests/e2e/low-network.spec.ts \
  tests/e2e/dashboard-status-regression.spec.ts \
  --reporter=list
