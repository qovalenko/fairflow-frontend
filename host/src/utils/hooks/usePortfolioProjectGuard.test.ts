import { describe, it, expect } from 'vitest'
import {
    ROUTE_TO_MODULE,
    PROJECT_ROOTS,
    requiredModuleForPath,
    pathRequiresProject,
} from './usePortfolioProjectGuard'
import {
    MODULE_NAV_PRESETS,
    MODULE_NAV_EXTRA,
    cardNavigationEntries,
} from '@/configs/module-nav.config'
import type { ModuleCard } from '@/@types/module-card'

const statisticsCard: ModuleCard = {
    id: 'statistics',
    displayName: 'Статистика',
    kind: 'system',
    enabled: true,
}

describe('usePortfolioProjectGuard route→module table (statistics)', () => {
    it('гейтит ВСЕ host-экраны модуля statistics, включая /dashboard', () => {
        // Карточка одна, экранов два: /statistics (preset) + /dashboard
        // (MODULE_NAV_EXTRA). Пропуск любого из них = маршрут открыт при
        // выключенном/незапрещённом модуле — регрессия TODO-236/273.
        const paths = cardNavigationEntries(statisticsCard).map((n) => n.path)

        expect(paths).toContain('/statistics')
        expect(paths).toContain('/dashboard')
        for (const path of paths) {
            expect(requiredModuleForPath(path)).toBe('statistics')
        }
    })

    it('матчит вложенные пути дашборда, но не /deals/dashboard', () => {
        expect(requiredModuleForPath('/dashboard')).toBe('statistics')
        expect(requiredModuleForPath('/dashboard/overview')).toBe('statistics')
        // Совпадение только по границе сегмента: дашборд сделок — модуль deals.
        expect(requiredModuleForPath('/deals/dashboard')).toBe('deals')
        // Не подстрока: /dashboards не является экраном статистики.
        expect(requiredModuleForPath('/dashboards')).toBeNull()
    })

    it('не содержит дублей префиксов', () => {
        const prefixes = ROUTE_TO_MODULE.map((r) => r.prefix)
        expect(new Set(prefixes).size).toBe(prefixes.length)
    })

    it('гейтит host-экраны chat/notifications (TODO-273)', () => {
        expect(requiredModuleForPath('/chat')).toBe('chat')
        expect(requiredModuleForPath('/chat/conv-1')).toBe('chat')
        expect(requiredModuleForPath('/notifications')).toBe('notifications')
    })

    it('/search не гейтится включённостью модуля (cross-cutting, T-018)', () => {
        expect(requiredModuleForPath('/search')).toBeNull()
        expect(requiredModuleForPath('/search/anything')).toBeNull()
        expect(ROUTE_TO_MODULE.some((r) => r.prefix === '/search')).toBe(false)
    })
})

describe('usePortfolioProjectGuard — ROUTE_TO_MODULE (TODO-236)', () => {
    it('gates /dashboard by the statistics module (it is a statistics nav entry)', () => {
        expect(requiredModuleForPath('/dashboard')).toBe('statistics')
        expect(MODULE_NAV_EXTRA.statistics.some((n) => n.path === '/dashboard')).toBe(
            true,
        )
    })

    it.each([
        ['/chat', 'chat'],
        ['/notifications', 'notifications'],
    ])('gates %s by the %s module', (path, module) => {
        expect(requiredModuleForPath(path)).toBe(module)
    })

    it('gates nested paths of a mapped root too', () => {
        expect(requiredModuleForPath('/chat/abc-123')).toBe('chat')
        expect(requiredModuleForPath('/notifications/settings')).toBe('notifications')
    })

    it('every mapped module owns a nav entry, so the guard can see it enabled', () => {
        for (const { prefix, module } of ROUTE_TO_MODULE) {
            const preset = MODULE_NAV_PRESETS[module]
            const extra = MODULE_NAV_EXTRA[module] ?? []
            const paths = [
                ...(preset ? [preset.path] : []),
                ...extra.map((e) => e.path),
            ]
            expect(
                paths,
                `module "${module}" (route ${prefix}) has no nav entry`,
            ).toContain(prefix)
        }
    })
})

describe('usePortfolioProjectGuard — pathRequiresProject (TODO-273)', () => {
    it.each([
        '/chat',
        '/chat/conv-1',
        '/search',
        '/notifications',
        '/audit',
        '/roles',
        '/members',
        '/dashboard',
        '/statistics',
        '/deals/42',
        '/p/proj-1',
    ])('requires a selected project for %s', (path) => {
        expect(pathRequiresProject(path)).toBe(true)
    })

    it.each([
        '/',
        '/account/projects',
        '/onboarding',
        '/help/faq',
        '/terms',
        '/settings/audit',
        '/projects',
        '/auth/sign-in',
    ])('does NOT require a project for %s', (path) => {
        expect(pathRequiresProject(path)).toBe(false)
    })

    it('PROJECT_ROOTS is a superset of ROUTE_TO_MODULE plus the management screens', () => {
        for (const { prefix } of ROUTE_TO_MODULE) {
            expect(PROJECT_ROOTS).toContain(prefix)
        }
        expect(PROJECT_ROOTS).toContain('/members')
        expect(PROJECT_ROOTS).toContain('/audit')
        expect(PROJECT_ROOTS).toContain('/roles')
        expect(ROUTE_TO_MODULE.map((r) => r.prefix)).not.toContain('/audit')
        expect(ROUTE_TO_MODULE.map((r) => r.prefix)).not.toContain('/roles')
    })
})
