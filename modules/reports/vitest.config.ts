/**
 * Reports remote test config — общая фабрика + pin shared-синглтонов на host
 * (react-router, swr, RTL), как в modules/statistics.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(thisDir, '../../host/node_modules')

const config = createVitestConfig()
const resolve = (config.resolve ??= {})
resolve.alias = {
    ...(resolve.alias as Record<string, string>),
    '@fairflow/shared-ui': path.join(hostNodeModules, '@fairflow/shared-ui'),
    'react-router': path.join(hostNodeModules, 'react-router'),
    swr: path.join(hostNodeModules, 'swr'),
    'react-icons': path.join(hostNodeModules, 'react-icons'),
    'react-icons/pi': path.join(hostNodeModules, 'react-icons/pi'),
    'react-apexcharts': path.join(hostNodeModules, 'react-apexcharts'),
    apexcharts: path.join(hostNodeModules, 'apexcharts'),
    '@testing-library/react': path.join(hostNodeModules, '@testing-library/react'),
    '@testing-library/dom': path.join(hostNodeModules, '@testing-library/dom'),
    '@testing-library/user-event': path.join(
        hostNodeModules,
        '@testing-library/user-event',
    ),
}

export default config
