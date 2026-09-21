/**
 * Centralised env for the Playwright harness (T-029).
 *
 * BASE_URL — where the app is served:
 *   - stand:  https://stand.example.com              (default)
 *   - feature stand: https://<slug>.stand.example.com
 *   - local hybrid: http://localhost:5173 (host `vite dev`, see e2e/run-hybrid.sh)
 *
 * NOTE: the deployed stand build strips data-qa-id (prod, флаг OFF), so selectors
 * only resolve against a build with VITE_QA_IDS=true — i.e. the local hybrid
 * (host dev + contacts preview). Point BASE_URL there for the smoke set.
 */

// Load optional e2e/.env before reading any values (zero-dep, Node >=20.12/22/24).
// This module has no imports, so its body runs first — before support consumers
// read the exported constants below.
try {
    ;(process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.('.env')
} catch {
    /* no .env present — use shell env / defaults */
}

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '')
}

/** App origin under test. */
export const BASE_URL = stripTrailingSlash(
    process.env.BASE_URL || 'http://localhost:5173',
)

/**
 * REST API base. Defaults to the app origin + `/api` — same-origin, so it works
 * both directly against the stand (`https://stand.example.com/api`) and through the host dev
 * proxy in the local hybrid (`http://localhost:5173/api` → proxied to the stand).
 * Override with API_BASE_URL to hit a gateway directly.
 */
export const API_BASE_URL = stripTrailingSlash(
    process.env.API_BASE_URL || `${BASE_URL}/api`,
)

/** Admin credentials (QA-CI-EPIC §Playwright). */
export const ADMIN_EMAIL = process.env.E2E_EMAIL || 'admin@fairflow.local'
export const ADMIN_PASSWORD = process.env.E2E_PASSWORD || 'admin'

/** Prefix for all data this suite creates, so cleanup can find its own records. */
export const DATA_PREFIX = 't029-'

/** localStorage keys the host uses (host/src/store + constants). */
export const STORAGE_KEYS = {
    token: 'token',
    projectId: 'fairflow_current_project_id',
    project: 'fairflow_current_project',
    // zustand-persist key for the session store (host/src/store/authStore.ts,
    // `persist({ name: 'sessionUser' })`). Holds `state.user.projects` — the list
    // the host validates `/p/:pid` and the project-context resolver against.
    sessionUser: 'sessionUser',
} as const

/**
 * Where the UI-login setup persists the reusable session (localStorage + cookies).
 * Kept here (not in auth.setup.ts) so playwright.config can import it WITHOUT
 * importing a file that calls test() — which Playwright forbids in the config.
 */
export const STORAGE_STATE = 'test-results/.auth/admin.json'

/** Unique suffix for a run, e.g. names like `t029-smoke-<id>`. */
export function uniqueName(label: string): string {
    return `${DATA_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
}
