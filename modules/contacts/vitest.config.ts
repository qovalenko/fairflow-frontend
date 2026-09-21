/**
 * Contacts remote test config — по образцу `modules/companies/vitest.config.ts`
 * и `host/testing/README-TESTING.md`.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

/** Опубликованный `@fairflow/shared-ui` в checkout битый — dist тянет несуществующие subpath. */
function stubSharedUi(): Plugin {
    return {
        name: 'stub-shared-ui',
        enforce: 'pre',
        resolveId(id: string) {
            return id === '@fairflow/shared-ui' ? '\0stub:shared-ui' : null
        },
        load(id: string) {
            return id === '\0stub:shared-ui'
                ? [
                      'export function Container({ children }) { return children }',
                      'export function CompanyActivitiesWidget({ activities, loading }) {',
                      '  if (loading) return null',
                      '  return activities?.map((a) => a.title).join(",") || null',
                      '}',
                  ].join('\n')
                : null
        },
    }
}

const base = createVitestConfig()

export default {
    ...base,
    plugins: [stubSharedUi(), ...(base.plugins ?? [])],
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
                'src/vite-entry*.ts',
                'src/vite-entry*.tsx',
                'src/@types/**',
                'src/qa.ts',
                'src/qa-env.d.ts',
                'src/contactsUi.tsx',
            ],
        },
    },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            'react-router': fromHost('react-router'),
            'react-csv': fromHost('react-csv'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            'react-icons/pi': fromHost('react-icons/pi'),
            axios: fromHost('axios'),
            '@testing-library/react': fromHost('@testing-library/react'),
            '@testing-library/dom': fromHost('@testing-library/dom'),
            '@testing-library/user-event': fromHost('@testing-library/user-event'),
        },
    },
}
