/**
 * Automation remote test config — по образцу `modules/contacts/vitest.config.ts`.
 * @xyflow/react и @dagrejs/* живут только в node_modules automation (fe-p0),
 * vitest/runner — в symlink на `frontend/modules/deals/node_modules`.
 * classnames/tailwind-merge — из `frontend/modules/companies/node_modules`
 * (host deps, которых нет в deals).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVitestConfig } from '../../host/testing/vitest.shared'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const hostNodeModules = path.resolve(moduleDir, '../../host/node_modules')
const companiesNm = path.resolve(moduleDir, '../companies/node_modules')
const automationNm = path.resolve(moduleDir, 'node_modules')
const fromHost = (pkg: string) => path.join(hostNodeModules, pkg)
const fromCompanies = (pkg: string) => path.join(companiesNm, pkg)
const fromAutomation = (pkg: string) => path.join(automationNm, pkg)

const base = createVitestConfig({
    setupFiles: [path.join(moduleDir, 'src/testing/setup-mocks.tsx')],
})

export default {
    ...base,
    define: { ...base.define, __QA_IDS_ENABLED__: true },
    resolve: {
        ...base.resolve,
        alias: {
            ...(base.resolve?.alias as Record<string, string>),
            // host symlink может быть битым на CI — локальный stub для vitest
            '@fairflow/shared-ui': path.join(moduleDir, 'src/testing/shared-ui-stub.tsx'),
            'react-router': fromHost('react-router'),
            swr: fromHost('swr'),
            dayjs: fromHost('dayjs'),
            zustand: fromHost('zustand'),
            lodash: fromHost('lodash'),
            axios: fromHost('axios'),
            'framer-motion': fromHost('framer-motion'),
            '@floating-ui/react': fromCompanies('@floating-ui/react'),
            classnames: fromCompanies('classnames'),
            'tailwind-merge': fromCompanies('tailwind-merge'),
            'react-modal': path.join(moduleDir, 'src/testing/react-modal-stub.tsx'),
            'react-icons/pi': fromHost('react-icons/pi'),
            'react-icons/cg': fromHost('react-icons/cg'),
            '@testing-library/react': fromHost('@testing-library/react'),
            '@testing-library/user-event': fromHost('@testing-library/user-event'),
            '@xyflow/react': fromAutomation('@xyflow/react'),
            '@xyflow/react/dist/style.css': fromAutomation('@xyflow/react/dist/style.css'),
            '@dagrejs/dagre': fromAutomation('@dagrejs/dagre'),
            '@dagrejs/graphlib': fromAutomation('@dagrejs/graphlib'),
        },
    },
}
