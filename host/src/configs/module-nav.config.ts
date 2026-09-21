import type {
    ModuleCard,
    ModuleCardNavigation,
} from '@/@types/module-card'

/**
 * Presentation defaults for 1st-party modules: path / icon key / label / order.
 *
 * This is the SINGLE source of nav presentation for built-in modules, replacing
 * the hardcoded navigation tree (navigation.config) and the duplicated
 * `MODULE_ROUTE_ORDER` / `defaultEnabledModules` lists (FR-SHELL-1/2).
 *
 * Note: when a `ModuleCard` from the platform endpoint already carries its own
 * `navigation[]`, that wins — these presets are only a fallback for cards
 * without explicit navigation (and for the legacy degradation path).
 *
 * Icon keys resolve against navigation-icon.config.tsx.
 */
export const MODULE_NAV_PRESETS: Record<
    string,
    { path: string; label: string; icon: string; order: number }
> = {
    statistics: { path: '/statistics', label: 'Статистика', icon: 'reports', order: 10 },
    contacts: { path: '/contacts', label: 'Контакты', icon: 'contacts', order: 20 },
    companies: { path: '/companies', label: 'Компании', icon: 'companies', order: 30 },
    // chat: бизнес-модуль (kind:'business'), съёмный per-project; гейт enablement
    // (Contextual UI) + право chat:read (cardNavigationEntries defaultRequires).
    // order 35 — между companies(30) и deals(40) (06-frontend-contract §1.1).
    chat: { path: '/chat', label: 'Чат', icon: 'chat', order: 35 },
    deals: { path: '/deals', label: 'Сделки', icon: 'deals', order: 40 },
    orders: { path: '/orders', label: 'Продажи', icon: 'orders', order: 50 },
    activities: { path: '/activities', label: 'Активности', icon: 'activities', order: 60 },
    products: { path: '/products', label: 'Продукты', icon: 'products', order: 70 },
    reports: { path: '/reports', label: 'Отчёты', icon: 'reportsChart', order: 80 },
    documents: { path: '/documents', label: 'Документы', icon: 'documents', order: 90 },
    automation: { path: '/automation', label: 'Автоматизация', icon: 'automation', order: 100 },
    // search / notifications: съёмные бизнес-модули, чьи host-экраны объявлены в
    // манифестах (`shared/module-manifests.ts` → nav('/search'…), nav('/notifications'…)).
    // Пресеты нужны легаси-фолбэку (`legacyModulesToCards` отбрасывает id без
    // пресета): без них при недоступном `/platform/modules` пункты исчезают из
    // дерева меню (TODO-236/273). search — cross-cutting (T-018): пункт в меню
    // не гейтится enablement (`ensureCrossCuttingNavCards`), notifications —
    // enablement + `notifications:read`.
    search: { path: '/search', label: 'Поиск', icon: 'search', order: 110 },
    notifications: { path: '/notifications', label: 'Уведомления', icon: 'notifications', order: 120 },
}

/**
 * Cross-cutting modules whose sidebar entry must stay reachable even when the
 * module is not enabled in the project (T-018). Server PEP for search intentionally
 * omits `@RequireModule('search')`; gating the nav item by enablement made the
 * full-page `/search` route unreachable while the header overlay still worked.
 */
export const CROSS_CUTTING_NAV_MODULES: ReadonlySet<string> = new Set(['search'])

/** Synthetic card for a cross-cutting module missing from the platform payload. */
export function syntheticCrossCuttingNavCard(moduleId: string): ModuleCard | null {
    if (!CROSS_CUTTING_NAV_MODULES.has(moduleId)) return null
    const preset = MODULE_NAV_PRESETS[moduleId]
    if (!preset) return null
    return {
        id: moduleId,
        displayName: preset.label,
        icon: preset.icon,
        kind: 'business',
        enabled: true,
        navigation: [
            {
                path: preset.path,
                label: preset.label,
                icon: preset.icon,
                order: preset.order,
                requires: `${moduleId}:read`,
            },
        ],
    }
}

/** Ensure cross-cutting nav modules appear in the menu tree (TODO-493 / T-018). */
export function ensureCrossCuttingNavCards(cards: ModuleCard[]): ModuleCard[] {
    let out = cards
    for (const id of CROSS_CUTTING_NAV_MODULES) {
        if (out.some((c) => c.id === id)) continue
        const synthetic = syntheticCrossCuttingNavCard(id)
        if (synthetic) out = [...out, synthetic]
    }
    return out
}

/**
 * Дополнительные пункты меню сверх основного preset'а (C1-stats-fe / FR-MSTAT-16).
 *
 * Системный модуль `statistics` поставляет ДВА host-экрана ядра — операционный
 * `/dashboard` и аналитический `/statistics` (SCREENS §0, FR-SHELL-20a) — а карточка
 * у него одна. Поэтому к его primary-пункту «Статистика» (`/statistics`) добавляется
 * отдельный пункт «Дашборд» (`/dashboard`). Оба гейтятся правом `statistics:read`
 * (модуль несъёмен, гейт по праву — не по enablement). Закрывает OQ-UX-STATISTICS-15
 * в варианте «отдельный пункт меню».
 */
export const MODULE_NAV_EXTRA: Record<
    string,
    { path: string; label: string; icon: string; order: number; requires?: string }[]
> = {
    statistics: [
        {
            path: '/dashboard',
            label: 'Дашборд',
            icon: 'dashboard',
            order: 5,
            requires: 'statistics:read',
        },
    ],
    // automation-v2: визуальный workflow-редактор (канва) рядом с primary
    // «Автоматизация» (/automation, order 100). Тот же модуль/карточка/гейт —
    // пункт исчезает вместе с карточкой при выключенном модуле (Contextual UI).
    automation: [
        {
            path: '/automation/v2',
            label: 'Автоматизация v2',
            icon: 'automationV2',
            order: 105,
            requires: 'automation:read',
        },
    ],
}

/** Default order for modules without an explicit preset/order (kept stable/deterministic). */
const FALLBACK_ORDER = 1000

/**
 * Resolve the navigation entries a module card contributes to the portfolio menu.
 *
 * Priority:
 *  1. `card.navigation[]` from the platform endpoint (manifest-driven).
 *  2. Preset by module id (1st-party defaults).
 *
 * Cards that contribute no navigation (no nav + no preset) yield an empty list
 * (e.g. system data-providers like `statistics` module proper, or pure
 * mount-point modules) — they simply don't add a menu item.
 */
export function cardNavigationEntries(card: ModuleCard): ModuleCardNavigation[] {
    // Default permission gate for a nav entry: `<moduleId>:read` (R3-E1-10).
    // System modules (FR-SHELL-20a) are still permission-gated, not enablement-gated.
    const defaultRequires = `${card.id}:read`

    // Extra host-owned system screens for this module (e.g. statistics → Дашборд).
    // Always present (host knows them); deduped by path against primary entries.
    const extra: ModuleCardNavigation[] = (MODULE_NAV_EXTRA[card.id] ?? []).map(
        (e) => ({
            path: e.path,
            label: e.label,
            icon: e.icon,
            order: e.order,
            requires: e.requires ?? defaultRequires,
        }),
    )

    let primary: ModuleCardNavigation[]
    if (card.navigation && card.navigation.length) {
        const preset = MODULE_NAV_PRESETS[card.id]
        primary = card.navigation.map((nav, i) => ({
            ...nav,
            icon: nav.icon ?? card.icon ?? preset?.icon ?? card.id,
            order: nav.order ?? preset?.order ?? FALLBACK_ORDER + i,
            label: nav.label || card.displayName || card.id,
            requires: nav.requires ?? defaultRequires,
        }))
    } else {
        const preset = MODULE_NAV_PRESETS[card.id]
        primary = preset
            ? [
                  {
                      path: preset.path,
                      label: card.displayName || preset.label,
                      icon: card.icon ?? preset.icon,
                      order: preset.order,
                      requires: defaultRequires,
                  },
              ]
            : []
    }

    if (extra.length === 0) return primary
    const have = new Set(primary.map((p) => p.path))
    return [...primary, ...extra.filter((e) => !have.has(e.path))]
}

/**
 * Legacy degradation: build minimal cards from a list of enabled module ids
 * (used when the platform endpoint is unavailable). Preserves the working host.
 */
export function legacyModulesToCards(moduleIds: string[]): ModuleCard[] {
    return moduleIds
        .filter((id) => id in MODULE_NAV_PRESETS)
        .map((id) => {
            const preset = MODULE_NAV_PRESETS[id]
            return {
                id,
                displayName: preset.label,
                icon: preset.icon,
                kind: 'business' as const,
                enabled: true,
                navigation: [
                    {
                        path: preset.path,
                        label: preset.label,
                        icon: preset.icon,
                        order: preset.order,
                    },
                ],
            }
        })
}

/**
 * FR-SHELL-170 — derive route prefix → module map from navigation entries.
 */
export function buildRouteToModuleFromCards(
    cards: ModuleCard[],
): Array<{ prefix: string; module: string }> {
    const map = new Map<string, string>()
    for (const card of cards) {
        if (CROSS_CUTTING_NAV_MODULES.has(card.id)) continue
        for (const nav of cardNavigationEntries(card)) {
            if (!map.has(nav.path)) map.set(nav.path, card.id)
        }
    }
    return Array.from(map.entries())
        .map(([prefix, module]) => ({ prefix, module }))
        .sort((a, b) => b.prefix.length - a.prefix.length)
}

function allPresetCards(): ModuleCard[] {
    return Object.keys(MODULE_NAV_PRESETS).map((id) => ({
        id,
        displayName: MODULE_NAV_PRESETS[id].label,
        icon: MODULE_NAV_PRESETS[id].icon,
        kind: id === 'statistics' ? ('system' as const) : ('business' as const),
        enabled: true,
    }))
}

/** Static route table for tests and PROJECT_ROOTS (all 1st-party presets + extras). */
export const ROUTE_TO_MODULE = buildRouteToModuleFromCards(allPresetCards())
