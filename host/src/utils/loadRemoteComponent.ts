/* eslint-disable import/no-unresolved -- virtual modules injected by vite-plugin-federation at build time */

/**
 * Slot-contribution loader (R4-E1-09 / FR-SHELL-7a).
 *
 * A module mount-point declares `{ slot, component }` where `component` is an
 * MF-expose name in the remote bundle (RFC-3 §1.5, e.g. `./DealsDashboardWidget`).
 * The host renders that exposed component into the named slot.
 *
 * Module Federation requires statically-analyzable `import()` specifiers, so we
 * cannot build the virtual id from arbitrary runtime strings. Instead we keep an
 * explicit registry keyed by `<moduleId>::<component>` → federation loader. This
 * is the slot analogue of `loadRemoteModule` (which maps module id → main
 * remote). Adding a real slot contribution = exposing it in the module's
 * vite.config + registering its loader here (+ the federation-remotes .d.ts).
 *
 * Unknown `(moduleId, component)` pairs resolve to `null` (the host renders
 * nothing for that contribution) rather than throwing — a card may advertise a
 * mount-point whose expose is not yet wired in this host build; the slot simply
 * stays empty instead of breaking the page.
 */

type RemoteComponentLoader = () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>

/**
 * Registry of wired slot-contribution exposes.
 *
 * Key = `<moduleId>::<component>`, `component` without the leading `./`
 * (`getSlotComponentLoader` normalizes `./Foo` ⇄ `Foo`).
 *
 * The SET of keys is not free-form: it must equal `slotExposeEntries()` from
 * `@/configs/slot-exposes.config` — the one registry `vite.config.ts` and the
 * federation `.d.ts` also follow (TODO-460/519). A unit test asserts the
 * equality, so adding an expose in one place and forgetting the others fails
 * the build instead of silently rendering an empty slot.
 *
 * Only the loader BODIES stay hand-written: Module Federation needs statically
 * analyzable `import()` specifiers, so they cannot be built from runtime strings.
 */
const slotComponentMap: Record<string, RemoteComponentLoader> = {
    // Activities (C3-activities-fe): хронология активностей во вкладке карточки
    // сущности (`*.card.tab`, SCR-ACTIVITIES-CARD-TAB).
    'activities::ActivityCardTab': () =>
        import('remoteActivities/ActivityCardTab'),
    // Activities: виджет «Просроченные» на дашборде (`dashboard.widget`,
    // SCR-ACTIVITIES-DASHBOARD-WIDGET).
    'activities::ActivityOverdueWidget': () =>
        import('remoteActivities/ActivityOverdueWidget'),
    'activities::ActivityNextStepSidebar': () =>
        import('remoteActivities/ActivityNextStepSidebar'),
    'activities::EntityListActionMenu': () =>
        import('remoteActivities/EntityListActionMenu'),
    'activities::EntityListBulkActionMenu': () =>
        import('remoteActivities/EntityListBulkActionMenu'),
    // Search: overlay глобального поиска (SCR-SEARCH-DIALOG) здесь СОЗНАТЕЛЬНО
    // НЕ регистрируется (TODO-258). Шапка — chrome оболочки: слот
    // `shell.header.action` — `accessKind:"host-only"`; `search` — `kind:"business"`.
    // Единственная реализация диалога — host-локальная `components/template/Search.tsx`
    // (TODO-259); `remoteSearch/./GlobalSearchDialog` снят из modules/search.
    // Search: вкладка настроек модуля в настройках проекта (SCR-SEARCH-SETTINGS).
    'search::SearchSettingsTab': () => import('remoteSearch/SearchSettingsTab'),
    'contacts::CompanyCardContactsTab': () => import('remoteContacts/CompanyCardContactsTab'),
    'contacts::DealCardContactTab': () => import('remoteContacts/DealCardContactTab'),
    'contacts::ContactsSettingsTab': () => import('remoteContacts/ContactsSettingsTab'),
    'documents::DocumentsSettingsTab': () => import('remoteDocuments/DocumentsSettingsTab'),
    'automation::NavDlqBadge': () => import('remoteAutomation/NavDlqBadge'),
    'automation::EntityRuleHistoryTab': () =>
        import('remoteAutomation/EntityRuleHistoryTab'),
    'deals::DealsCardTab': () => import('remoteDeals/DealsCardTab'),
    'companies::ContactCompaniesTab': () => import('remoteCompanies/ContactCompaniesTab'),
    'companies::DealCompanySidebar': () => import('remoteCompanies/DealCompanySidebar'),
    'companies::OrderCompanyTab': () => import('remoteCompanies/OrderCompanyTab'),
    'companies::CompanyQuickCreatePanel': () =>
        import('remoteCompanies/CompanyQuickCreatePanel'),
    'reports::MiniReportWidget': () => import('remoteReports/MiniReportWidget'),
    'orders::DealCreateOrderAction': () => import('remoteOrders/DealCreateOrderAction'),
    'orders::OrderListActionMenu': () => import('remoteOrders/OrderListActionMenu'),
    'orders::OrderListBulkActionMenu': () => import('remoteOrders/OrderListBulkActionMenu'),
    'statistics::DashboardKpiMount': () => import('remoteStatistics/DashboardKpiMount'),
    'statistics::DashboardChartsMount': () => import('remoteStatistics/DashboardChartsMount'),
    'statistics::DashboardListsMount': () => import('remoteStatistics/DashboardListsMount'),
}

/**
 * Host-local slot contributions (system chrome without a federated remote).
 * Keys mirror manifest `mountPoints[]` (`<moduleId>::<component>`) and are
 * wired here because notifications/search chrome lives in the host bundle
 * (RFC-3 §1.3 host-only + TODO-258).
 */
const hostLocalSlotComponentMap: Record<string, RemoteComponentLoader> = {
    'search::GlobalSearchDialog': () =>
        import('@/components/template/Search').then((m) => ({
            default: m.default,
        })),
    'notifications::HeaderNotificationBell': () =>
        import('@/components/template/NotificationDropdown').then((m) => ({
            default: m.default,
        })),
    'notifications::NavItemBadge': () =>
        import('@/components/slots/notifications/NavItemBadge'),
    'notifications::AccountMenuItem': () =>
        import('@/components/slots/notifications/AccountMenuItem'),
    'profile::UserProfileDrawer': () =>
        import('@/components/slots/profile/UserProfileDrawer'),
}


function keyFor(moduleId: string, component: string): string {
    return `${moduleId}::${component}`
}

/**
 * Resolve a loader for a module's slot contribution, or `null` when the
 * `(moduleId, component)` pair is not wired in this host build.
 */
export function getSlotComponentLoader(
    moduleId: string,
    component: string,
): RemoteComponentLoader | null {
    const direct = slotComponentMap[keyFor(moduleId, component)]
    if (direct) return direct
    const hostLocal = hostLocalSlotComponentMap[keyFor(moduleId, component)]
    if (hostLocal) return hostLocal
    // Tolerate `./Foo` vs `Foo`.
    const normalized = component.startsWith('./')
        ? component.slice(2)
        : `./${component}`
    return slotComponentMap[keyFor(moduleId, normalized)] ?? null
}

export function hasSlotComponent(moduleId: string, component: string): boolean {
    return getSlotComponentLoader(moduleId, component) !== null
}

/**
 * Модули, поставляющие СОБСТВЕННЫЙ экран настроек в настройки проекта
 * (`<moduleId>` → имя экспоуза в реестре слот-лоадеров выше).
 *
 * Канонический путь такого экрана — mount-point модуля в слот
 * `project.settings.tab`: после решения OQ-MODULE-130 слот `accessKind:"open"`
 * с гейтом `requires:'project:manage'` (slot-catalog.config.ts), так что вклад
 * business-модуля контрактом НЕ отвергается, и `search` объявляет такой
 * mountPoint в манифесте (`backend/shared/src/module-manifests.ts`).
 * Реестр ниже — host-mount того же federated-экспоуза для случаев, когда вклад
 * через слот не смонтирован (не wired / модуль не в реестре карточек), под тем
 * же гейтом `project:manage`; при живом вкладе слот выигрывает и
 * дубликат-вкладка не создаётся (`moduleSettingsPanelTabs`, `slotModuleIds`).
 */
const moduleSettingsPanelExpose: Record<string, string> = {
    search: './SearchSettingsTab',
    contacts: './ContactsSettingsTab',
    documents: './DocumentsSettingsTab',
}

/**
 * Loader экрана настроек модуля, или `null` — если модуль своего экрана не
 * поставляет (host покажет обычную авто-форму из `settingsSchema`).
 */
export function getModuleSettingsPanelLoader(
    moduleId: string,
): RemoteComponentLoader | null {
    const expose = moduleSettingsPanelExpose[moduleId]
    if (!expose) return null
    return getSlotComponentLoader(moduleId, expose)
}

export function hasModuleSettingsPanel(moduleId: string): boolean {
    return getModuleSettingsPanelLoader(moduleId) !== null
}
