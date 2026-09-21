/**
 * Products remote test config — REFERENCE TEMPLATE (см. modules/deals/vitest.config.ts
 * и host/testing/README-TESTING.md).
 *
 * vitest externalizes node_modules: без pin на host-копии @testing-library/react,
 * react-router и swr модуль тянет свой react, а SUT — host react → два React,
 * «Cannot read properties of null (reading 'useState')».
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

const base = createVitestConfig()

export default {
    ...base,
    define: { ...base.define, __QA_IDS_ENABLED__: true },
    test: {
        ...base.test,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/*.spec.{ts,tsx}',
                'src/index.ts',
                'src/vite-entry.ts',
                'src/vite-entry-app.tsx',
                'src/@types/**',
                'src/qa-env.d.ts',
                'postcss.config.cjs',
            ],
        },
    },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@fairflow/shared-ui': fromHost('@fairflow/shared-ui'),
            '@testing-library/react': fromHost('@testing-library/react'),
            '@testing-library/dom': fromHost('@testing-library/dom'),
            'react-router': fromHost('react-router'),
            'react-select': fromHost('react-select'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            axios: fromHost('axios'),
            'react-icons/pi': fromHost('react-icons/pi'),
            '@vitest/coverage-v8': fromHost('@vitest/coverage-v8'),
        },
    },
}
