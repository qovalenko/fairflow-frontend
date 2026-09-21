import { hasModuleSettingsPanel } from '@/utils/loadRemoteComponent'

export interface ModuleSettingsTab {
    moduleId: string
    label: string
}

/**
 * Достижим ли собственный экран настроек модуля для ЭТОГО проекта.
 *
 * Экран модуля живёт в его федеративном бандле и определяет проект своим
 * контекстом (`useCurrentProjectId` → `/p/:pid` или store/localStorage), а
 * маршруты настроек (`/account/projects/:projectId/settings/modules`,
 * `/organization/:orgId/projects/:projectId/...`) позволяют открыть настройки
 * ЧУЖОГО (не текущего) проекта. Поэтому экран модуля предлагаем только когда
 * настраиваемый проект совпадает с текущим — иначе он писал бы настройки не в
 * тот проект. Для остальных случаев остаётся хостовая авто-форма из
 * `settingsSchema`, которая адресует проект явно.
 *
 * Ограничение снимается, когда экраны модулей начнут брать `projectId` из
 * props (слот `project.settings.tab` его и передаёт: `contextProps:['projectId']`).
 */
export function isModuleSettingsPanelReachable(params: {
    moduleId: string
    projectId?: string
    currentProjectId?: string | null
}): boolean {
    const { moduleId, projectId, currentProjectId } = params
    if (!hasModuleSettingsPanel(moduleId)) return false
    return Boolean(projectId) && projectId === currentProjectId
}

/**
 * Модули, чей серверный контракт настроек НЕ требует включённости модуля в
 * проекте, — гейт вкладки обязан повторять серверный, а не быть строже.
 *
 * `search` — cross-cutting возможность, а не opt-in бизнес-модуль (T-018): его
 * BFF-ручки намеренно объявлены БЕЗ `@RequireModule('search')`
 * (`GET /api/search/query`, `/search/settings`, `/search/status` —
 * common-bff.controller.ts), а чтение и запись самих настроек
 * (`GET|PUT /api/projects/:projectId/modules/:moduleId/settings`) гейтятся
 * ТОЛЬКО `project:manage` и штатно создают `moduleConfigs[search]`, которого
 * ещё нет (`if (!found) nextConfigs.push(...)`). При этом ни один проект не
 * включает `search` по умолчанию (control `DEMO_SHOWCASE_MODULES`,
 * module-registry `locked:false`).
 *
 * Из-за этого расхождения вкладка «Поиск» не появлялась НИКОГДА: поиск в шапке
 * и на `/search` работает (те же гейты уже приведены к серверным — Search.tsx,
 * SearchResults.tsx, usePortfolioProjectGuard.ts), а настроить его было нельзя;
 * карточка модуля при этом писала «Настройки модуля — на вкладке „Поиск“»
 * (Settings.tsx, `isModuleSettingsPanelReachable`) и указывала на вкладку,
 * которой нет.
 *
 * Список точечный: для обычных (opt-in) модулей правило «выключен → вкладки
 * нет» остаётся в силе.
 */
export const CROSS_CUTTING_SETTINGS_MODULES: ReadonlySet<string> = new Set([
    'search',
])

/**
 * Вкладки настроек проекта, которые host монтирует напрямую из модулей
 * (`ModuleSettingsPanel`), — FR-PSET-230, host-mount в дополнение к слоту
 * `project.settings.tab` (`open` после OQ-MODULE-130; вклад через слот
 * выигрывает, см. `slotModuleIds`).
 *
 * Правила видимости (Contextual UI + гейт слота `project.settings.tab`):
 *  - только модули, поставляющие собственный экран настроек (реестр в
 *    `loadRemoteComponent.ts`), и только когда он адресует нужный проект;
 *  - только включённые в проекте — КРОМЕ cross-cutting модулей, чей серверный
 *    контракт настроек включённости не требует (`CROSS_CUTTING_SETTINGS_MODULES`);
 *  - только под `project:manage` (тот же `requires`, что у слота);
 *  - вклад через слот выигрывает: если модуль уже смонтирован штатным
 *    mount-point, дубликат-вкладку не создаём.
 */
export function moduleSettingsPanelTabs(params: {
    registry: Array<{ id: string; name: string }>
    enabledModuleIds: string[]
    canManageProject: boolean
    projectId?: string
    currentProjectId?: string | null
    /** Модули, уже смонтированные в слот `project.settings.tab`. */
    slotModuleIds?: string[]
}): ModuleSettingsTab[] {
    const {
        registry,
        enabledModuleIds,
        canManageProject,
        projectId,
        currentProjectId,
        slotModuleIds,
    } = params
    if (!canManageProject) return []
    const fromSlot = new Set(slotModuleIds ?? [])
    return registry
        .filter(
            (m) =>
                isModuleSettingsPanelReachable({
                    moduleId: m.id,
                    projectId,
                    currentProjectId,
                }) &&
                !fromSlot.has(m.id) &&
                hasModuleSettingsPanel(m.id),
        )
        .map((m) => ({ moduleId: m.id, label: m.name }))
}
