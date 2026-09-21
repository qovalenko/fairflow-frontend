import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const repoRoot = path.resolve(moduleDir, '../..')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)

const base = createVitestConfig()

export default {
    ...base,
    test: {
        ...base.test,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/index.ts',
                'src/vite-entry.ts',
                'src/vite-entry-app.tsx',
                'src/**/*.d.ts',
                'postcss.config.cjs',
            ],
        },
    },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@fairflow/slot-catalog': path.join(
                repoRoot,
                '../../backend/shared/src/slot-catalog.ts',
            ),
            '@fairflow/shared-ui': path.join(
                moduleDir,
                '../deals/node_modules/@fairflow/shared-ui',
            ),
            '@testing-library/react': fromHost('@testing-library/react'),
            '@testing-library/dom': fromHost('@testing-library/dom'),
            '@testing-library/user-event': fromHost('@testing-library/user-event'),
            'react-router': fromHost('react-router'),
            'react-icons/pi': fromHost('react-icons/pi'),
            dayjs: fromHost('dayjs'),
            swr: fromHost('swr'),
        },
    },
}
