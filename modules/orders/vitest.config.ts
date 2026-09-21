/**
 * Orders remote test config — по образцу `modules/deals/vitest.config.ts`
 * (см. host/testing/README-TESTING.md). Поверх общей фабрики — alias'ы
 * hook-bearing deps на host/node_modules, иначе vitest подхватывает копии
 * из modules/orders/node_modules и React-рантайм расходится.
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
    test: {
        ...(base.test as Record<string, unknown>),
        // Изоляция mock(CrmService) и SWR между файлами спеков.
        pool: 'forks',
        fileParallelism: false,
        testTimeout: 15_000,
    },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@fairflow/shared-ui': path.join(moduleDir, 'node_modules/@fairflow/shared-ui'),
            '@testing-library/react': fromHost('@testing-library/react'),
            'react-router': fromHost('react-router'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            'react-icons/pi': fromHost('react-icons/pi'),
            '@hello-pangea/dnd': fromHost('@hello-pangea/dnd'),
            'framer-motion': fromHost('framer-motion'),
        },
    },
}
