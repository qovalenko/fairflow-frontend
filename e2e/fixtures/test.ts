import { test as base, expect } from '@playwright/test'
import { ApiClient } from './api'
import { STORAGE_KEYS } from '../support/env'
import { installSystemApiBridge } from '../support/orgApiBridge'

/**
 * Shared fixtures.
 *
 * - `api`      — authenticated REST client (one login per worker to avoid stand rate limits).
 * - `useProject(pid)` — seed the host project context (localStorage) BEFORE the
 *   first navigation, so portfolio pages (/contacts …) that read the project
 *   store resolve `pid` without a manual project-picker click.
 * - `noForbidden` — AUTO fixture (INV-403-00, E2E-SCENARIOS §5): listens on
 *   `page.on('response')` for `403`s and fails the test if any happy-path request
 *   is forbidden (regression guard for T-001). Intentional negative cases opt out
 *   by widening the allow-list via `test.use({ forbiddenAllow: ['/v1/…'] })`.
 * - `forbiddenAllow` — allow-list of URL SUBSTRINGS (or RegExps) permitted to
 *   answer 403; empty by default. NOTE (Playwright option gotcha): override this
 *   with a **string array**. Playwright misdetects an array whose last element is
 *   an object (a RegExp IS an object) as an `[value, options]` fixture tuple and
 *   silently unwraps it to the first element — so `test.use({ forbiddenAllow:
 *   [/a/, /b/] })` yields the bare RegExp `/a/` (not an array, drops `/b/`), which
 *   later blows up on `.some(...)`. String substrings are never misdetected.
 */
type Fixtures = {
    api: ApiClient
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>
    noForbidden: void
    orgApiBridge: void
}

type WorkerlessOptions = {
    forbiddenAllow: Array<string | RegExp>
}

/** Specs that do not call `/v1/system/*` — skip bridge to avoid unnecessary admin login. */
const ORG_BRIDGE_SKIP_RE = /19-organization-(bootstrap|invite-accept)\.spec\.ts$/

export const test = base.extend<Fixtures & WorkerlessOptions>({
    forbiddenAllow: [[], { option: true }],

    api: async ({ page }, use) => {
        if (page.url() === 'about:blank') {
            await page.goto('/')
        }
        let client = await ApiClient.fromPageSession(page)
        if (!client) {
            client = await ApiClient.authenticated()
        }
        await use(client)
    },

    useProject: async ({ page }, use) => {
        await use(async (projectId: string, enabledModules: string[] = ['deals', 'contacts']) => {
            // Seed a VALID host Project shape (host/src/store/projectStore.ts):
            // the store hydrates this synchronously on first render and
            // `getEnabledModules` reads `project.enabledModules.length` — so the
            // `enabledModules` array MUST be present, or the host crashes to a
            // blank screen before it can fetch the real project. The subsequent
            // API fetch refines this stub with the backend's real module manifest.
            //
            // ALSO inject the project into the persisted session store
            // (`sessionUser` → `state.user.projects`). This is NON-OPTIONAL: the
            // host only populates `user.projects` during the signIn flow (there is
            // no re-fetch on a plain reload), so a project created via the API
            // AFTER the setup login is absent from the reused storageState session.
            // Worse, `useResolvedProjectId` (host) treats an EMPTY `user.projects`
            // as "user has no projects" and actively NULLS the current project —
            // wiping the projectStore stub above — while `ProjectHomeRedirect`
            // validates `/p/:pid` against `user.projects` and 404s/бounces an
            // unknown id. Both make portfolio pages redirect to an empty
            // `/account/projects`. Injecting a ProjectInfo entry (shape from
            // host AuthProvider.mapControlProjectsToUser) resolves the context so
            // `/p/:pid` and `/contacts` render; the live platform-modules fetch
            // then refines the sidebar (so e.g. a module toggled ON via settings
            // still shows up — it comes from the backend, not this stub).
            await page.addInitScript(
                ({ idKey, projKey, sessionKey, id, modules }) => {
                    localStorage.setItem(idKey, id)
                    localStorage.setItem(
                        projKey,
                        JSON.stringify({ id, name: id, enabledModules: modules }),
                    )

                    const projectInfo = {
                        id,
                        name: id,
                        color: '#6366f1',
                        ownerType: 'PERSONAL' as const,
                        ownerId: '',
                        role: 'member',
                        enabledModules: modules,
                        effectiveModules: modules,
                        moduleConfigs: modules.map((m) => ({
                            moduleId: m,
                            enabled: true,
                            personalSettings: {},
                            integrationSettings: {},
                            integrationMethodsEnabled: [],
                        })),
                        modulePolicies: [],
                    }

                    // Merge into the zustand-persist envelope `{ state, version }`.
                    // Preserve the authenticated user from the setup session; only
                    // ensure our seeded project is present in `state.user.projects`.
                    let envelope: {
                        state?: {
                            session?: { signedIn?: boolean }
                            user?: { projects?: Array<{ id: string }> }
                        }
                        version?: number
                    } = {}
                    const raw = localStorage.getItem(sessionKey)
                    if (raw) {
                        try {
                            envelope = JSON.parse(raw)
                        } catch {
                            envelope = {}
                        }
                    }
                    envelope.state = envelope.state ?? {}
                    envelope.state.session = envelope.state.session ?? { signedIn: true }
                    if (envelope.state.session.signedIn !== true) {
                        envelope.state.session.signedIn = true
                    }
                    envelope.state.user = envelope.state.user ?? {}
                    const projects = envelope.state.user.projects ?? []
                    if (!projects.some((p) => p.id === id)) {
                        projects.push(projectInfo)
                    }
                    envelope.state.user.projects = projects
                    if (typeof envelope.version !== 'number') envelope.version = 0
                    localStorage.setItem(sessionKey, JSON.stringify(envelope))
                },
                {
                    idKey: STORAGE_KEYS.projectId,
                    projKey: STORAGE_KEYS.project,
                    sessionKey: STORAGE_KEYS.sessionUser,
                    id: projectId,
                    modules: enabledModules,
                },
            )
        })
    },

    noForbidden: [
        async ({ page, forbiddenAllow }, use) => {
            // Defensive: tolerate a non-array value should the Playwright tuple
            // misdetection (see forbiddenAllow doc above) ever slip through, so the
            // guard degrades to "allow that one rule" instead of a hard TypeError.
            const rules: Array<string | RegExp> = Array.isArray(forbiddenAllow)
                ? forbiddenAllow
                : [forbiddenAllow]
            const forbidden: string[] = []
            const allowed = (url: string): boolean =>
                rules.some((rule) =>
                    typeof rule === 'string' ? url.includes(rule) : rule.test(url),
                )
            page.on('response', (res) => {
                if (res.status() === 403 && !allowed(res.url())) {
                    forbidden.push(`${res.request().method()} ${res.url()}`)
                }
            })
            await use()
            expect(
                forbidden,
                `no unexpected 403 on happy path (INV-403-00):\n${forbidden.join('\n')}`,
            ).toEqual([])
        },
        { auto: true },
    ],

    /** Bridge box `/v1/system/*` UI calls to legacy org API on the stand. */
    orgApiBridge: [
        async ({ page }, use, testInfo) => {
            let cleanup: (() => Promise<void>) | undefined
            if (testInfo.file.includes('19-organization') && !ORG_BRIDGE_SKIP_RE.test(testInfo.file)) {
                const client =
                    (await ApiClient.fromCachedStorageState()) ?? (await ApiClient.login())
                try {
                    const orgId = await client.resolveOrganizationId()
                    cleanup = await installSystemApiBridge(page, client.token, orgId)
                } finally {
                    await client.dispose()
                }
            }
            await use()
            if (cleanup) {
                await cleanup()
            }
            await page.unrouteAll({ behavior: 'ignoreErrors' })
        },
        { auto: true },
    ],
})

export { expect }

/** Stand blockers (confirmed on the stand 2026-08-21); unset when run-hybrid probe passes. */
const STAND_UPLOAD_BLOCKED = process.env.STAND_UPLOAD_BROKEN === '1'
const STAND_TEMPLATE_BLOCKED = process.env.STAND_TEMPLATE_BROKEN === '1'

type CatalogDeps = { needsUpload?: boolean; needsTemplate?: boolean }

type CatalogBody = (args: {
    page: import('@playwright/test').Page
    api: ApiClient
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>
}) => Promise<void>

/** Register catalog scenario; auto-fixme when stand upload/template APIs return 500. */
export function catalogTest(
    id: number,
    description: string,
    deps: CatalogDeps,
    body: CatalogBody,
): void {
    let title = `#${id}: ${description}`
    if (deps.needsUpload && STAND_UPLOAD_BLOCKED) {
        title = `#${id}: BUG POST /v1/documents/upload 500 INTERNAL: ${description}`
        test.fixme(title, body)
        return
    }
    if (deps.needsTemplate && STAND_TEMPLATE_BLOCKED) {
        title = `#${id}: BUG POST /v1/document-templates 500 INTERNAL: ${description}`
        test.fixme(title, body)
        return
    }
    test(title, body)
}
