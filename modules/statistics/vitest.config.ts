/**
 * Statistics remote test config (T-037 wiring, см. host/testing/README-TESTING.md).
 *
 * База — общая фабрика из host-воркспейса (jsdom + RTL + React-синглтон из
 * host/node_modules). Дополнительно пиним `react-router`, `swr` и
 * `@testing-library/*` на ТУ ЖЕ копию из `host/node_modules`, что и React: этот
 * remote не ставит собственных тестовых зависимостей (под федерацией
 * react/react-router/swr — shared-синглтоны хоста). Без пина `MemoryRouter` в
 * тесте был бы из другого экземпляра роутера, чем в коде модуля, а локальная
 * копия `swr` тянула бы ВТОРОЙ React (`Cannot read properties of null (reading
 * 'useContext')`).
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
    // repoRoot/shared-ui — битый symlink в worktree; резолвим через npm-пакет модуля.
    '@fairflow/shared-ui': path.join(
        thisDir,
        'node_modules/@fairflow/shared-ui/src/index.tsx',
    ),
    'react-router': path.join(hostNodeModules, 'react-router'),
    swr: path.join(hostNodeModules, 'swr'),
    '@testing-library/react': path.join(
        hostNodeModules,
        '@testing-library/react',
    ),
    '@testing-library/dom': path.join(hostNodeModules, '@testing-library/dom'),
}

export default config
