/**
 * Deals remote test config — REFERENCE TEMPLATE for Module Federation remotes.
 *
 * To wire another module for tests (T-037), copy this file + the `test`/`test:watch`
 * scripts and the vitest/@testing-library devDeps from package.json, and add
 * `src/@types/vitest-globals.d.ts`. See host/testing/README-TESTING.md.
 *
 * The shared factory lives in the host workspace so its vite/react plugins and the
 * React singleton resolve from host/node_modules (remotes don't bundle their own
 * React under federation). `@` already maps to host/src (module tsconfig paths).
 *
 * The hook-bearing externalized deps (`@testing-library/react`, `react-router`,
 * `swr`) are ALSO pinned onto the host copies (same trick and rationale as
 * modules/contacts/vitest.config.ts): vitest externalizes node_modules, so a
 * module-local copy natively resolves the module-local react while the source
 * under test is aliased onto host react — two React instances, and any hook
 * dies with «Cannot read properties of null». Only RTL itself, not
 * @testing-library/dom: the shared setup wires jest-dom matchers, aliasing
 * dom would detach `expect.extend` from the right `expect`.
 */
import path from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
// Remotes symlink node_modules without @vitest/coverage-v8 — resolve it from host.
Module.globalPaths.unshift(hostNodeModules)
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

const base = createVitestConfig({
    include: [path.join(moduleDir, 'src/**/*.{test,spec}.{ts,tsx}')],
}) as import('vitest/config').UserConfig

export default {
    ...base,
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@testing-library/react': fromHost('@testing-library/react'),
            'react-router': fromHost('react-router'),
            swr: fromHost('swr'),
        },
    },
    test: {
        ...base.test,
        deps: {
            moduleDirectories: [hostNodeModules, 'node_modules'],
        },
        coverage: {
            provider: 'v8',
            all: true,
            allowExternal: true,
            include: [`${moduleDir}/src/**/*.{ts,tsx}`],
            exclude: [
                `${moduleDir}/src/**/*.test.*`,
                `${moduleDir}/src/**/*.spec.*`,
                `${moduleDir}/src/@types/**`,
                `${moduleDir}/src/vite-entry*.tsx`,
                `${moduleDir}/src/qa*.ts*`,
                `${moduleDir}/src/selectQa.tsx`,
                `${moduleDir}/src/index.ts`,
            ],
            reportsDirectory: '../modules/deals/coverage',
        },
    },
}
