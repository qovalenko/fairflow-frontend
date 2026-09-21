import { describe, it, expect } from 'vitest'
import {
    CROSS_CUTTING_NAV_MODULES,
    ensureCrossCuttingNavCards,
    syntheticCrossCuttingNavCard,
} from '@/configs/module-nav.config'
import { buildNavigationFromCards } from '@/configs/navigation.config'
import type { ModuleCard } from '@/@types/module-card'

/**
 * TODO-493 / T-018: search is cross-cutting — sidebar must expose `/search`
 * even when the module card is disabled in the project (same contract as the
 * header overlay and usePortfolioProjectGuard policy gate).
 */
describe('cross-cutting nav cards (TODO-493)', () => {
    it('search is the only cross-cutting nav module', () => {
        expect([...CROSS_CUTTING_NAV_MODULES]).toEqual(['search'])
    })

    it('syntheticCrossCuttingNavCard builds a /search entry gated by search:read', () => {
        const card = syntheticCrossCuttingNavCard('search')
        expect(card?.navigation?.[0]).toMatchObject({
            path: '/search',
            requires: 'search:read',
        })
    })

    it('ensureCrossCuttingNavCards injects search when absent from enabled cards', () => {
        const enabledOnlyDeals: ModuleCard[] = [
            {
                id: 'deals',
                displayName: 'Сделки',
                kind: 'business',
                enabled: true,
            },
        ]
        const withSearch = ensureCrossCuttingNavCards(enabledOnlyDeals)
        expect(withSearch.map((c) => c.id)).toEqual(['deals', 'search'])

        const tree = buildNavigationFromCards(withSearch)
        const paths = tree.flatMap((g) => g.subMenu?.map((i) => i.path) ?? [])
        expect(paths).toContain('/search')
    })

    it('does not duplicate search when the platform card is already enabled', () => {
        const cards: ModuleCard[] = [
            {
                id: 'search',
                displayName: 'Поиск',
                kind: 'business',
                enabled: true,
                navigation: [{ path: '/search', label: 'Поиск' }],
            },
        ]
        expect(ensureCrossCuttingNavCards(cards)).toHaveLength(1)
    })
})
