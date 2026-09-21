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
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            '@fairflow/shared-ui': fromHost('@fairflow/shared-ui'),
            'react-router': fromHost('react-router'),
            'react-csv': fromHost('react-csv'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            'react-icons/pi': fromHost('react-icons/pi'),
            axios: fromHost('axios'),
            '@testing-library/react': fromHost('@testing-library/react'),
        },
    },
}
