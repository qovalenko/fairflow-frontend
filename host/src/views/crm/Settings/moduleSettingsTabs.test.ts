import { describe, it, expect, vi } from 'vitest'
import {
    CROSS_CUTTING_SETTINGS_MODULES,
    isModuleSettingsPanelReachable,
    moduleSettingsPanelTabs,
} from './moduleSettingsTabs'

/**
 * `documents` — СИНТЕТИЧЕСКИЙ модуль «со своим экраном настроек»: в реальном
 * реестре (`loadRemoteComponent.moduleSettingsPanelExpose`) экран сегодня
 * поставляет только `search`, а он cross-cutting. Без второго модуля нечем
 * проверить, что для обычных (opt-in) модулей правило «выключен → вкладки нет»
 * осталось строгим. Поведение `search`/`deals` берётся из настоящего реестра.
 */
vi.mock('@/utils/loadRemoteComponent', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/utils/loadRemoteComponent')>()
    return {
        ...actual,
        hasModuleSettingsPanel: (id: string) =>
            id === 'documents' || actual.hasModuleSettingsPanel(id),
    }
})

/**
 * TODO-103 / TODO-258 (FR-PSET-230, FR-SEARCH-360): вкладка настроек модуля
 * `search` в настройках проекта — правила её появления.
 */
const registry = [
    { id: 'deals', name: 'Сделки' },
    { id: 'search', name: 'Поиск' },
]

const PID = 'p-1'

const tabs = (over: Partial<Parameters<typeof moduleSettingsPanelTabs>[0]> = {}) =>
    moduleSettingsPanelTabs({
        registry,
        enabledModuleIds: ['deals', 'search'],
        canManageProject: true,
        projectId: PID,
        currentProjectId: PID,
        ...over,
    })

describe('вкладки настроек проекта, поставляемые модулями', () => {
    it('включённый модуль со своим экраном даёт вкладку', () => {
        expect(tabs()).toEqual([{ moduleId: 'search', label: 'Поиск' }])
    })

    /**
     * TODO-258: гейт вкладки обязан повторять серверный, а не быть строже.
     * `search` нигде не включён по умолчанию (DEMO_SHOWCASE_MODULES без него),
     * а его настройки сервер отдаёт и принимает под одним лишь `project:manage`
     * (`GET|PUT /api/projects/:id/modules/search/settings`, без
     * `@RequireModule`). Требование enablement делало вкладку недостижимой
     * навсегда: поиск работал, а настроить его было нельзя.
     */
    it('cross-cutting search даёт вкладку и при выключенном в проекте модуле', () => {
        expect(tabs({ enabledModuleIds: ['deals'] })).toEqual([
            { moduleId: 'search', label: 'Поиск' },
        ])
        expect(tabs({ enabledModuleIds: [] })).toEqual([
            { moduleId: 'search', label: 'Поиск' },
        ])
        expect(CROSS_CUTTING_SETTINGS_MODULES.has('search')).toBe(true)
    })

    it('обычный (opt-in) модуль вкладки без включения не даёт (Contextual UI, ST-17)', () => {
        const withDocs = [
            { id: 'documents', name: 'Документы' },
            { id: 'search', name: 'Поиск' },
        ]
        expect(CROSS_CUTTING_SETTINGS_MODULES.has('documents')).toBe(false)
        expect(
            tabs({ registry: withDocs, enabledModuleIds: [] }).map(
                (t) => t.moduleId,
            ),
        ).toEqual(['search'])
        expect(
            tabs({ registry: withDocs, enabledModuleIds: ['documents'] }).map(
                (t) => t.moduleId,
            ),
        ).toEqual(['documents', 'search'])
    })

    it('вкладка выключенного search всё равно подчиняется остальным гейтам', () => {
        // project:manage / чужой проект / штатный слот — правила не ослабли.
        expect(
            tabs({ enabledModuleIds: [], canManageProject: false }),
        ).toEqual([])
        expect(tabs({ enabledModuleIds: [], currentProjectId: 'p-2' })).toEqual(
            [],
        )
        expect(
            tabs({ enabledModuleIds: [], slotModuleIds: ['search'] }),
        ).toEqual([])
    })

    it('без project:manage вкладок нет (гейт слота project.settings.tab)', () => {
        expect(tabs({ canManageProject: false })).toEqual([])
    })

    it('штатный вклад через слот выигрывает — дубликата вкладки нет', () => {
        expect(tabs({ slotModuleIds: ['search'] })).toEqual([])
    })

    it('модуль без собственного экрана вкладки не получает', () => {
        expect(
            tabs({ registry: [{ id: 'deals', name: 'Сделки' }] }),
        ).toEqual([])
    })

    it('настройки ЧУЖОГО (не текущего) проекта экран модуля не получает — он бы писал не в тот проект', () => {
        expect(tabs({ currentProjectId: 'p-2' })).toEqual([])
        expect(tabs({ projectId: undefined })).toEqual([])
    })
})

describe('isModuleSettingsPanelReachable', () => {
    it('true только для модуля с экраном и совпадающего проекта', () => {
        expect(
            isModuleSettingsPanelReachable({
                moduleId: 'search',
                projectId: PID,
                currentProjectId: PID,
            }),
        ).toBe(true)
        expect(
            isModuleSettingsPanelReachable({
                moduleId: 'search',
                projectId: PID,
                currentProjectId: 'p-2',
            }),
        ).toBe(false)
        expect(
            isModuleSettingsPanelReachable({
                moduleId: 'deals',
                projectId: PID,
                currentProjectId: PID,
            }),
        ).toBe(false)
    })
})
