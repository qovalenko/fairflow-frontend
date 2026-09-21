import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import type { SlotContribution } from '@/utils/hooks/useSlotContributions'

const apiGetModulesRegistry = vi.fn()
const apiGetProject = vi.fn()
const apiGetProjectTemplates = vi.fn()
const apiApplyProjectTemplate = vi.fn()
const apiGetInvitations = vi.fn()
// `clearMocks: true` (testing/vitest.shared.ts) wipes implementations between
// tests, so the list-endpoints every tab loads on mount are plain stubs that
// always resolve to an empty list rather than vi.fn()s that lose their impl.
const emptyList = async () => []
// Счётчики (а не vi.fn) по той же причине, что и `emptyList`: `clearMocks`
// стирает реализации между тестами, а нам нужно проверить, что без права
// `project:manage` ручки интеграций не дёргаются вовсе (TODO-279).
const calls = { integrations: 0, apiKeys: 0 }
vi.mock('@/services/CrmService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/CrmService')>()),
    apiGetModulesRegistry: (...a: unknown[]) => apiGetModulesRegistry(...a),
    apiGetProject: (...a: unknown[]) => apiGetProject(...a),
    apiGetProjectTemplates: (...a: unknown[]) => apiGetProjectTemplates(...a),
    apiApplyProjectTemplate: (...a: unknown[]) => apiApplyProjectTemplate(...a),
    apiGetInvitations: (...a: unknown[]) => apiGetInvitations(...a),
    apiGetProjectMembers: emptyList,
    apiGetPipelines: emptyList,
    apiGetDealSources: emptyList,
    apiGetOrderTypes: emptyList,
    apiGetIntegrations: async () => {
        calls.integrations += 1
        return { list: [] }
    },
    apiGetApiKeys: async () => {
        calls.apiKeys += 1
        return { list: [] }
    },
    apiGetProjectAudit: emptyList,
    apiListProjectModuleStates: emptyList,
}))

/** Переключаемый гейт: тесты TODO-279 гоняют вкладки без `project:manage`. */
let permissionGrant = true
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (s?: string, a?: string) =>
        typeof s === 'string' && typeof a === 'string'
            ? permissionGrant
            : () => permissionGrant,
    useRequiresPermission: () => permissionGrant,
}))

vi.mock('@/utils/hooks/useRefreshModules', () => ({
    default: () => vi.fn(),
    platformModulesSwrKey: (id: string) => ['platform/modules', id],
}))

// Federation virtual ids do not resolve under vitest — the slot loader is the
// documented mock boundary (testing/vitest.shared.ts).
const RemoteSearchSettings = () => <div>Настройки поиска (remote)</div>
vi.mock('@/utils/loadRemoteComponent', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/utils/loadRemoteComponent')>()
    return {
        ...actual,
        getSlotComponentLoader: () => async () => ({ default: RemoteSearchSettings }),
        hasSlotComponent: () => true,
    }
})

let slotContributions: SlotContribution[] = []
vi.mock('@/utils/hooks/useSlotContributions', () => ({
    default: () => slotContributions,
}))

vi.mock('@/components/ui/toast', () => ({ default: { push: vi.fn() } }))

const { default: Settings } = await import('./Settings')

const LocationProbe = () => {
    const location = useLocation()
    return <div data-testid="search">{location.search}</div>
}

const renderSettings = (initialEntry = '/account/projects/p1/settings') =>
    render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Settings projectId="p1" />
            <LocationProbe />
        </MemoryRouter>,
    )

beforeEach(() => {
    slotContributions = []
    permissionGrant = true
    calls.integrations = 0
    calls.apiKeys = 0
    apiGetModulesRegistry.mockReset().mockResolvedValue({ list: [] })
    apiGetProject.mockReset().mockResolvedValue({
        name: 'Проект',
        template_id: 'b2b-sales',
    })
    apiGetProjectTemplates.mockReset().mockResolvedValue([
        { id: 'b2b-sales', name: 'B2B продажи' },
    ])
    apiApplyProjectTemplate.mockReset().mockResolvedValue({ id: 'p1' })
    apiGetInvitations.mockReset().mockResolvedValue([])
})

afterEach(cleanup)

/**
 * TODO-454 — вкладка читалась из `?tab=`, но обратно не писалась: ссылку на
 * открытую вкладку скопировать было нельзя и «назад» не возвращал на предыдущую.
 */
describe('Settings — tab ⇄ URL sync (TODO-454)', () => {
    it('writes the selected tab into ?tab=', async () => {
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        await userEvent.click(screen.getByRole('tab', { name: 'Воронки' }))

        await waitFor(() =>
            expect(screen.getByTestId('search').textContent).toBe(
                '?tab=pipelines',
            ),
        )
    })

    it('preserves other query params when switching tabs', async () => {
        renderSettings('/account/projects/p1/settings?from=email')
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        await userEvent.click(screen.getByRole('tab', { name: 'Источники' }))

        await waitFor(() => {
            const search = screen.getByTestId('search').textContent ?? ''
            expect(search).toContain('from=email')
            expect(search).toContain('tab=sources')
        })
    })

    it('?tab= wins over the /settings/modules path suffix, so the tab does not snap back', async () => {
        // Раньше суффикс пути проверялся ПЕРВЫМ: на /settings/modules запись
        // ?tab=general тут же перекрывалась обратно в 'modules'.
        renderSettings('/account/projects/p1/settings/modules')
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        await userEvent.click(screen.getByRole('tab', { name: 'Основное' }))

        await waitFor(() =>
            expect(screen.getByTestId('search').textContent).toBe('?tab=general'),
        )
        expect(screen.getByRole('tab', { name: 'Основное' })).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('opens the deep-linked tab on mount', async () => {
        renderSettings('/account/projects/p1/settings?tab=orderTypes')
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(
            screen.getByRole('tab', { name: 'Типы продаж' }),
        ).toHaveAttribute('aria-selected', 'true')
    })
})

/**
 * TODO-516 — слот `project.settings.tab` объявлен в каталоге, но TabList был
 * зашит на 8 вкладок и `<Slot>` в файле не было: заэкспоженная вкладка настроек
 * модуля физически недостижима из UI.
 */
describe('Settings — module contributions render as tabs (TODO-516)', () => {
    // Реальный вклад из манифеста (backend shared/src/module-manifests.ts):
    // `search` — business-модуль, слот `project.settings.tab` после решения
    // OQ-MODULE-130 открыт (accessKind 'open'), а гейт — право `project:manage`,
    // то же, что стоит на серверных ручках настроек модуля.
    const contribution: SlotContribution = {
        key: 'search::SearchSettingsTab::project.settings.tab',
        moduleId: 'search',
        title: 'Поиск',
        moduleKind: 'business',
        component: 'SearchSettingsTab',
        requires: 'project:manage',
        requiresContext: ['projectId'],
        order: 10,
        wired: true,
    }

    it('renders no extra tabs when nothing contributes', async () => {
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())
        // baseline: 10 host tabs including «Статус команды» (FR-PSET-640)
        expect(screen.getAllByRole('tab')).toHaveLength(10)
    })

    it('renders one tab per contribution, labelled by the module', async () => {
        slotContributions = [contribution]
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.getAllByRole('tab')).toHaveLength(11)
        expect(screen.getByRole('tab', { name: 'Поиск' })).toBeInTheDocument()
    })

    it('mounts the remote component when its tab is opened', async () => {
        slotContributions = [contribution]
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        await userEvent.click(screen.getByRole('tab', { name: 'Поиск' }))

        expect(
            await screen.findByText('Настройки поиска (remote)'),
        ).toBeInTheDocument()
    })

    it('the contributed tab is deep-linkable through ?tab=', async () => {
        slotContributions = [contribution]
        renderSettings(
            `/account/projects/p1/settings?tab=module:search:SearchSettingsTab`,
        )
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })

    it('skips a contribution whose expose is not wired in this host build', async () => {
        slotContributions = [{ ...contribution, wired: false }]
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.getAllByRole('tab')).toHaveLength(10)
        expect(screen.queryByRole('tab', { name: 'Поиск' })).toBeNull()
    })

    /**
     * TODO-103 / OQ-MODULE-130: слот перестал быть `accessKind:'system'`, значит
     * вид модуля больше ничего не гейтит — единственный гейт вкладки это её
     * `requires`. Заголовок обязан исчезать вместе с правом (иначе участник без
     * `project:manage` видел бы вкладку с пустой панелью — ровно дефект TODO-279).
     */
    it('hides the contributed tab from a user who lacks its `requires`', async () => {
        permissionGrant = false
        slotContributions = [contribution]
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.queryByRole('tab', { name: 'Поиск' })).toBeNull()
    })

    it('keeps an ungated contribution visible without any permission', async () => {
        permissionGrant = false
        slotContributions = [{ ...contribution, requires: undefined }]
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.getByRole('tab', { name: 'Поиск' })).toBeInTheDocument()
    })
})

/**
 * TODO-279 — чтения интеграций и API-ключей закрыты на gateway правом
 * `project:manage` (v1-data-bff.controller.ts). Маршрут настроек открыт любому
 * участнику, поэтому вкладка обязана исчезать вместе с правом, а не вести в
 * отказ.
 */
describe('Settings — вкладка «Статус команды» (FR-PSET-640)', () => {
    it('renders TeamStatus inside project settings for managers', async () => {
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        await userEvent.click(screen.getByRole('tab', { name: 'Статус команды' }))

        await waitFor(() => expect(apiGetInvitations).toHaveBeenCalled())
        expect(
            screen.getByText(/Статус онбординга команды/i),
        ).toBeInTheDocument()
    })
})

describe('Settings — применить шаблон (FR-PSET-340)', () => {
    it('calls apply-template from the general tab', async () => {
        renderSettings('/account/projects/p1/settings?tab=general')
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())
        await waitFor(() => expect(apiGetProjectTemplates).toHaveBeenCalled())
        await waitFor(() =>
            expect(screen.getByText('B2B продажи')).toBeInTheDocument(),
        )

        await userEvent.click(
            screen.getByRole('button', { name: 'Применить шаблон' }),
        )

        await waitFor(() =>
            expect(apiApplyProjectTemplate).toHaveBeenCalledWith(
                'p1',
                'b2b-sales',
            ),
        )
    })
})

describe('Settings — вкладка «Интеграции» под project:manage (TODO-279)', () => {
    it('без права вкладка не показывается и ручки интеграций не дёргаются', async () => {
        permissionGrant = false
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(screen.queryByRole('tab', { name: 'Интеграции' })).toBeNull()
        // FR-PLATFORM-250: матрица модулей — read-only без project:manage.
        expect(screen.getByRole('tab', { name: 'Модули' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Доступ' })).toBeNull()
        // без manage: основное, модули, аудит, воронки, типы продаж, источники.
        expect(screen.getAllByRole('tab')).toHaveLength(6)
        expect(calls.integrations).toBe(0)
        expect(calls.apiKeys).toBe(0)
    })

    it('с правом вкладка на месте', async () => {
        renderSettings()
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(
            screen.getByRole('tab', { name: 'Интеграции' }),
        ).toBeInTheDocument()
    })

    it('deep-link ?tab=integrations без права открывает честную заглушку, а не пустую панель', async () => {
        permissionGrant = false
        renderSettings('/account/projects/p1/settings?tab=integrations')
        await waitFor(() => expect(apiGetModulesRegistry).toHaveBeenCalled())

        expect(
            await screen.findByText(
                /Недостаточно прав для просмотра и настройки интеграций/,
            ),
        ).toBeInTheDocument()
        expect(calls.integrations).toBe(0)
        expect(calls.apiKeys).toBe(0)
    })
})
