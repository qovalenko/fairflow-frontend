import {
    NAV_ITEM_TYPE_TITLE,
    NAV_ITEM_TYPE_ITEM,
} from '@/constants/navigation.constant'
import { cardNavigationEntries } from '@/configs/module-nav.config'
import type { NavigationTree } from '@/@types/navigation'
import type { ModuleCard } from '@/@types/module-card'

/**
 * Manifest-driven navigation builder (R3-E1-08-fe / FR-SHELL-1/2/3).
 *
 * The portfolio menu is derived from the project's module cards
 * (`GET /api/v1/platform/modules` → ModuleCard[]) instead of a hardcoded tree.
 * The "Портфель" group itself is kernel chrome (FR-SHELL-20) and stays here;
 * its children come entirely from the cards.
 *
 * Each card may contribute one or more nav entries (path/label/icon/order/
 * requires). Entries are sorted by `order` (ascending; ties broken by module id
 * then path for determinism — FR-SHELL-7b spirit).
 */
export function buildNavigationFromCards(cards: ModuleCard[]): NavigationTree[] {
    const items: NavigationTree[] = []

    for (const card of cards) {
        const entries = cardNavigationEntries(card)
        for (const nav of entries) {
            items.push({
                // Key must match the route key (routes.config) for active-state
                // highlighting (useMenuActive matches nav.key ↔ routeKey). A card
                // may contribute several entries (statistics → Дашборд+Статистика),
                // so the key is derived per-path, not per-card (FR-MSTAT-16).
                key: navKeyForPath(card.id, nav.path),
                path: nav.path,
                title: nav.label,
                translateKey: '',
                icon: nav.icon ?? card.id,
                type: NAV_ITEM_TYPE_ITEM,
                authority: [],
                subMenu: [],
                moduleKey: card.id,
                requiresProject: true,
                // requires (subject:action) — gated by usePermission (R3-E1-10).
                ...(nav.requires ? { requires: nav.requires } : {}),
            })
        }
    }

    items.sort((a, b) => {
        const oa = orderOf(cards, a.moduleKey, a.path)
        const ob = orderOf(cards, b.moduleKey, b.path)
        if (oa !== ob) return oa - ob
        const km = (a.moduleKey ?? '').localeCompare(b.moduleKey ?? '')
        if (km !== 0) return km
        return a.path.localeCompare(b.path)
    })

    if (items.length === 0) return []

    return [
        {
            key: 'portfolio',
            path: '',
            title: 'Портфель',
            translateKey: '',
            icon: 'portfolio',
            type: NAV_ITEM_TYPE_TITLE,
            authority: [],
            requiresProject: true,
            subMenu: items,
        },
    ]
}

/**
 * Nav-item key aligned with the route key (routes.config: `portfolio.<seg.seg…>`).
 * Most modules expose one entry whose first path segment = card id
 * (`/contacts` → `portfolio.contacts`). The statistics card exposes two
 * (`/statistics`, `/dashboard`) → distinct keys `portfolio.statistics` /
 * `portfolio.dashboard`, both matching their routes for active highlighting.
 *
 * ВСЕ сегменты пути склеиваются через '.', иначе пункты одного модуля с общим
 * первым сегментом дают одинаковый ключ (`/automation` и `/automation/v2` оба →
 * `portfolio.automation`) — дубль React-ключа в меню + неверная подсветка. Полный
 * путь даёт `/automation/v2` → `portfolio.automation.v2`, совпадая с ключом роута.
 * Falls back to the card id when the path has no usable segment.
 */
function navKeyForPath(cardId: string, path: string): string {
    const segs = path.replace(/^\/+/, '').split('/').filter(Boolean)
    return `portfolio.${segs.length ? segs.join('.') : cardId}`
}

function orderOf(
    cards: ModuleCard[],
    moduleKey: string | undefined,
    path: string,
): number {
    if (!moduleKey) return Number.MAX_SAFE_INTEGER
    const card = cards.find((c) => c.id === moduleKey)
    if (!card) return Number.MAX_SAFE_INTEGER
    const entry = cardNavigationEntries(card).find((n) => n.path === path)
    return entry?.order ?? Number.MAX_SAFE_INTEGER
}

/**
 * First navigable (leaf `item`) path in a built navigation tree, in the exact
 * order the sidebar renders. Used by the project entry redirect so a user
 * landing on `/p/:pid` goes to the FIRST enabled/permitted module in the menu —
 * never a hardcoded `/statistics` that may be disabled (→ «Раздел недоступен»).
 *
 * The tree is already gated by enablement (only enabledCards) and permissions
 * (filterByPermission) upstream, so its first leaf is the first thing the user
 * can actually open. Returns `null` for an empty tree (caller picks a fallback).
 */
export function firstNavigablePath(tree: NavigationTree[]): string | null {
    for (const item of tree) {
        if (item.type === NAV_ITEM_TYPE_ITEM && item.path) {
            return item.path
        }
        if (item.subMenu?.length) {
            const nested = firstNavigablePath(item.subMenu)
            if (nested) return nested
        }
    }
    return null
}
