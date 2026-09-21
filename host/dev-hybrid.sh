#!/usr/bin/env bash
# Usage: ./dev-hybrid.sh [module ...]
#   ./dev-hybrid.sh contacts          — contacts local, rest from test
#   ./dev-hybrid.sh contacts deals    — contacts + deals local, rest from test
#   ./dev-hybrid.sh                   — all remotes from test (host-only dev)
#
# Host always runs locally with API proxied to https://stand.example.com
set -euo pipefail

# T-028: local remotes here are BUILT then previewed (not `vite dev`), so the
# data-qa-id flag must be forced on for their prod-mode build too. The host runs
# `vite dev` (mode=development) and already gets qa-ids regardless.
export VITE_QA_IDS=true

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "${HOST_DIR}/.." && pwd)"

LOCAL_MODULES=("$@")

PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

if [ ${#LOCAL_MODULES[@]} -gt 0 ]; then
  echo "=== Building local remotes: ${LOCAL_MODULES[*]} ==="
  for module in "${LOCAL_MODULES[@]}"; do
    module_dir="${FRONTEND_DIR}/modules/${module}"
    if [ ! -d "$module_dir" ]; then
      echo "ERROR: module '${module}' not found at ${module_dir}" >&2
      exit 1
    fi
    echo "  [build] ${module}"
    (cd "$module_dir" && npm run build)
  done

  echo "=== Starting preview servers ==="
  for module in "${LOCAL_MODULES[@]}"; do
    echo "  [preview] ${module}"
    (cd "${FRONTEND_DIR}/modules/${module}" && npm run preview) &
    PIDS+=("$!")
  done
  sleep 2
fi

LOCAL_CSV="$(IFS=,; echo "${LOCAL_MODULES[*]:-}")"

echo "=== Starting host ==="
echo "  Local remotes : ${LOCAL_CSV:-none}"
echo "  Other remotes : https://stand.example.com"
echo "  API proxy     : https://stand.example.com"

cd "${HOST_DIR}"
export VITE_REMOTES_BASE_URL="https://stand.example.com/frontend/main"
export VITE_LOCAL_REMOTES="${LOCAL_CSV}"
export VITE_API_PROXY_TARGET="https://stand.example.com"
export VITE_AUTH_PERSIST_STRATEGY="localStorage"
export VITE_API_PREFIX="/api"

npm run dev
