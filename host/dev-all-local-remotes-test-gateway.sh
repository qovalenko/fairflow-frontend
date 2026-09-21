#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "${HOST_DIR}/.." && pwd)"

MODULES=(
  contacts
  companies
  deals
  orders
  activities
  products
  reports
  documents
  automation
  statistics
)

PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

MAX_PARALLEL=4

# Step 1: build all remotes (vite-plugin-federation only generates remoteEntry.js at build time)
echo "=== Building remotes (up to ${MAX_PARALLEL} in parallel) ==="
running=0
for module in "${MODULES[@]}"; do
  echo "  [build] ${module}"
  (cd "${FRONTEND_DIR}/modules/${module}" && npm run build) &
  running=$((running + 1))
  if [ "$running" -ge "$MAX_PARALLEL" ]; then
    wait -n 2>/dev/null || wait
    running=$((running - 1))
  fi
done
wait
echo "=== All remotes built ==="

# Step 2: start vite preview for each remote (serves built remoteEntry.js)
echo "=== Starting preview servers ==="
for module in "${MODULES[@]}"; do
  echo "  [preview] ${module}"
  (cd "${FRONTEND_DIR}/modules/${module}" && npm run preview) &
  PIDS+=("$!")
done

sleep 2

# Step 3: start host in dev mode with API proxy to test gateway
echo "=== Starting host (API proxy -> https://stand.example.com) ==="
cd "${HOST_DIR}"
unset VITE_REMOTES_BASE_URL
export VITE_API_PROXY_TARGET="https://stand.example.com"
export VITE_AUTH_PERSIST_STRATEGY="localStorage"
export VITE_API_PREFIX="/api"
npm run dev
