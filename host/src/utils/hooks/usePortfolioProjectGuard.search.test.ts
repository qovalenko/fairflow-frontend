import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { NAV_ITEM_TYPE_ITEM } from '@/constants/navigation.constant'
import type { NavigationTree } from '@/@types/navigation'

/**
 * TODO-236 / TODO-273: маршрут `/search` — верхнеуровневый роут портфеля
 * (routes.config `portfolio.search`), а не `/p/:pid/...`, поэтому он не попадал
 * в `portfolioRoots` → гвард вообще не срабатывал без выбранного проекта.
 *
 * При этом гейт «модуль search включён в проекте» для этого экрана НЕВЕРЕН:
 * поиск — cross-cutting возможность, ни один проект не включает модуль `search`
 * по умолчанию, а серверный PEP (`GET /api/search/query`) намеренно требует
 * только `@RequirePermission('search','read')` БЕЗ `@RequireModule('search')`.
 * Гвард обязан повторять шапку (Search.tsx) и сервер: закрывает страницу лишь
 * явное deny-правило module-policy на `search:read`.
 *
 * Имя файла — `*.search.test.ts`, а не `usePortfolioProjectGuard.test.ts`:
 * тот же хук параллельно покрывает волна statistics (таблица ROUTE_TO_MODULE
 * и `/dashboard`). Разные имена = нет add/add-конфликта при сведении веток,
 * оба набора тестов живут рядом.
 */

const navigate = vi.fn()
let pathname = '/search'
let resolvedProjectId: string | undefined = 'p1'
let userProjects: Array<{ id: string }> = [{ id: 'p1' }]
let hydrated = true
let searchPolicyFlags: Record<string, boolean> = {}
let navState: { tree: NavigationTree[]; firstPath: string | null; ready: boolean } = {
    tree: [],
    firstPath: '/contacts',
    ready: true,
}

vi.mock('react-router', () => ({
    useLocation: () => ({ pathname }),
    useNavigate: () => navigate,
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: unknown) => unknown) =>
        sel({ user: { projects: userProjects } }),
}))
vi.mock('@/utils/hooks/useResolvedProjectId', () => ({
    default: () => resolvedProjectId,
}))
vi.mock('@/utils/hooks/useSessionHydrated', () => ({
    default: () => hydrated,
}))
vi.mock('@/utils/hooks/useNavigationConfig', () => ({
    useNavigationConfigWithState: () => navState,
}))
vi.mock('@/utils/hooks/useModulePolicy', () => ({
    default: () => ({
        flags: searchPolicyFlags,
        flag: (key: string, defaultValue = true) =>
            key in searchPolicyFlags ? searchPolicyFlags[key] : defaultValue,
    }),
}))

import usePortfolioProjectGuard, {
    ROUTE_TO_MODULE,
    requiredModuleForPath,
} from './usePortfolioProjectGuard'

/** Лист меню для модуля — гвард считает включённым то, что рендерит сайдбар. */
const leaf = (moduleKey: string, path: string): NavigationTree =>
    ({
        key: moduleKey,
        path,
        title: moduleKey,
        translateKey: '',
        icon: moduleKey,
        type: NAV_ITEM_TYPE_ITEM,
        authority: [],
        subMenu: [],
        moduleKey,
    }) as unknown as NavigationTree

beforeEach(() => {
    navigate.mockReset()
    pathname = '/search'
    resolvedProjectId = 'p1'
    userProjects = [{ id: 'p1' }]
    hydrated = true
    searchPolicyFlags = {}
    navState = {
        tree: [leaf('search', '/search'), leaf('contacts', '/contacts')],
        firstPath: '/contacts',
        ready: true,
    }
})

describe('usePortfolioProjectGuard: /search (TODO-236/273)', () => {
    it('при включённом модуле search оставляет /search открытым', () => {
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })

    it('при ВЫКЛЮЧЕННОМ модуле search страница остаётся доступной (контракт сервера: без @RequireModule)', () => {
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })

    it('deny-правило module-policy на search:read уводит на первый пункт меню', () => {
        searchPolicyFlags = { 'search:read': false }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/contacts', { replace: true })
    })

    it('deny + выключенный модуль: fallback тот же (первый пункт меню)', () => {
        searchPolicyFlags = { 'search:read': false }
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/contacts', { replace: true })
    })

    it('без выбранного проекта уводит на /account/projects', () => {
        resolvedProjectId = undefined
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/account/projects', {
            replace: true,
        })
    })

    it('вложенный /search/... тоже под гвардом', () => {
        pathname = '/search/anything'
        resolvedProjectId = undefined
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/account/projects', {
            replace: true,
        })
    })

    it('пока дерево модулей не готово — не выкидывает с /search (гонка T-002)', () => {
        searchPolicyFlags = { 'search:read': false }
        navState = { tree: [], firstPath: null, ready: false }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })

    it('пока проекция прав не загружена (флага нет) — редиректа нет', () => {
        searchPolicyFlags = {}
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })
})

describe('инвариант сведения: /search вне таблицы ROUTE_TO_MODULE', () => {
    it('ни один префикс таблицы не гейтит /search по включённости модуля', () => {
        // Таблица — про «модуль включён в проекте». Появление здесь `/search`
        // (например при ручном сведении с волной statistics) вернуло бы
        // недостижимый экран: модуль `search` не включён ни в одном проекте.
        expect(ROUTE_TO_MODULE.some((r) => r.prefix === '/search')).toBe(false)
        expect(requiredModuleForPath('/search')).toBeNull()
        expect(requiredModuleForPath('/search/anything')).toBeNull()
    })

    it('соседние экраны таблицы гейт не теряют', () => {
        // Страховка от «починили /search — снесли таблицу»: /dashboard —
        // второй host-экран модуля statistics (волна statistics).
        expect(requiredModuleForPath('/contacts')).toBe('contacts')
        expect(requiredModuleForPath('/dashboard')).toBe('statistics')
    })
})
