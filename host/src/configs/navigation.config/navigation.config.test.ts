import { describe, it, expect } from 'vitest'
import { buildNavigationFromCards, firstNavigablePath } from './index'
import { legacyModulesToCards } from '@/configs/module-nav.config'
import { NAV_ITEM_TYPE_ITEM } from '@/constants/navigation.constant'
import type { ModuleCard } from '@/@types/module-card'
import type { NavigationTree } from '@/@types/navigation'

/** Minimal 1st-party card — nav presentation comes from MODULE_NAV_PRESETS. */
const card = (id: string, extra: Partial<ModuleCard> = {}): ModuleCard => ({
    id,
    displayName: id,
    kind: 'business',
    enabled: true,
    ...extra,
})

/** Flatten leaf paths in sidebar render order. */
function leafPaths(tree: NavigationTree[]): string[] {
    const out: string[] = []
    const walk = (items: NavigationTree[]) => {
        for (const item of items) {
            if (item.type === NAV_ITEM_TYPE_ITEM && item.path) out.push(item.path)
            if (item.subMenu?.length) walk(item.subMenu)
        }
    }
    walk(tree)
    return out
}

describe('navigation build + first-module landing (T-002 regression)', () => {
    it('lands on the first ENABLED module, never a disabled /statistics', () => {
        // statistics is NOT enabled for this project → not in the cards.
        const tree = buildNavigationFromCards([card('contacts'), card('deals')])
        const first = firstNavigablePath(tree)

        expect(first).toBe('/contacts')
        // The regression (T-002) was landing on a hardcoded /statistics that the
        // project may have disabled → «Раздел недоступен» + 403 dashboard.
        expect(first).not.toBe('/statistics')
        expect(leafPaths(tree)).not.toContain('/statistics')
        expect(leafPaths(tree)).not.toContain('/dashboard')
    })

    it('orders menu items by module preset order, not by input order', () => {
        // Deliberately shuffled input; presets: contacts=20, companies=30, deals=40.
        const tree = buildNavigationFromCards([
            card('deals'),
            card('contacts'),
            card('companies'),
        ])
        expect(leafPaths(tree)).toEqual(['/contacts', '/companies', '/deals'])
        expect(firstNavigablePath(tree)).toBe('/contacts')
    })

    it('when statistics IS enabled, its dashboard (order 5) leads the menu', () => {
        const tree = buildNavigationFromCards([card('statistics'), card('contacts')])
        // statistics contributes /dashboard (order 5) + /statistics (order 10).
        expect(leafPaths(tree)).toEqual(['/dashboard', '/statistics', '/contacts'])
        expect(firstNavigablePath(tree)).toBe('/dashboard')
    })

    it('returns null for an empty / all-gated tree (caller picks a fallback)', () => {
        expect(buildNavigationFromCards([])).toEqual([])
        expect(firstNavigablePath([])).toBeNull()
    })

    it('legacy degradation cards keep the same enabled-first ordering', () => {
        // Order in the id list must NOT dictate menu order — presets do.
        const cards = legacyModulesToCards(['deals', 'contacts', 'unknown-module'])
        // Unknown modules (no preset) are dropped, not surfaced.
        expect(cards.map((c) => c.id)).toEqual(['deals', 'contacts'])
        const tree = buildNavigationFromCards(cards)
        expect(leafPaths(tree)).toEqual(['/contacts', '/deals'])
    })
})
