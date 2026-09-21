/**
 * Chat remote test config — по образцу modules/contacts/vitest.config.ts
 * (host/testing/README-TESTING.md).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const sharedUiSrc = path.join(moduleDir, 'node_modules/@fairflow/shared-ui/src/index.tsx')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

const base = createVitestConfig()

export default {
    ...base,
    root: moduleDir,
    define: { ...base.define, __QA_IDS_ENABLED__: true },
    test: {
        ...(base.test as Record<string, unknown>),
        deps: {
            moduleDirectories: [
                'node_modules',
                hostNodeModules,
            ],
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/**/*.spec.{ts,tsx}',
                'src/@types/**',
                'src/vite-entry*.tsx',
                'src/vite-entry.ts',
            ],
        },
    },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@fairflow/shared-ui': sharedUiSrc,
            'react-router': fromHost('react-router'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            'react-icons/pi': fromHost('react-icons/pi'),
            axios: fromHost('axios'),
            '@testing-library/react': fromHost('@testing-library/react'),
        },
    },
}
