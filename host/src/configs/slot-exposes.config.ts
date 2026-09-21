/**
 * SINGLE source of truth for the extra (non-main) federated exposes a remote
 * provides for host slots (mountPoints, R4-E1-09 / FR-SHELL-7a).
 *
 * TODO-460/519: this used to be three independent lists that agreed with nobody:
 *  - `host/vite.config.ts` → `REMOTE_SLOT_EXPOSES` (dev direct-import aliases),
 *    which still pointed at `statistics/src/DashboardSlotDemo.tsx` — a file that
 *    no longer exists — and did not know about activities at all;
 *  - `host/src/utils/loadRemoteComponent.ts` → `slotComponentMap` (the runtime
 *    federation loaders), which knew only about activities;
 *  - `host/src/@types/federation-remotes.d.ts`, which declared activities but
 *    not search.
 *
 * Everything derives from this file now. `loadRemoteComponent` still spells its
 * `import()` specifiers out literally (Module Federation needs statically
 * analyzable ids), but a unit test asserts its keys are exactly the entries
 * below, so the two cannot drift again.
 *
 * IMPORTANT — this module is imported by `vite.config.ts`, which runs in Node
 * BEFORE any alias plugin: keep it dependency-free (no `@/` imports, no React).
 */

export interface SlotExpose {
    /**
     * Federated expose name, WITHOUT the leading `./`. This is what the module's
     * `vite.config.ts` declares (`'./ActivityCardTab'`) and what a module card's
     * `mountPoints[].component` carries.
     */
    name: string
    /**
     * Source file of the expose, relative to `modules/<folder>/src/` and without
     * the `.tsx` extension. Differs from `name` when the file is nested
     * (activities keeps its slot components under `src/Activities/`), which is
     * exactly what the old `../modules/<folder>/src/<name>.tsx` formula got wrong.
     */
    source: string
}

/** Federation remote key → module folder under `frontend/modules/`. */
export const REMOTE_FOLDERS = {
    remoteContacts: 'contacts',
    remoteCompanies: 'companies',
    remoteDeals: 'deals',
    remoteOrders: 'orders',
    remoteActivities: 'activities',
    remoteProducts: 'products',
    remoteReports: 'reports',
    remoteDocuments: 'documents',
    remoteAutomation: 'automation',
    remoteStatistics: 'statistics',
    remoteSearch: 'search',
    remoteChat: 'chat',
} as const

export type RemoteKey = keyof typeof REMOTE_FOLDERS

/** Module id (= card id / folder name) → federation remote key. */
export const MODULE_ID_TO_REMOTE_KEY: Record<string, RemoteKey> =
    Object.fromEntries(
        (Object.entries(REMOTE_FOLDERS) as [RemoteKey, string][]).map(
            ([key, folder]) => [folder, key],
        ),
    )

/**
 * Slot exposes per remote. MUST match the `exposes` map of the module's own
 * `vite.config.ts` (minus the main `<Mod>Module` entry).
 */
export const REMOTE_SLOT_EXPOSES: Partial<Record<RemoteKey, SlotExpose[]>> = {
    // Activities (C3-activities-fe): хронология активностей во вкладке карточки
    // сущности (`*.card.tab`) + виджет «Просроченные» на дашборде
    // (`dashboard.widget`). Исходники лежат в `src/Activities/`.
    remoteActivities: [
        { name: 'ActivityCardTab', source: 'Activities/ActivityCardTab' },
        {
            name: 'ActivityOverdueWidget',
            source: 'Activities/ActivityOverdueWidget',
        },
        {
            name: 'ActivityNextStepSidebar',
            source: 'Activities/ActivityNextStepSidebar',
        },
        { name: 'EntityListActionMenu', source: 'Activities/EntityListActionMenu' },
        { name: 'EntityListBulkActionMenu', source: 'Activities/EntityListBulkActionMenu' },
    ],
    // Search: вкладка настроек проекта (`project.settings.tab` / ModuleSettingsPanel).
    // Overlay глобального поиска сюда НЕ входит — chrome host-only (TODO-258).
    remoteSearch: [{ name: 'SearchSettingsTab', source: 'SearchSettingsTab' }],
    remoteContacts: [
        { name: 'CompanyCardContactsTab', source: 'CompanyCardContactsTab' },
        { name: 'DealCardContactTab', source: 'DealCardContactTab' },
        { name: 'ContactsSettingsTab', source: 'ContactsSettingsTab' },
    ],
    remoteDeals: [
        { name: 'DealsCardTab', source: 'Deals/DealsCardTab' },
    ],
    remoteDocuments: [{ name: 'DocumentsSettingsTab', source: 'DocumentsSettingsTab' }],
    remoteAutomation: [
        { name: 'NavDlqBadge', source: 'NavDlqBadge' },
        { name: 'EntityRuleHistoryTab', source: 'EntityRuleHistoryTab' },
    ],
    remoteCompanies: [
        { name: 'ContactCompaniesTab', source: 'mount-points/ContactCompaniesTab' },
        { name: 'DealCompanySidebar', source: 'mount-points/DealCompanySidebar' },
        { name: 'OrderCompanyTab', source: 'mount-points/OrderCompanyTab' },
        { name: 'CompanyQuickCreatePanel', source: 'mount-points/CompanyQuickCreatePanel' },
    ],
    remoteReports: [
        { name: 'MiniReportWidget', source: 'MiniReportWidget' },
    ],
    remoteOrders: [
        { name: 'DealCreateOrderAction', source: 'DealCreateOrderAction' },
        { name: 'OrderListActionMenu', source: 'OrderListActionMenu' },
        { name: 'OrderListBulkActionMenu', source: 'OrderListBulkActionMenu' },
    ],
    // Statistics (FR-STAT-170): dashboard mount-points declared in module-manifests.
    remoteStatistics: [
        { name: 'DashboardKpiMount', source: 'mount-points/DashboardKpiMount' },
        { name: 'DashboardChartsMount', source: 'mount-points/DashboardChartsMount' },
        { name: 'DashboardListsMount', source: 'mount-points/DashboardListsMount' },
    ],
}

/** Flat list of `{ remoteKey, moduleId, expose }` — for cross-registry checks. */
export function slotExposeEntries(): Array<{
    remoteKey: RemoteKey
    moduleId: string
    expose: SlotExpose
}> {
    const out: Array<{
        remoteKey: RemoteKey
        moduleId: string
        expose: SlotExpose
    }> = []
    for (const [key, exposes] of Object.entries(REMOTE_SLOT_EXPOSES) as [
        RemoteKey,
        SlotExpose[],
    ][]) {
        for (const expose of exposes) {
            out.push({ remoteKey: key, moduleId: REMOTE_FOLDERS[key], expose })
        }
    }
    return out
}

/** `remoteSearch/SearchSettingsTab` — the federation virtual module id. */
export function federationId(remoteKey: RemoteKey, exposeName: string): string {
    return `${remoteKey}/${exposeName}`
}
