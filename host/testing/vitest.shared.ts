/**
 * Shared vitest config factory for the FairFlow frontend (host + Module Federation
 * remotes). One place to keep the jsdom + React Testing Library setup identical
 * across workspaces so the T-037 coverage wave can wire a module with a two-line
 * `vitest.config.ts` (see ./README-TESTING.md).
 *
 * Why a hand-rolled config instead of extending each `vite.config.ts`:
 * the app/remote configs load `@originjs/vite-plugin-federation`, which rewrites
 * bare imports (`react`, `zustand`, …) into federation *virtual* modules. Under
 * vitest that virtual graph has no runtime host to resolve against, so the tests
 * fail to import React. We therefore build a MINIMAL vite pipeline here — only
 * `@vitejs/plugin-react` — and never touch the federation plugin. Remote entry
 * (`loadRemoteModule`) code paths must be `vi.mock`-ed at the test boundary.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vitest/config'

const thisDir = path.dirname(fileURLToPath(import.meta.url)) // <root>/host/testing
const hostDir = path.resolve(thisDir, '..') // <root>/host
const repoRoot = path.resolve(hostDir, '..') // <root> (frontend checkout root)
const allureResultsDir =
    process.env.ALLURE_RESULTS_DIR || path.join(repoRoot, 'allure-results')
const hostSrc = path.join(hostDir, 'src')
const hostNodeModules = path.join(hostDir, 'node_modules')
const allureReporterPath = path.join(
    hostNodeModules,
    'allure-vitest/dist/reporter.js',
)
const sharedSetup = path.join(thisDir, 'vitest.setup.ts')

export type SharedVitestOptions = {
    /**
     * What the `@` path alias resolves to. Defaults to the host `src` — which is
     * correct for BOTH the host and the remotes (module tsconfigs already map
     * `@/*` → `../../host/src/*`). Override only for a bespoke layout.
     */
    atAlias?: string
    /** Extra `import.meta.env` values exposed to code under test. */
    env?: Record<string, string>
    /** Extra setup files, run AFTER the shared jsdom/jest-dom setup. */
    setupFiles?: string[]
    /** Override the default `src/**` test glob if a workspace needs it. */
    include?: string[]
}

/**
 * Build a vitest config shared by host and remotes.
 *
 * The `react`/`react-dom`/jsx-runtime aliases pin every workspace onto the host
 * `node_modules` copy — remotes don't install their own React (federation shares
 * a singleton at runtime), so without this a remote's own source could not
 * `import 'react'` under vitest. Harmless for the host (same path).
 */
export function createVitestConfig(opts: SharedVitestOptions = {}): UserConfig {
    const at = opts.atAlias ?? hostSrc
    const slotCatalogPath = path.join(
        repoRoot,
        '../backend/shared/src/slot-catalog.ts',
    )
    const sharedUiPath = path.join(repoRoot, '../shared-ui/src/index.tsx')
    return defineConfig({
        plugins: [
            react(),
            {
                name: 'fairflow-test-aliases',
                enforce: 'pre',
                resolveId(id: string) {
                    if (id === '@fairflow/slot-catalog') return slotCatalogPath
                    if (id === '@fairflow/shared-ui') return sharedUiPath
                    return null
                },
            },
        ],
        // `qa()` (src/shared/qa.ts) reads a BUILD-time define; without it any
        // component that tags itself with data-qa-* throws
        // `__QA_IDS_ENABLED__ is not defined` under vitest. Tests keep the ids ON
        // so they can select by the same hooks e2e uses.
        define: { __QA_IDS_ENABLED__: 'true' },
        // A remote's project root is modules/<m>, but the shared setup + host UI kit
        // it imports live outside it. Allow the whole frontend checkout so vite's fs
        // sandbox doesn't block cross-workspace loads (host is the React singleton).
        server: { fs: { allow: [repoRoot] } },
        resolve: {
            alias: {
                '@': at,
                '@fairflow/slot-catalog': slotCatalogPath,
                '@fairflow/shared-ui': sharedUiPath,
                react: path.join(hostNodeModules, 'react'),
                'react-dom': path.join(hostNodeModules, 'react-dom'),
                'react/jsx-runtime': path.join(
                    hostNodeModules,
                    'react/jsx-runtime',
                ),
                'react/jsx-dev-runtime': path.join(
                    hostNodeModules,
                    'react/jsx-dev-runtime',
                ),
            },
        },
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: [sharedSetup, ...(opts.setupFiles ?? [])],
            css: false,
            include: opts.include ?? ['src/**/*.{test,spec}.{ts,tsx}'],
            reporters: [
                'default',
                [allureReporterPath, { resultsDir: allureResultsDir }],
            ],
            // Deterministic tests: reset spies/mock state between cases.
            clearMocks: true,
            restoreMocks: true,
            // appConfig reads VITE_AUTH_PERSIST_STRATEGY at module load; pin it to
            // localStorage so auth-store tests are deterministic (jsdom has it) and
            // not on the default HTTP-only-cookie path.
            env: {
                VITE_AUTH_PERSIST_STRATEGY: 'localStorage',
                ...(opts.env ?? {}),
            },
        },
    })
}

export default createVitestConfig
