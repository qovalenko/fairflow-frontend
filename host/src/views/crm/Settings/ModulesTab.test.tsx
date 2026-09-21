import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useProjectStore } from '@/store/projectStore'
import { useSessionUser } from '@/store/authStore'
import type { ProjectSettingsPayload } from '@/services/CrmService'

// ── boundaries ──────────────────────────────────────────────────────────────
const apiUpdateProjectSettings = vi.fn()
const apiListProjectModuleStates = vi.fn()
const apiEnableProjectModule = vi.fn()
const apiDisableProjectModule = vi.fn()
const apiPreviewUpgradeProjectModule = vi.fn()
const apiUpgradeProjectModule = vi.fn()
const apiGetProject = vi.fn()
const apiGetModuleDisableImpact = vi.fn()
const apiGetModuleEnableImpact = vi.fn()
const apiGetDealsDisableCascadePreview = vi.fn()
const apiInstallProjectModule = vi.fn()
vi.mock('@/services/CrmService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/CrmService')>()),
    apiUpdateProjectSettings: (...args: unknown[]) =>
        apiUpdateProjectSettings(...args),
    apiListProjectModuleStates: (...args: unknown[]) =>
        apiListProjectModuleStates(...args),
    apiEnableProjectModule: (...args: unknown[]) => apiEnableProjectModule(...args),
    apiDisableProjectModule: (...args: unknown[]) => apiDisableProjectModule(...args),
    apiPreviewUpgradeProjectModule: (...args: unknown[]) =>
        apiPreviewUpgradeProjectModule(...args),
    apiUpgradeProjectModule: (...args: unknown[]) =>
        apiUpgradeProjectModule(...args),
    apiGetProject: (...args: unknown[]) => apiGetProject(...args),
    apiGetModuleDisableImpact: (...args: unknown[]) =>
        apiGetModuleDisableImpact(...args),
    apiGetModuleEnableImpact: (...args: unknown[]) =>
        apiGetModuleEnableImpact(...args),
    apiGetDealsDisableCascadePreview: (...args: unknown[]) =>
        apiGetDealsDisableCascadePreview(...args),
    apiInstallProjectModule: (...args: unknown[]) =>
        apiInstallProjectModule(...args),
}))

let canManage = true
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject?: string, action?: string) =>
        typeof subject === 'string' && typeof action === 'string'
            ? canManage
            : () => canManage,
    useRequiresPermission: () => true,
}))

const refreshModules = vi.fn()
vi.mock('@/utils/hooks/useRefreshModules', () => ({
    default: () => refreshModules,
    platformModulesSwrKey: (id: string) => ['platform/modules', id],
}))

// Settings.tsx рендерит `project.settings.tab`-слот (TODO-516) → тянет
// loadRemoteComponent с федеративными virtual-id, которые под vitest не
// резолвятся (testing/vitest.shared.ts: federation-пути мокаются на границе).
vi.mock('@/utils/loadRemoteComponent', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/utils/loadRemoteComponent')>()
    return {
        ...actual,
        getSlotComponentLoader: () => null,
        hasSlotComponent: () => false,
    }
})

const toastPush = vi.fn()
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

// Imported AFTER the mocks so the component picks them up.
const { ModulesTab } = await import('./Settings')
const { moduleSaveErrorMessage } = await import('./settingsErrors')

const moduleRegistry = [
    {
        id: 'deals',
        name: 'Сделки',
        description: 'Воронка продаж',
        locked: false,
        dependencies: [],
        integrationMethods: [],
        personalSettingsSchema: {},
        integrationSettingsSchema: {},
    },
    {
        id: 'orders',
        name: 'Продажи',
        description: 'Оформление',
        locked: false,
        dependencies: [],
        integrationMethods: [],
        personalSettingsSchema: {},
        integrationSettingsSchema: {},
    },
]

const policyRule = {
    id: 'rule-1',
    moduleId: 'deals',
    effect: 'allow' as const,
    subject: 'manager',
    action: 'read',
    resource: '*',
    condition: {},
}

const seedProject = () => {
    useProjectStore.getState().setCurrentProject({
        id: 'p1',
        name: 'Проект',
        enabledModules: ['deals'],
        effectiveModules: ['deals'],
        moduleConfigs: [
            {
                moduleId: 'deals',
                enabled: true,
                personalSettings: {},
                integrationSettings: {},
                integrationMethodsEnabled: [],
            },
            {
                moduleId: 'orders',
                enabled: false,
                installed: true,
                personalSettings: {},
                integrationSettings: {},
                integrationMethodsEnabled: [],
            },
        ],
        modulePolicies: [policyRule],
    })
    useSessionUser.setState((s) => ({
        ...s,
        user: {
            ...s.user,
            projects: [
                { id: 'p1', name: 'Проект', color: '#000', role: 'owner' },
            ],
        },
    }))
}

/** Toggle for a module card, in registry order. */
const toggles = () =>
    screen
        .getAllByRole('checkbox')
        .filter((el) => el.getAttribute('data-qa-module'))

beforeEach(() => {
    canManage = true
    apiUpdateProjectSettings.mockReset()
    apiEnableProjectModule.mockReset()
    apiDisableProjectModule.mockReset()
    apiListProjectModuleStates.mockReset()
    apiPreviewUpgradeProjectModule.mockReset()
    apiUpgradeProjectModule.mockReset()
    apiGetProject.mockReset()
    apiGetModuleEnableImpact.mockReset().mockResolvedValue({
        cascadeModules: [],
    })
    apiInstallProjectModule.mockReset()
    refreshModules.mockReset()
    apiListProjectModuleStates.mockResolvedValue([])
    apiEnableProjectModule.mockResolvedValue({ module_id: 'orders', enabled: true })
    apiDisableProjectModule.mockResolvedValue({ module_id: 'deals', enabled: false })
    apiGetProject.mockResolvedValue({
        module_configs: [
            { module_id: 'deals', enabled: true },
            { module_id: 'orders', enabled: true },
        ],
        effective_modules: ['deals', 'orders'],
    })
    toastPush.mockReset()
    localStorage.clear()
    seedProject()
})

afterEach(() => {
    cleanup()
    useProjectStore.setState({ currentProject: null, currentProjectId: null })
})

describe('ModulesTab — module set is saved WITHOUT re-submitting policies (TODO-241)', () => {
    it('toggling a module on calls enable API and omits modulePolicies from settings save', async () => {
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(toggles()[1]) // enable «orders»

        await waitFor(() => expect(apiEnableProjectModule).toHaveBeenCalledWith('p1', 'orders'))
        expect(apiUpdateProjectSettings).not.toHaveBeenCalled()
        await waitFor(() =>
            expect(refreshModules).toHaveBeenCalledWith('p1', {
                enabledModuleIds: ['deals', 'orders'],
            }),
        )
    })

    it('saving module settings also omits modulePolicies', async () => {
        apiUpdateProjectSettings.mockResolvedValue({
            id: 'p1',
            name: 'Проект',
            modules: ['deals'],
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(
            screen.getByRole('button', { name: /Сохранить настройки модуля/ }),
        )

        await waitFor(() => expect(apiUpdateProjectSettings).toHaveBeenCalled())
        const payload = apiUpdateProjectSettings.mock
            .calls[0][1] as ProjectSettingsPayload
        expect('modulePolicies' in payload).toBe(false)
    })
})

describe('ModulesTab — failed save is reported and rolled back (TODO-242)', () => {
    it('403 PERMISSION_DENIED: toggle returns to its previous position + notify', async () => {
        apiEnableProjectModule.mockRejectedValue({
            response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        const ordersToggle = toggles()[1]
        expect(ordersToggle).not.toBeChecked()

        await userEvent.click(ordersToggle)

        // Оптимистичный стейт откатился: сервер остался со старым набором.
        await waitFor(() => expect(toggles()[1]).not.toBeChecked())
        expect(toastPush).toHaveBeenCalled()
    })

    it('DEPENDENTS_ENABLED names the dependent modules in the message', async () => {
        apiGetDealsDisableCascadePreview.mockResolvedValue({
            cascadeModules: [{ id: 'orders', name: 'Продажи' }],
            openDealCount: 0,
        })
        apiDisableProjectModule.mockRejectedValue({
            response: {
                status: 409,
                data: {
                    code: 'DEPENDENTS_ENABLED',
                    details: { dependents: ['orders', 'documents'] },
                },
            },
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(toggles()[0]) // try to switch «deals» off
        await screen.findByText(/Выключить модуль «Сделки»?/i)
        await userEvent.click(screen.getByRole('button', { name: /Подтвердить выключение/i }))

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(
            moduleSaveErrorMessage({
                response: {
                    status: 409,
                    data: {
                        code: 'DEPENDENTS_ENABLED',
                        details: { dependents: ['orders', 'documents'] },
                    },
                },
            }),
        ).toContain('orders, documents')
        await waitFor(() => expect(toggles()[0]).toBeChecked())
    })
})

describe('ModulesTab — disable confirm dialogs', () => {
    it('shows deals cascade dialog before disabling deals (when not locked)', async () => {
        apiGetDealsDisableCascadePreview.mockResolvedValue({
            cascadeModules: [{ id: 'orders', name: 'Продажи' }],
            openDealCount: 3,
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(toggles()[0])

        expect(apiGetDealsDisableCascadePreview).toHaveBeenCalledWith('p1')
        expect(apiGetModuleDisableImpact).not.toHaveBeenCalled()
        expect(apiUpdateProjectSettings).not.toHaveBeenCalled()
        expect(
            await screen.findByText(/Выключить модуль «Сделки»?/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/3 незавершённых сделок/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /Подтвердить выключение/i }))
        await waitFor(() =>
            expect(apiDisableProjectModule).toHaveBeenCalledWith('p1', 'deals', {
                cascade: true,
            }),
        )
    })

    it('shows generic disable-impact dialog before disabling a non-deals module', async () => {
        useProjectStore.getState().setCurrentProject({
            ...useProjectStore.getState().currentProject!,
            enabledModules: ['deals', 'orders'],
            effectiveModules: ['deals', 'orders'],
            moduleConfigs: [
                {
                    moduleId: 'deals',
                    enabled: true,
                    personalSettings: {},
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                },
                {
                    moduleId: 'orders',
                    enabled: true,
                    personalSettings: {},
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                },
            ],
        })
        apiGetModuleDisableImpact.mockResolvedValue({
            unfinishedRecords: 2,
            dependentEnabledModules: [{ id: 'documents', name: 'Документы' }],
            stoppedAutomations: [],
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(toggles()[1])

        expect(apiGetModuleDisableImpact).toHaveBeenCalledWith('p1', 'orders')
        expect(apiGetDealsDisableCascadePreview).not.toHaveBeenCalled()
        expect(apiUpdateProjectSettings).not.toHaveBeenCalled()
        expect(
            await screen.findByText(/Выключить модуль «Продажи»?/i),
        ).toBeInTheDocument()
        expect(screen.getByText(/2 незавершённых/)).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: /Подтвердить выключение/i }))
        await waitFor(() =>
            expect(apiDisableProjectModule).toHaveBeenCalledWith('p1', 'orders', {
                cascade: true,
            }),
        )
    })
})

describe('ModulesTab — gated by project:manage (TODO-447)', () => {
    it('without the permission the toggles are disabled and Save is hidden', async () => {
        canManage = false
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        for (const t of toggles()) expect(t).toBeDisabled()
        expect(
            screen.queryByRole('button', { name: /Сохранить настройки модуля/ }),
        ).toBeNull()
        expect(
            screen.getByText(/Изменять его может только участник/),
        ).toBeInTheDocument()
    })

    it('without the permission a toggle click never reaches the API', async () => {
        canManage = false
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(toggles()[1])

        expect(apiUpdateProjectSettings).not.toHaveBeenCalled()
        expect(apiEnableProjectModule).not.toHaveBeenCalled()
        expect(apiDisableProjectModule).not.toHaveBeenCalled()
    })

    it('without the permission still loads the module matrix (FR-PLATFORM-250)', async () => {
        canManage = false
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await waitFor(() => expect(apiListProjectModuleStates).toHaveBeenCalledWith('p1'))
    })

    it('with the permission the toggles are enabled and Save is shown', () => {
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)
        for (const t of toggles()) expect(t).not.toBeDisabled()
        expect(
            screen.getByRole('button', { name: /Сохранить настройки модуля/ }),
        ).toBeInTheDocument()
    })
})

describe('ModulesTab — upgrade preview + confirmMajor (TODO-448)', () => {
    it('major upgrade asks for confirmation then sends confirmMajor:true', async () => {
        apiListProjectModuleStates.mockResolvedValue([
            {
                module_id: 'deals',
                state: 'enabled',
                enabled: true,
                installed: true,
                locked: false,
                kind: 'crm',
                version: '1.0.0',
                latest_version: '2.0.0',
                upgrade_available: true,
            },
            {
                module_id: 'orders',
                state: 'disabled',
                enabled: false,
                installed: false,
                locked: false,
                kind: 'crm',
                version: '1.0.0',
                latest_version: '1.0.0',
                upgrade_available: false,
            },
        ])
        apiPreviewUpgradeProjectModule.mockResolvedValue({
            module_id: 'deals',
            from_version: '1.0.0',
            to_version: '2.0.0',
            upgrade_class: 'major',
            requires_confirmation: true,
            migration_required: false,
        })
        apiUpgradeProjectModule.mockResolvedValue({
            module_id: 'deals',
            version: '2.0.0',
        })

        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument(),
        )

        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))

        await waitFor(() => expect(apiPreviewUpgradeProjectModule).toHaveBeenCalledWith(
            'p1',
            'deals',
            { toVersion: '2.0.0' },
        ))
        expect(apiUpgradeProjectModule).not.toHaveBeenCalled()

        await waitFor(() =>
            expect(
                screen.getByText(/Подтвердите major-обновление модуля/),
            ).toBeInTheDocument(),
        )
        const upgradeButtons = screen.getAllByRole('button', { name: 'Обновить' })
        await userEvent.click(upgradeButtons[upgradeButtons.length - 1]!)

        await waitFor(() => expect(apiUpgradeProjectModule).toHaveBeenCalledWith(
            'p1',
            'deals',
            { toVersion: '2.0.0', confirmMajor: true },
        ))
    })

    it('patch upgrade skips confirmation dialog', async () => {
        apiListProjectModuleStates.mockResolvedValue([
            {
                module_id: 'deals',
                state: 'enabled',
                enabled: true,
                installed: true,
                locked: false,
                kind: 'crm',
                version: '1.0.0',
                latest_version: '1.0.1',
                upgrade_available: true,
            },
        ])
        apiPreviewUpgradeProjectModule.mockResolvedValue({
            module_id: 'deals',
            from_version: '1.0.0',
            to_version: '1.0.1',
            upgrade_class: 'patch',
            requires_confirmation: false,
            migration_required: false,
        })
        apiUpgradeProjectModule.mockResolvedValue({
            module_id: 'deals',
            version: '1.0.1',
        })

        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument(),
        )

        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))

        await waitFor(() => expect(apiUpgradeProjectModule).toHaveBeenCalledWith(
            'p1',
            'deals',
            { toVersion: '1.0.1', confirmMajor: false },
        ))
        expect(
            screen.queryByText(/Подтвердите major-обновление модуля/),
        ).toBeNull()
    })

    it('shows enable-impact dialog before enabling a module with hard deps (FR-PSET-050)', async () => {
        useProjectStore.getState().setCurrentProject({
            ...useProjectStore.getState().currentProject!,
            enabledModules: ['deals', 'contacts'],
            effectiveModules: ['deals', 'contacts'],
            moduleConfigs: [
                {
                    moduleId: 'deals',
                    enabled: true,
                    personalSettings: {},
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                },
                {
                    moduleId: 'contacts',
                    enabled: true,
                    personalSettings: {},
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                },
                {
                    moduleId: 'orders',
                    enabled: false,
                    personalSettings: {},
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                },
            ],
        })
        apiGetModuleEnableImpact.mockResolvedValue({
            cascadeModules: [{ id: 'deals', name: 'Сделки' }],
        })
        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        const ordersToggle = toggles().find(
            (el) => el.getAttribute('data-qa-module') === 'orders',
        )
        expect(ordersToggle).toBeTruthy()
        await userEvent.click(ordersToggle!)

        expect(apiGetModuleEnableImpact).toHaveBeenCalledWith('p1', 'orders')
        expect(
            await screen.findByText(/Включить модуль «Продажи»?/i),
        ).toBeInTheDocument()
        expect(apiUpdateProjectSettings).not.toHaveBeenCalled()
        await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    })
})

describe('ModulesTab — install lifecycle (FR-PSET-220)', () => {
    it('installs a not-yet-installed module via lifecycle API', async () => {
        apiListProjectModuleStates.mockResolvedValue([
            {
                module_id: 'deals',
                state: 'enabled',
                enabled: true,
                installed: true,
                locked: false,
                kind: 'crm',
                version: '1.0.0',
                latest_version: '1.0.0',
                upgrade_available: false,
            },
            {
                module_id: 'orders',
                state: 'disabled',
                enabled: false,
                installed: false,
                locked: false,
                kind: 'crm',
                version: '1.0.0',
                latest_version: '1.0.0',
                upgrade_available: false,
            },
        ])
        apiInstallProjectModule.mockResolvedValue({
            module_id: 'orders',
            installed: true,
        })
        apiGetProject.mockResolvedValue({
            module_configs: [
                {
                    module_id: 'orders',
                    enabled: false,
                    personal_settings: {},
                    integration_settings: {},
                    integration_methods_enabled: [],
                },
            ],
        })

        render(<ModulesTab projectId="p1" moduleRegistry={moduleRegistry} />)

        await userEvent.click(screen.getByRole('button', { name: /Продажи/ }))

        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Установить' })).toBeInTheDocument(),
        )

        await userEvent.click(screen.getByRole('button', { name: 'Установить' }))

        await waitFor(() =>
            expect(apiInstallProjectModule).toHaveBeenCalledWith('p1', 'orders'),
        )
    })
})
