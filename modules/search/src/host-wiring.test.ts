import { describe, it, expect } from 'vitest'
import {
    getSlotComponentLoader,
    hasSlotComponent,
    hasModuleSettingsPanel,
} from '@/utils/loadRemoteComponent'
import { MODULE_NAV_PRESETS, cardNavigationEntries } from '@/configs/module-nav.config'
import {
    getSlotDescriptor,
    rejectSlotContribution,
} from '@/configs/slot-catalog.config'
import { moduleSettingsPanelTabs } from '@/views/crm/Settings/moduleSettingsTabs'
import type { ModuleCard } from '@/@types/module-card'

/**
 * TODO-258 — разведение двух экранов области SEARCH по владельцам.
 *
 * `SCR-SEARCH-SETTINGS` (`./SearchSettingsTab`) поставляет МОДУЛЬ, host монтирует
 * его напрямую (`ModuleSettingsPanel`) в обход системного слота.
 *
 * `SCR-SEARCH-DIALOG` (overlay в шапке) — chrome ОБОЛОЧКИ и живёт только в хосте
 * (`components/template/Search.tsx`). Ремоут-дубль `./GlobalSearchDialog` снят:
 * он собирался в бандл, но смонтировать его было нельзя ничем (см. тест ниже),
 * и два расходящихся экрана одного поиска расползались по канону.
 *
 * TODO-493: пункта меню у модуля не было — на legacy-пути (platform-эндпоинт
 * недоступен) карточка search не строилась вовсе.
 */

describe('slot-контрибуции модуля search (TODO-258)', () => {
    it('экспоуз вкладки настроек зарегистрирован в обоих написаниях', () => {
        for (const component of ['SearchSettingsTab']) {
            expect(hasSlotComponent('search', component)).toBe(true)
            expect(hasSlotComponent('search', `./${component}`)).toBe(true)
            expect(getSlotComponentLoader('search', component)).toBeTypeOf(
                'function',
            )
        }
    })

    it('незарегистрированный экспоуз по-прежнему резолвится в null (без throw)', () => {
        expect(getSlotComponentLoader('search', 'NopeWidget')).toBeNull()
    })

    it('слот вкладки настроек объявлен в каталоге', () => {
        const settingsTab = getSlotDescriptor('project.settings.tab')
        expect(settingsTab).toBeTruthy()
        // Гейт вкладки настроек — тот же, что проверяет сервер на PUT settings.
        expect(settingsTab?.requires).toBe('project:manage')
    })

    /**
     * Пин решения TODO-258: overlay поиска НЕ приезжает ремоутом, и «починка»
     * рендером `<Slot id="shell.header.action">` его бы не подняла — вклад
     * отвергается контрактом ещё до загрузки бандла. Единственная реализация
     * SCR-SEARCH-DIALOG — host-локальный `components/template/Search.tsx`.
     * Тест красный, если кто-то вернёт дубль-экспоуз или попытается поднять
     * `search` до `kind:"system"` ради попадания в chrome оболочки.
     */
    it('overlay поиска остаётся за хостом: ремоут-дубля нет, слот шапки host-only', () => {
        // Federated remote expose снят (modules/search/vite.config.ts); host-local
        // loader в hostLocalSlotComponentMap — не remote-дубль.
        expect(getSlotComponentLoader('search', 'GlobalSearchDialog')).toBeTypeOf(
            'function',
        )

        // И вернуть remote-экспоуз бесполезно: шапка — chrome, закрытый для не-system.
        expect(getSlotDescriptor('shell.header.action')?.accessKind).toBe(
            'host-only',
        )
        expect(rejectSlotContribution('shell.header.action', 'business')).toBe(
            'HOST_ONLY_SLOT_FORBIDDEN',
        )
        // kind не объявлен манифестом → трактуется как business (тот же отказ).
        expect(rejectSlotContribution('shell.header.action', undefined)).toBe(
            'HOST_ONLY_SLOT_FORBIDDEN',
        )
        // Вкладка настроек — другой случай: OQ-MODULE-130 решён как
        // accessKind:'open' с гейтом requires:'project:manage' (не 'system'),
        // поэтому вклад business-модуля контрактом НЕ отвергается. Вкладка
        // search при этом по-прежнему монтируется host-панелью — пин ниже.
        expect(rejectSlotContribution('project.settings.tab', 'business')).toBeNull()
        expect(hasModuleSettingsPanel('search')).toBe(true)
    })
})

/**
 * TODO-258 (вторая половина): вкладка настроек «Поиск» обязана появляться там
 * же, где сервер разрешает настройки, — под одним `project:manage`. `search`
 * cross-cutting и по умолчанию НЕ включён ни в одном проекте (T-018), поэтому
 * требование enablement делало SCR-SEARCH-SETTINGS недостижимым навсегда.
 */
describe('достижимость вкладки настроек модуля search (TODO-258)', () => {
    const PID = 'p-1'

    it('вкладка есть даже когда модуль search выключен в проекте', () => {
        expect(
            moduleSettingsPanelTabs({
                registry: [
                    { id: 'deals', name: 'Сделки' },
                    { id: 'search', name: 'Поиск' },
                ],
                enabledModuleIds: ['deals'],
                canManageProject: true,
                projectId: PID,
                currentProjectId: PID,
            }),
        ).toEqual([{ moduleId: 'search', label: 'Поиск' }])
    })

    it('без project:manage вкладки нет — гейт остаётся серверным', () => {
        expect(
            moduleSettingsPanelTabs({
                registry: [{ id: 'search', name: 'Поиск' }],
                enabledModuleIds: [],
                canManageProject: false,
                projectId: PID,
                currentProjectId: PID,
            }),
        ).toEqual([])
    })
})

describe('навигация модуля search (TODO-493)', () => {
    it('в пресетах есть /search', () => {
        expect(MODULE_NAV_PRESETS.search).toMatchObject({ path: '/search' })
    })

    it('карточка без manifest-навигации всё равно даёт пункт /search', () => {
        const card: ModuleCard = {
            id: 'search',
            displayName: 'Поиск',
            kind: 'business',
            enabled: true,
        }
        const entries = cardNavigationEntries(card)
        expect(entries.map((e) => e.path)).toEqual(['/search'])
        // Гейт пункта — search:read (то же право, которым гейтится overlay).
        expect(entries[0].requires).toBe('search:read')
    })

    it('manifest-навигация модуля выигрывает у пресета', () => {
        const card: ModuleCard = {
            id: 'search',
            displayName: 'Поиск',
            kind: 'business',
            enabled: true,
            navigation: [{ path: '/search', label: 'Поиск' }],
        }
        expect(cardNavigationEntries(card).map((e) => e.path)).toEqual([
            '/search',
        ])
    })
})
