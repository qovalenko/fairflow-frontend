import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { NAV_ITEM_TYPE_ITEM } from '@/constants/navigation.constant'
import {
    MODULE_NAV_PRESETS,
    legacyModulesToCards,
} from '@/configs/module-nav.config'
import type { NavigationTree } from '@/@types/navigation'

/**
 * TODO-236 / TODO-273 (хвост по замечанию ревью): host-экраны оболочки
 * `/chat`, `/notifications` и `/audit` были живыми маршрутами
 * (routes.config `portfolio.chat` :633, `portfolio.notifications` :623,
 * `project.audit` :983), но отсутствовали и в `portfolioRoots`, и в
 * `ROUTE_TO_MODULE` — прямой URL открывал экран без выбранного проекта и без
 * сверки с модулем.
 *
 * Правило разнесения:
 *  - `/chat`, `/notifications` — съёмные модули (module-registry `chat`/
 *    `notifications`, locked:false), их BFF-ручки несут `@RequireModule`
 *    (chat-bff.controller.ts:221/:244, common-bff.controller.ts:352/:383/…),
 *    поэтому им нужны ОБА списка;
 *  - `/audit` — модуля с таким id в реестре нет → только `portfolioRoots`
 *    (гейт по включённости навсегда закрыл бы экран);
 *  - `/roles` — верхнеуровневого роута не существует вовсе (роли живут под
 *    `/account/projects/roles` и `/settings/projects/roles`), запись была бы
 *    мёртвой.
 *
 * Имя файла — `*.chrome.test.ts`: тот же хук параллельно покрывают волна
 * поиска (`*.search.test.ts`) и волна statistics. Разные имена = нет
 * add/add-конфликта при сведении веток.
 */

const navigate = vi.fn()
let pathname = '/chat'
let resolvedProjectId: string | undefined = 'p1'
let userProjects: Array<{ id: string }> = [{ id: 'p1' }]
let hydrated = true
let navState: {
    tree: NavigationTree[]
    firstPath: string | null
    ready: boolean
} = { tree: [], firstPath: '/contacts', ready: true }

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
        flags: {},
        flag: (_key: string, defaultValue = true) => defaultValue,
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
    pathname = '/chat'
    resolvedProjectId = 'p1'
    userProjects = [{ id: 'p1' }]
    hydrated = true
    navState = {
        tree: [
            leaf('contacts', '/contacts'),
            leaf('chat', '/chat'),
            leaf('notifications', '/notifications'),
        ],
        firstPath: '/contacts',
        ready: true,
    }
})

describe('таблица маршрут → модуль: чат и уведомления', () => {
    it('/chat и вложенная беседа требуют модуль chat', () => {
        expect(requiredModuleForPath('/chat')).toBe('chat')
        expect(requiredModuleForPath('/chat/conv-1')).toBe('chat')
    })

    it('/notifications требует модуль notifications', () => {
        expect(requiredModuleForPath('/notifications')).toBe('notifications')
    })

    it('вне-проектные экраны аккаунта таблицей не задеты (граница сегмента)', () => {
        // `/account/notifications` — личные настройки, не портфельный экран.
        expect(requiredModuleForPath('/account/notifications')).toBeNull()
        expect(requiredModuleForPath('/notificationsomething')).toBeNull()
    })

    it('/audit и /roles НЕ гейтятся включённостью — таких модулей в реестре нет', () => {
        expect(requiredModuleForPath('/audit')).toBeNull()
        expect(ROUTE_TO_MODULE.some((r) => r.prefix === '/audit')).toBe(false)
        expect(ROUTE_TO_MODULE.some((r) => r.prefix === '/roles')).toBe(false)
    })
})

describe('гвард проекта на экранах оболочки', () => {
    it.each(['/chat', '/chat/conv-1', '/notifications', '/audit'])(
        'без выбранного проекта %s уводит на /account/projects',
        (path) => {
            pathname = path
            resolvedProjectId = undefined
            renderHook(() => usePortfolioProjectGuard())
            expect(navigate).toHaveBeenCalledWith('/account/projects', {
                replace: true,
            })
        },
    )

    it('с проектом и включённым модулем /chat остаётся открытым', () => {
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })

    it('при выключенном модуле chat уводит на первый пункт меню', () => {
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/contacts', { replace: true })
    })

    it('при выключенном модуле notifications уводит на первый пункт меню', () => {
        pathname = '/notifications'
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).toHaveBeenCalledWith('/contacts', { replace: true })
    })

    it('/audit при включённом проекте не гейтится модулем (модуля нет в реестре)', () => {
        pathname = '/audit'
        navState = {
            tree: [leaf('contacts', '/contacts')],
            firstPath: '/contacts',
            ready: true,
        }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })

    it('пока дерево модулей не готово — не выкидывает с /chat (гонка T-002)', () => {
        navState = { tree: [], firstPath: null, ready: false }
        renderHook(() => usePortfolioProjectGuard())
        expect(navigate).not.toHaveBeenCalled()
    })
})

describe('legacy-путь меню не теряет гейтящиеся экраны', () => {
    it('chat и notifications имеют пресет — пункт остаётся при недоступном platform-эндпоинте', () => {
        // Гейт по включённости считает модуль включённым только если сайдбар
        // отрисовал его пункт (enabledModuleKeys). Без пресета на legacy-пути
        // (`legacyModulesToCards` фильтрует по MODULE_NAV_PRESETS) пункт
        // пропадал → экран становился недостижимым при живом BFF.
        expect(MODULE_NAV_PRESETS.chat?.path).toBe('/chat')
        expect(MODULE_NAV_PRESETS.notifications?.path).toBe('/notifications')
        const ids = legacyModulesToCards(['chat', 'notifications']).map(
            (c) => c.id,
        )
        expect(ids).toEqual(['chat', 'notifications'])
    })
})
