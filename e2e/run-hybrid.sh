#!/usr/bin/env bash
#
# run-hybrid.sh — start the local hybrid (host `vite dev` + selected remotes with
# data-qa-id) pointed at the stand stand, run a command against it, tear down.
#
#   ./run-hybrid.sh                     # -> runs `npx playwright test`
#   ./run-hybrid.sh npx playwright test tests/04-create-contact.spec.ts
#   HYBRID_REMOTES=products ./run-hybrid.sh npx playwright test tests/10-products-nav-list.spec.ts
#   HYBRID_REMOTES="contacts activities" ./run-hybrid.sh npx playwright test tests/06-activities-list-p0.spec.ts
#   HYBRID_REMOTES="documents deals orders" ./run-hybrid.sh npx playwright test tests/12-documents-tab-generate.spec.ts
#   HYBRID_REMOTES=reports ./run-hybrid.sh npx playwright test tests/10-reports-nav-tabs.spec.ts
#   HYBRID_REMOTES=automation ./run-hybrid.sh npx playwright test tests/06-automation-states.spec.ts
#   HYBRID_REMOTES=statistics ./run-hybrid.sh npx playwright test tests/06-statistics-navigation.spec.ts
#   HYBRID_REMOTES=search ./run-hybrid.sh npx playwright test tests/10-search-dialog-p0.spec.ts
#   HYBRID_REMOTES=chat ./run-hybrid.sh npx playwright test tests/06-chat-send-message.spec.ts
#
# Search/chat e2e specs need the search/chat remote built locally (qa-ids on results/settings UI).
#
# Why a bespoke runner (not host/dev-hybrid.sh): dev-hybrid.sh hardcodes the API
# target to stand.example.com (currently API-less) — this one targets the stand, uses
# the stand's per-MF manifest for non-local remotes, and forces qa-ids on.
#
# Port convention is shared between devs, so the whole run holds a flock.
set -euo pipefail

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "${E2E_DIR}/.." && pwd)"
HOST_DIR="${FRONTEND_DIR}/host"
SEARCH_DIR="${FRONTEND_DIR}/modules/search"
CONTACTS_DIR="${FRONTEND_DIR}/modules/contacts"
DEALS_DIR="${FRONTEND_DIR}/modules/deals"
COMPANIES_DIR="${FRONTEND_DIR}/modules/companies"
ORDERS_DIR="${FRONTEND_DIR}/modules/orders"
PRODUCTS_DIR="${FRONTEND_DIR}/modules/products"
ACTIVITIES_DIR="${FRONTEND_DIR}/modules/activities"
DOCUMENTS_DIR="${FRONTEND_DIR}/modules/documents"
REPORTS_DIR="${FRONTEND_DIR}/modules/reports"
AUTOMATION_DIR="${FRONTEND_DIR}/modules/automation"
STATISTICS_DIR="${FRONTEND_DIR}/modules/statistics"
CHAT_DIR="${FRONTEND_DIR}/modules/chat"

# vite.config alias expects ../../be-r3-ui-shell/shared/... — symlink if absent (local only).
if [ ! -e "${FRONTEND_DIR}/be-r3-ui-shell" ] && [ -d "${FRONTEND_DIR}/../be-r3-ui-shell" ]; then
  ln -sfn ../be-r3-ui-shell "${FRONTEND_DIR}/be-r3-ui-shell"
fi

STAND="${STAND_URL:?set STAND_URL to the deployed stand origin, e.g. https://app.example}"
HOST_PORT="${HOST_PORT:-5173}"
CONTACTS_PORT=5011
COMPANIES_PORT=5012
DEALS_PORT=5013
ORDERS_PORT=5014
ACTIVITIES_PORT=5015
PRODUCTS_PORT=5016
REPORTS_PORT=5017
DOCUMENTS_PORT=5018
AUTOMATION_PORT=5019
STATISTICS_PORT=5020
SEARCH_PORT=5021
CHAT_PORT=5022
LOCK_FILE="${LOCK_FILE:-/tmp/ff-hybrid.lock}"
# Per-worktree log prefix. Several worktrees run this script (serialised by the
# flock below), and a fixed /tmp/ff-hybrid-<svc>.log means the NEXT run overwrites
# the logs of the one that just failed — the exact evidence needed to triage it.
LOG_PREFIX="/tmp/ff-hybrid-$(basename "${FRONTEND_DIR}")"
CMD=("$@")
if [ ${#CMD[@]} -eq 0 ]; then
    if [ -x "${E2E_DIR}/node_modules/.bin/playwright" ]; then
        CMD=("${E2E_DIR}/node_modules/.bin/playwright" test)
    else
        CMD=(npx playwright test)
    fi
fi

HYBRID_REMOTES="${HYBRID_REMOTES:-contacts companies deals orders}"
HYBRID_REMOTE_MODE="${HYBRID_REMOTE_MODE:-preview}"

# Documents specs require the documents remote with qa-ids; auto-include when the
# invoked command targets documents test files (same convention as README examples).
CMD_JOINED="$(printf '%s ' "${CMD[@]}")"
if [[ "${CMD_JOINED}" == *documents* ]] && [[ " ${HYBRID_REMOTES} " != *" documents "* ]]; then
    HYBRID_REMOTES="${HYBRID_REMOTES} documents"
    echo "[hybrid] auto-appended documents to HYBRID_REMOTES (documents spec detected)"
fi

LOCAL_REMOTES_CSV="$(echo "${HYBRID_REMOTES}" | tr -s ' ' ',')"

# Companies pulls host/src (EntityCreateDrawer, HostSlot, …) which transitively
# imports every federation remote in loadRemoteComponent.ts — vite build of the
# remote then fails on unresolved `remoteActivities/…` ids. Preview is unusable.
# Vite dev does not serve a real `/assets/remoteEntry.js` (SPA fallback → HTML),
# so localhost federation URLs also fail at runtime. Direct-import through the host
# dev server (VITE_DIRECT_REMOTES) compiles module sources with host HMR + qa-ids.
DIRECT_REMOTES=""
should_direct_remote() {
    case "$1" in
        companies) return 0 ;;
        contacts|deals)
            [ "${HYBRID_REMOTE_MODE}" = "dev" ] && return 0 || return 1 ;;
        *) return 1 ;;
    esac
}
for remote in ${HYBRID_REMOTES}; do
    if should_direct_remote "${remote}"; then
        DIRECT_REMOTES="${DIRECT_REMOTES:+$DIRECT_REMOTES,}${remote}"
    fi
done
DIRECT_REMOTES_CSV="$(echo "${DIRECT_REMOTES}" | tr -s ' ' ',')"
is_direct_remote() {
    case ",${DIRECT_REMOTES_CSV}," in
        *",$1,"*) return 0 ;;
        *) return 1 ;;
    esac
}
# Federation localhost overrides only for remotes we actually start as preview/dev.
FEDERATION_LOCAL_REMOTES=""
for remote in ${HYBRID_REMOTES}; do
    if is_direct_remote "${remote}"; then continue; fi
    FEDERATION_LOCAL_REMOTES="${FEDERATION_LOCAL_REMOTES:+$FEDERATION_LOCAL_REMOTES,}${remote}"
done

# Prepend a Node install if the runner needs one, e.g.:
#   export PATH="$HOME/.nvm/versions/node/<version>/bin:${PATH}"
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/usr/local/share/ca-certificates/ff-ca.crt}"
# Resolve the stand when split-DNS is unavailable on the runner (explicit IP override).
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require ${E2E_DIR}/support/dns-app-ff.cjs"

# STAND_IP: resolve the stand hostname inside the Node processes only (see
# support/dns-shim.cjs). Needed on hosts that reach the stand over a VPN but
# have no split-DNS and no sudo for /etc/hosts — otherwise the host dev proxy
# fails with ENOTFOUND and the shell boots into "модули недоступны".
if [ -n "${STAND_IP:-}" ]; then
    STAND_HOST="${STAND#*://}"
    STAND_HOST="${STAND_HOST%%/*}"
    export FF_DNS_MAP="${STAND_HOST}=${STAND_IP}"
    export NODE_OPTIONS="${NODE_OPTIONS} --require ${E2E_DIR}/support/dns-shim.cjs"
    echo "[hybrid] DNS shim: ${FF_DNS_MAP}"
fi
# qa-ids ON for the locally-built remotes (prod-mode preview builds).
export VITE_QA_IDS=true

exec 9>"${LOCK_FILE}"
echo "[hybrid] acquiring ${LOCK_FILE} (waits up to 2h) ..."
flock -w 7200 9

# Preflight: the flock only serialises runners that TAKE it. Other worktrees start
# their own host/remote servers directly (dev-hybrid.sh, a bare `npm run dev`), and
# a busy port meant this script's "host is up" probe happily green-lit SOMEBODY
# ELSE's app — specs then failed on missing qa-ids that were never theirs to serve.
# Refuse to run instead, and say which port to move.
for entry in "host:${HOST_PORT}" "companies-remote:${COMPANIES_PORT}" "contacts-remote:${CONTACTS_PORT}" "deals-remote:${DEALS_PORT}" "orders-remote:${ORDERS_PORT}" "activities-remote:${ACTIVITIES_PORT}" "products-remote:${PRODUCTS_PORT}" "reports-remote:${REPORTS_PORT}" "documents-remote:${DOCUMENTS_PORT}" "automation-remote:${AUTOMATION_PORT}" "statistics-remote:${STATISTICS_PORT}" "search-remote:${SEARCH_PORT}" "chat-remote:${CHAT_PORT}"; do
    name="${entry%%:*}"
    port="${entry##*:}"
    case " ${HYBRID_REMOTES} " in
        *" ${name%-remote} "*) ;;
        *) [ "${name}" = "host" ] || continue ;;
    esac
    if [ "${name}" != "host" ] && is_direct_remote "${name%-remote}"; then
        continue
    fi
    # Give the previous lock holder a moment to finish tearing its servers down.
    for _ in $(seq 1 10); do
        curl -sf "http://localhost:${port}/" -o /dev/null 2>/dev/null || break
        sleep 2
    done
    if curl -sf "http://localhost:${port}/" -o /dev/null 2>/dev/null; then
        echo "[hybrid] ERROR: port ${port} (${name}) is already serving something." >&2
        if [ "${name}" = "host" ]; then
            echo "[hybrid] Another worktree's hybrid is likely running. Retry with HOST_PORT=<free port>." >&2
        else
            echo "[hybrid] The host resolves this remote to a FIXED port (host/vite.config.ts" \
                 "DEV_REMOTE_PORTS), so it cannot be moved — wait for the other run to finish." >&2
        fi
        exit 1
    fi
done

PIDS=()
# Kill a whole process tree, leaves first. `npm run dev/preview` spawns
# `sh -c vite` -> `node .../vite`, and killing only the tracked npm PID leaves the
# node vite server orphaned (reparented to init) — it keeps holding :5173/:5011-:5022 AND
# the inherited flock fd, blocking every other dev sharing these ports for 2h. So
# tear down the descendants recursively, not just the direct child.
kill_tree() {
    local pid=$1
    local child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
}
cleanup() {
    echo "[hybrid] stopping servers ..."
    for pid in "${PIDS[@]:-}"; do kill_tree "$pid"; done
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# `set -e` + a redirected build means a compile error kills the run with no visible
# reason at all, so surface the log tail before bailing out.
build_remote() {
    local name=$1 dir=$2 log="${LOG_PREFIX}-$1-build.log"
    if [ "${name}" = "contacts" ] && [ -f "${dir}/dist/assets/remoteEntry.js" ] && [ "${HYBRID_FORCE_CONTACTS_BUILD:-}" != "1" ]; then
        echo "[hybrid] reusing existing contacts dist (set HYBRID_FORCE_CONTACTS_BUILD=1 to rebuild)."
        return
    fi
    echo "[hybrid] building ${name} remote (VITE_QA_IDS=true) ..."
    if [ ! -e "${dir}/node_modules/vite" ]; then
        case "${name}" in
            contacts)
                ln -sfn "${DEALS_DIR}/node_modules" "${dir}/node_modules"
                ;;
            companies)
                ln -sfn "${FRONTEND_DIR}/../../frontend/modules/companies/node_modules" "${dir}/node_modules" 2>/dev/null || true
                if [ ! -e "${dir}/node_modules/vite" ]; then
                    ln -sfn "${DEALS_DIR}/node_modules" "${dir}/node_modules"
                fi
                ;;
            *)
                ln -sfn "${DEALS_DIR}/node_modules" "${dir}/node_modules"
                ;;
        esac
    fi
    if ! (
        cd "${dir}"
        PATH="${HOST_DIR}/node_modules/.bin:${PATH}" \
            VITE_QA_IDS=true \
            npm run build >"${log}" 2>&1
    ); then
        if [ "${name}" = "contacts" ] && [ -f "${dir}/dist/assets/remoteEntry.js" ]; then
            echo "[hybrid] WARN: contacts build failed; reusing dist if present." >&2
            tail -n 20 "${log}" >&2 || true
            return
        fi
        echo "[hybrid] ERROR: ${name} build failed. Tail of ${log}:" >&2
        tail -n 40 "${log}" >&2 || true
        exit 1
    fi
}

preview_remote() {
    local name=$1 dir=$2 port=$3
    echo "[hybrid] starting ${name} preview on :${port} ..."
    (cd "${dir}" && npm run preview >"${LOG_PREFIX}-${name}.log" 2>&1) &
    PIDS+=("$!")
}

# HYBRID_REMOTE_MODE=dev serves a remote from `vite dev` instead of build+preview.
# Same qa-ids (the dev flag defaults to on) and the same
# http://localhost:<port>/assets/remoteEntry.js the host resolves, minus the
# production build — which is what unblocks a module whose STANDALONE build cannot
# resolve the `remote<Other>/…` federation ids it inherits from host/src
# (loadRemoteComponent). In dev those are warnings, in `vite build` a hard error.
serve_remote() {
    local name=$1 dir=$2 port=$3
    if [ "${HYBRID_REMOTE_MODE}" = "dev" ] || [ "${name}" = "activities" ]; then
        echo "[hybrid] starting ${name} DEV server on :${port} (qa-ids on) ..."
        (
            cd "${dir}"
            VITE_QA_IDS=true npm run dev -- --port "${port}" --strictPort
        ) >"${LOG_PREFIX}-${name}.log" 2>&1 &
        PIDS+=("$!")
    else
        build_remote "${name}" "${dir}"
        preview_remote "${name}" "${dir}" "${port}"
    fi
}

# Which remotes are served LOCALLY (built with qa-ids); the rest come from the
# stand's manifest. Narrow it when a spec only touches one module — a remote whose
# `npm install` never ran in this worktree cannot be built, and building the two
# of them costs ~40s per run:
#   HYBRID_REMOTES=companies ./run-hybrid.sh npx playwright test tests/06-…
for remote in ${HYBRID_REMOTES}; do
    if is_direct_remote "${remote}"; then
        echo "[hybrid] ${remote} remote: direct-import via host (VITE_DIRECT_REMOTES, qa-ids on)"
        continue
    fi
    case "${remote}" in
        contacts) serve_remote contacts "${CONTACTS_DIR}" "${CONTACTS_PORT}" ;;
        companies) serve_remote companies "${COMPANIES_DIR}" "${COMPANIES_PORT}" ;;
        deals) serve_remote deals "${DEALS_DIR}" "${DEALS_PORT}" ;;
        orders) serve_remote orders "${ORDERS_DIR}" "${ORDERS_PORT}" ;;
        products) serve_remote products "${PRODUCTS_DIR}" "${PRODUCTS_PORT}" ;;
        activities) serve_remote activities "${ACTIVITIES_DIR}" "${ACTIVITIES_PORT}" ;;
        reports) serve_remote reports "${REPORTS_DIR}" "${REPORTS_PORT}" ;;
        documents) serve_remote documents "${DOCUMENTS_DIR}" "${DOCUMENTS_PORT}" ;;
        automation) serve_remote automation "${AUTOMATION_DIR}" "${AUTOMATION_PORT}" ;;
        statistics) serve_remote statistics "${STATISTICS_DIR}" "${STATISTICS_PORT}" ;;
        search) serve_remote search "${SEARCH_DIR}" "${SEARCH_PORT}" ;;
        chat) serve_remote chat "${CHAT_DIR}" "${CHAT_PORT}" ;;
        *) echo "[hybrid] ERROR: unknown remote '${remote}' in HYBRID_REMOTES" >&2; exit 1 ;;
    esac
done

echo "[hybrid] starting host dev on :${HOST_PORT} (API+remotes -> ${STAND}) ..."
(
    cd "${HOST_DIR}"
    export VITE_LOCAL_REMOTES="${FEDERATION_LOCAL_REMOTES}"
    export VITE_DIRECT_REMOTES="${DIRECT_REMOTES_CSV}"
    export VITE_REMOTES_MANIFEST="true"
    export VITE_QA_IDS=true
    export VITE_REMOTES_PROXY_TARGET="${STAND}"
    export VITE_API_PROXY_TARGET="${STAND}"
    export VITE_AUTH_PERSIST_STRATEGY="localStorage"
    export VITE_API_PREFIX="/api"
    npm run dev -- --port "${HOST_PORT}" --strictPort >"${LOG_PREFIX}-host.log" 2>&1
) &
PIDS+=("$!")

# The remote entry must be servable BEFORE the first navigation: the host resolves
# `remoteCompanies` to http://localhost:5012/assets/remoteEntry.js, and a preview
# server that is still booting makes the /companies route render a load error
# instead of the module (a flaky first spec, not a product bug).
# Preview/dev remotes only: direct-import remotes compile inside the host dev server.
if [[ " ${HYBRID_REMOTES} " == *" companies "* ]] && ! is_direct_remote companies; then
echo "[hybrid] waiting for companies remote http://localhost:${COMPANIES_PORT} ..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${COMPANIES_PORT}/assets/remoteEntry.js" | head -c 40 | grep -q 'var\|import\|function'; then
        echo "[hybrid] companies remote is up."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[hybrid] WARNING: companies remoteEntry not reachable. Tail of preview log:" >&2
        tail -n 20 "${LOG_PREFIX}-companies.log" >&2 || true
    fi
    sleep 1
done
fi

echo "[hybrid] waiting for host http://localhost:${HOST_PORT} ..."
for i in $(seq 1 90); do
    if curl -sf "http://localhost:${HOST_PORT}/" -o /dev/null 2>/dev/null; then
        echo "[hybrid] host is up."
        break
    fi
    if grep -q "Port ${HOST_PORT} is already in use" "${LOG_PREFIX}-host.log" 2>/dev/null; then
        echo "[hybrid] ERROR: host port ${HOST_PORT} busy. Free it or set HOST_PORT." >&2
        exit 1
    fi
    if [ "$i" -eq 90 ]; then
        echo "[hybrid] ERROR: host did not come up. Tail of host log:" >&2
        tail -n 40 "${LOG_PREFIX}-host.log" >&2 || true
        exit 1
    fi
    sleep 2
done
sleep 2

export BASE_URL="http://localhost:${HOST_PORT}"
export API_BASE_URL="${BASE_URL}/api"
export E2E_DEALS=1
if [[ " ${HYBRID_REMOTES} " == *" deals "* ]] && [[ " ${HYBRID_REMOTES} " == *" orders "* ]]; then
    export E2E_DEALS_ORDERS=1
fi
if [ -n "${E2E_SKIP_LOGIN_PROBE:-}" ]; then
    echo "[hybrid] skipping API login probe (E2E_SKIP_LOGIN_PROBE=1)"
else
echo "[hybrid] waiting for API proxy ${API_BASE_URL}/v1/auth/login ..."
for i in $(seq 1 30); do
    if curl -sf -X POST "${API_BASE_URL}/v1/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"email":"admin@fairflow.local","password":"admin"}' \
        -o /dev/null -w '%{http_code}' 2>/dev/null | grep -qE '20[01]'; then
        echo "[hybrid] API proxy is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[hybrid] WARN: API login probe did not succeed; tests may flake." >&2
    fi
    sleep 2
done
fi
# Probe documents stand APIs when running documents specs (catalogTest fixme on 500).
if [[ "${CMD_JOINED}" == *documents* ]]; then
    export STAND_UPLOAD_BROKEN=1
    export STAND_TEMPLATE_BROKEN=1
    PROBE_TOKEN=""
    PROBE_TOKEN="$(curl -sf -X POST "${API_BASE_URL}/v1/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"email":"admin@fairflow.local","password":"admin"}' 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || true)"
    if [ -n "${PROBE_TOKEN}" ]; then
        PROBE_PID="$(curl -sf -X POST "${API_BASE_URL}/v1/projects" \
            -H "Authorization: Bearer ${PROBE_TOKEN}" \
            -H 'Content-Type: application/json' \
            -d "{\"name\":\"t029-probe-$(date +%s)\",\"enabledModules\":[\"documents\",\"deals\"]}" 2>/dev/null \
            | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)"
        if [ -n "${PROBE_PID}" ]; then
            UP_CODE="$(curl -sf -o /dev/null -w '%{http_code}' -X POST "${API_BASE_URL}/v1/documents/upload" \
                -H "Authorization: Bearer ${PROBE_TOKEN}" \
                -H "x-project-id: ${PROBE_PID}" \
                -F "file=@${E2E_DIR}/fixtures/files/sample.pdf" \
                -F "name=probe.pdf" \
                -F "contextType=none" 2>/dev/null || echo 000)"
            TPL_CODE="$(curl -sf -o /dev/null -w '%{http_code}' -X POST "${API_BASE_URL}/v1/document-templates" \
                -H "Authorization: Bearer ${PROBE_TOKEN}" \
                -H "x-project-id: ${PROBE_PID}" \
                -F "file=@${E2E_DIR}/fixtures/files/minimal.docx" \
                -F "name=probe-tpl" \
                -F "contextType=deal" 2>/dev/null || echo 000)"
            curl -sf -X DELETE "${API_BASE_URL}/v1/projects/${PROBE_PID}" \
                -H "Authorization: Bearer ${PROBE_TOKEN}" >/dev/null 2>&1 || true
            if [ "${UP_CODE}" = "200" ] || [ "${UP_CODE}" = "201" ]; then
                unset STAND_UPLOAD_BROKEN
                echo "[hybrid] documents upload probe: OK (${UP_CODE})"
            else
                echo "[hybrid] documents upload probe: ${UP_CODE} → STAND_UPLOAD_BROKEN=1"
            fi
            if [ "${TPL_CODE}" = "200" ] || [ "${TPL_CODE}" = "201" ]; then
                unset STAND_TEMPLATE_BROKEN
                echo "[hybrid] document-templates probe: OK (${TPL_CODE})"
            else
                echo "[hybrid] document-templates probe: ${TPL_CODE} → STAND_TEMPLATE_BROKEN=1"
            fi
        fi
    else
        echo "[hybrid] WARN: documents stand probe skipped (auth unavailable) — STAND_*_BROKEN=1"
    fi
fi
echo "[hybrid] running: ${CMD[*]}  (BASE_URL=${BASE_URL}, API_BASE_URL=${API_BASE_URL}, E2E_DEALS=1, E2E_DEALS_ORDERS=${E2E_DEALS_ORDERS:-0}, HYBRID_REMOTES=${HYBRID_REMOTES}, STAND_UPLOAD_BROKEN=${STAND_UPLOAD_BROKEN:-0}, STAND_TEMPLATE_BROKEN=${STAND_TEMPLATE_BROKEN:-0})"
cd "${E2E_DIR}"
set +e
"${CMD[@]}"
RC=$?
set -e
echo "[hybrid] command exited with ${RC}"
exit "${RC}"
