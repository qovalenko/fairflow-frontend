/**
 * Search remote test config — общая фабрика + pin shared-синглтонов на host
 * (react-router, swr, RTL), как в modules/reports/statistics.
 *
 * Заглушка федеративных virtual-модулей `remote<Name>/<Expose>` — см. комментарий
 * в прежней версии файла (TODO-258 wiring tests).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const hostTestingDir = path.resolve(moduleDir, '../../host/testing')
const sharedUi = path.resolve(hostTestingDir, 'fixtures/shared-ui-stub.tsx')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

const REMOTE_ID = /^remote[A-Z][A-Za-z0-9]*\//

function stubFederationRemotes(): Plugin {
    return {
        name: 'stub-federation-remotes',
        enforce: 'pre',
        resolveId(id: string) {
            return REMOTE_ID.test(id) ? `\0stub:${id}` : null
        },
        load(id: string) {
            return id.startsWith('\0stub:')
                ? 'export default function RemoteStub() { return null }'
                : null
        },
    }
}

const config = createVitestConfig()
config.cacheDir = '.cache/vitest'
config.plugins = [stubFederationRemotes(), ...(config.plugins ?? [])]
config.server = {
    ...(config.server ?? {}),
    fs: {
        ...(config.server?.fs ?? {}),
        allow: [...(config.server?.fs?.allow ?? []), hostTestingDir],
    },
}

const resolve = (config.resolve ??= {})
resolve.alias = {
    ...(resolve.alias as Record<string, string>),
    '@fairflow/shared-ui': sharedUi,
    '@testing-library/react': fromHost('@testing-library/react'),
    '@testing-library/dom': fromHost('@testing-library/dom'),
    '@testing-library/user-event': fromHost('@testing-library/user-event'),
    'react-router': fromHost('react-router'),
    'react-highlight-words': fromHost('react-highlight-words'),
    'react-icons': fromHost('react-icons'),
    dayjs: fromHost('dayjs'),
    swr: fromHost('swr'),
}

const test = (config.test ??= {})
test.coverage = {
    provider: 'v8',
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
        'src/vite-entry*.tsx',
        'src/vite-entry.ts',
        'src/index.ts',
        'src/qa.ts',
        'src/qa-env.d.ts',
        'src/@types/**',
    ],
}

export default config
