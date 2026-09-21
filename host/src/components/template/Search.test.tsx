import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

/**
 * TODO-259: глобальный поиск в шапке не возвращал НИ ОДНОГО результата.
 * Клиент (`CommonService.apiGetSearchResult`) ждал массив секций admin-шаблона
 * и не слал projectId, а `GET /api/search/query` отдаёт
 * `{ groups, total, total_by_type }` (common-bff.controller.ts `search`).
 * Теперь шапка ходит через `SearchService.apiSearchQuery` с projectId из
 * контекста проекта и рендерит группы по CRM-типам.
 */

const apiSearchQuery = vi.fn()
// TODO-492: member-readable проекция настроек модуля (`GET /api/search/settings`).
const apiGetSearchClientSettings = vi.fn()
const probeSearchHitAvailability = vi.fn()
const toastPush = vi.fn()
let currentProjectId: string | undefined = 'proj-1'
/** Флаги module-policy проекта для модуля `search` (пусто = правил нет). */
let searchPolicyFlags: Record<string, boolean> = {}

// TODO-262: проекция прав — источник отделов пользователя для scope-пресета.
let visibility:
    | { mode: string; level: string; selfId: string; departmentIds?: string[] }
    | undefined
let allowPermission = true

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => currentProjectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => allowPermission,
}))
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () => visibility,
}))
vi.mock('@/utils/hooks/useModulePolicy', () => ({
    default: (moduleId: string) => {
        const flags = moduleId === 'search' ? searchPolicyFlags : {}
        return {
            flags,
            flag: (key: string, defaultValue = true) =>
                key in flags ? flags[key] : defaultValue,
        }
    },
}))
vi.mock('@/services/SearchService', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/services/SearchService')>()
    return {
        ...actual,
        apiSearchQuery: (...a: unknown[]) => apiSearchQuery(...a),
        apiGetSearchClientSettings: (...a: unknown[]) =>
            apiGetSearchClientSettings(...a),
        probeSearchHitAvailability: (...a: unknown[]) =>
            probeSearchHitAvailability(...a),
    }
})

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import Search from './Search'

const response = {
    groups: [
        {
            entity_type: 'contact' as const,
            type_total: 7,
            list: [
                {
                    id: 'h1',
                    entity_type: 'contact' as const,
                    entity_id: 'c1',
                    title: 'Иванов Иван',
                    subtitle: 'ivanov@example.com',
                    // Домен отдаёт путь со схемой /p/<pid>/…, которой нет в host.
                    path: '/p/proj-1/contacts/c1',
                    score: 1,
                    updated_at: 1,
                },
            ],
        },
    ],
    total: 7,
    total_by_type: { contact: 7 },
}

// Настройки модуля читаются через SWR (useSearchClientSettings). Кэш SWR
// глобальный, поэтому каждому тесту нужен свой провайдер — иначе второй рендер
// берёт значение из кэша и мок-фетчер не вызывается вовсе.
const renderSearch = () =>
    render(
        <MemoryRouter>
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <Search />
            </SWRConfig>
        </MemoryRouter>,
    )

const type = (value: string) => {
    const input = screen.getByPlaceholderText('Поиск по проекту...')
    fireEvent.change(input, { target: { value } })
}

beforeEach(() => {
    apiSearchQuery.mockReset()
    apiSearchQuery.mockResolvedValue(response)
    currentProjectId = 'proj-1'
    searchPolicyFlags = {}
    visibility = undefined
    allowPermission = true
    apiGetSearchClientSettings.mockReset()
    apiGetSearchClientSettings.mockResolvedValue({
        minQueryChars: 2,
        perTypeLimit: 5,
        hotkeyEnabled: true,
        indexableTypes: [],
    })
    probeSearchHitAvailability.mockReset()
    probeSearchHitAvailability.mockResolvedValue(true)
    toastPush.mockReset()
})

describe('шапка: глобальный поиск (TODO-259)', () => {
    it('шлёт projectId и рендерит группы ответа {groups}', async () => {
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)

        type('иван')

        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })
        expect(apiSearchQuery.mock.calls[0][0]).toMatchObject({
            projectId: 'proj-1',
            query: 'иван',
        })

        // Регрессия: раньше нормализация ответа всегда давала [] → «Нет результатов».
        // Заголовок подсвечивается <Highlighter>, поэтому ищем по ссылке хита.
        // Диалог рендерится порталом в body, поэтому ищем по document.
        await waitFor(() =>
            expect(
                document.querySelector('a[href="/contacts/c1"]'),
            ).not.toBeNull(),
        )
        expect(
            document.querySelector('a[href="/contacts/c1"]')?.textContent,
        ).toContain('Иванов Иван')
        expect(screen.getByText('Контакты')).toBeInTheDocument()
        expect(screen.queryByText(/Нет результатов/)).not.toBeInTheDocument()
    })

    it('ссылка результата ведёт на host-маршрут без префикса /p/<pid>', async () => {
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        // Регрессия TODO-493: раньше href был /p/proj-1/contacts/c1 → 404.
        await waitFor(() =>
            expect(
                document.querySelector('a[href="/contacts/c1"]'),
            ).not.toBeNull(),
        )
        expect(document.querySelector('a[href^="/p/"]')).toBeNull()
    })

    it('даёт вход на полноэкранный поиск /search?q= (TODO-493)', async () => {
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        const all = await screen.findByText('Открыть страницу поиска')
        expect(all.getAttribute('href')).toBe('/search?q=%D0%B8%D0%B2%D0%B0%D0%BD')
        // «Показать все N» для типа, где показана лишь часть хитов.
        expect(
            screen.getByText('Показать все 7 →').getAttribute('href'),
        ).toBe('/search?q=%D0%B8%D0%B2%D0%B0%D0%BD&type=contact')
    })

    it('запрос короче порога не уходит на сервер', async () => {
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('и')

        await new Promise((r) => setTimeout(r, 500))
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })

    it('без проекта запрос не уходит и показывается честное состояние', async () => {
        currentProjectId = undefined
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        await new Promise((r) => setTimeout(r, 500))
        expect(apiSearchQuery).not.toHaveBeenCalled()
        expect(screen.getByText(/Выберите проект/)).toBeInTheDocument()
    })

    it('ошибка сервера показывается сообщением контракта, а не пустотой', async () => {
        apiSearchQuery.mockRejectedValue({
            response: { data: { error: { message: 'Поиск недоступен' } } },
        })
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        expect(await screen.findByText('Поиск недоступен')).toBeInTheDocument()
    })

    /**
     * Регрессия ревью (круг 1): гейт лупы был `usePermission()('search','read')`,
     * но каталожный ключ `search:read` попадает в проекцию прав только когда
     * модуль `search` ВКЛЮЧЁН в проекте, а он по умолчанию выключен нигде
     * (module-registry `locked: false`, вне DEMO_SHOWCASE_MODULES). При этом
     * gateway-route `search/query` НЕ навешивает `@RequireModule('search')`
     * (T-018) и пускает любую проектную роль. Итог был «сервер разрешает — фронт
     * прячет»: лупы не было ни у кого, включая владельца.
     */
    it('лупа есть, когда модуль search не включён в проекте (правил policy нет)', () => {
        searchPolicyFlags = {}
        const { container } = renderSearch()
        expect(container.querySelector('.header-action-item')).not.toBeNull()
    })

    it('project-wide deny на search:read прячет лупу', () => {
        // pdp.service: modulePolicyFlags['search']['search:read'] = effect !== 'deny'
        searchPolicyFlags = { 'search:read': false }
        const { container } = renderSearch()
        expect(container.querySelector('.header-action-item')).toBeNull()
    })
})

/**
 * TODO-492 (хвост): настройки модуля «Поиск» сохранялись, но клиент их не читал —
 * шапка была прибита к `DEFAULT_SEARCH_SETTINGS`. Ручка control под
 * `project:manage` рядовому участнику недоступна, поэтому читаем member-readable
 * проекцию gateway `GET /api/search/settings` (гейт `search:read`).
 */
describe('шапка: настройки проекта применяются клиентом (TODO-492)', () => {
    it('настройки запрашиваются под projectId текущего проекта', async () => {
        renderSearch()
        await waitFor(
            () => expect(apiGetSearchClientSettings).toHaveBeenCalled(),
            { timeout: 3000 },
        )
        expect(apiGetSearchClientSettings.mock.calls[0][0]).toBe('proj-1')
    })

    it('perTypeLimit из настроек уходит в /search/query вместо константы 5', async () => {
        apiGetSearchClientSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 2,
            hotkeyEnabled: true,
            indexableTypes: [],
        })
        const { container } = renderSearch()
        await waitFor(
            () => expect(apiGetSearchClientSettings).toHaveBeenCalled(),
            { timeout: 3000 },
        )
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        await waitFor(
            () =>
                expect(
                    apiSearchQuery.mock.calls.some(
                        (c) =>
                            (c[0] as { perTypeLimit?: number }).perTypeLimit === 2,
                    ),
                ).toBe(true),
            { timeout: 3000 },
        )
    })

    it('поднятый minQueryChars придерживает запрос, который проходил при пороге 2', async () => {
        apiGetSearchClientSettings.mockResolvedValue({
            minQueryChars: 5,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: [],
        })
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        // Порог применён — подсказка ST-3 показывает значение из настроек.
        await screen.findByText(/минимум/, undefined, { timeout: 3000 })
        await waitFor(
            () =>
                expect(
                    screen.getByText(/минимум/).textContent,
                ).toContain('5'),
            { timeout: 3000 },
        )

        type('иван')
        await new Promise((r) => setTimeout(r, 600))
        expect(apiSearchQuery).not.toHaveBeenCalled()

        type('иванов')
        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })
    })

    it('Ctrl+K открывает overlay (FR-MSRCH-26)', async () => {
        renderSearch()
        await waitFor(
            () => expect(apiGetSearchClientSettings).toHaveBeenCalled(),
            { timeout: 3000 },
        )

        fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
        await waitFor(
            () =>
                expect(
                    screen.queryByPlaceholderText('Поиск по проекту...'),
                ).not.toBeNull(),
            { timeout: 3000 },
        )
    })

    it('hotkeyEnabled=false снимает слушатель Ctrl+K', async () => {
        apiGetSearchClientSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: false,
            indexableTypes: [],
        })
        renderSearch()
        await waitFor(
            () => expect(apiGetSearchClientSettings).toHaveBeenCalled(),
            { timeout: 3000 },
        )

        fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
        await new Promise((r) => setTimeout(r, 100))
        expect(screen.queryByPlaceholderText('Поиск по проекту...')).toBeNull()
    })

    it('project-wide deny на search:read не даёт ни хоткею, ни ручке настроек сработать', async () => {
        searchPolicyFlags = { 'search:read': false }
        renderSearch()

        await new Promise((r) => setTimeout(r, 200))
        expect(apiGetSearchClientSettings).not.toHaveBeenCalled()
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
        await new Promise((r) => setTimeout(r, 100))
        expect(screen.queryByPlaceholderText('Поиск по проекту...')).toBeNull()
    })

    it('недоступная ручка настроек не ломает поиск — работают дефолты модуля', async () => {
        apiGetSearchClientSettings.mockRejectedValue(new Error('boom'))
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        type('иван')

        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })
        expect(apiSearchQuery.mock.calls[0][0]).toMatchObject({ perTypeLimit: 5 })
    })
})

/**
 * TODO-258: SCR-SEARCH-DIALOG существует в ОДНОМ экземпляре — здесь, в chrome
 * оболочки. Ремоут-дубль `remoteSearch/./GlobalSearchDialog` снят (шапка —
 * `host-only` слот, вклад business-модуля туда отвергается контрактом), поэтому
 * элементы канона, которые жили только в дубле, перенесены в этот компонент.
 */
describe('шапка: перенесённые элементы канона SCR-SEARCH-DIALOG (TODO-258)', () => {
    const open = () => {
        const { container } = renderSearch()
        fireEvent.click(container.querySelector('.header-action-item')!)
        return container
    }

    /** EL-DIALOG-11 / TODO-262 — пресет обязан доезжать до контракта `?scope=`. */
    it('по умолчанию уходит scope=all — пресет только сужает', async () => {
        open()
        type('иван')

        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })
        expect(apiSearchQuery.mock.calls[0][0]).toMatchObject({ scope: 'all' })
    })

    it('выбор «Мои» перезапрашивает поиск с scope=my', async () => {
        open()
        type('иван')
        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })

        fireEvent.click(screen.getByText('Мои'))

        await waitFor(
            () =>
                expect(
                    apiSearchQuery.mock.calls.some(
                        (c) => (c[0] as { scope?: string }).scope === 'my',
                    ),
                ).toBe(true),
            { timeout: 3000 },
        )
    })

    it('«Мой отдел» скрыт без отделов в проекции прав (вариант без эффекта)', () => {
        visibility = {
            mode: 'restricted',
            level: 'own_and_department',
            selfId: 'u1',
            departmentIds: [],
        }
        open()
        expect(screen.queryByText('Мой отдел')).toBeNull()
        expect(screen.queryByText('Все доступные')).not.toBeNull()
    })

    it('пресет целиком скрыт при видимости only_own — сужать нечего', () => {
        visibility = {
            mode: 'restricted',
            level: 'only_own',
            selfId: 'u1',
            departmentIds: ['d1'],
        }
        open()
        expect(screen.queryByText('Все доступные')).toBeNull()
        expect(screen.queryByText('Мой отдел')).toBeNull()
    })

    it('непустой пресет переносится на полный экран (?scope=)', async () => {
        open()
        type('иван')
        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled(), {
            timeout: 3000,
        })
        fireEvent.click(screen.getByText('Мои'))

        await waitFor(() =>
            expect(
                screen
                    .getByText('Открыть страницу поиска')
                    .getAttribute('href'),
            ).toContain('scope=my'),
        )
        expect(
            screen.getByText('Показать все 7 →').getAttribute('href'),
        ).toContain('scope=my')
    })

    /** EL-DIALOG-10 — ↑↓ ведут каретку, Enter открывает выделенное. */
    it('↑↓ выделяют строку, Enter уводит на её карточку и закрывает overlay', async () => {
        open()
        type('иван')
        await waitFor(() =>
            expect(document.querySelector('a[href="/contacts/c1"]')).not.toBeNull(),
        )

        const input = screen.getByPlaceholderText('Поиск по проекту...')
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        await waitFor(() =>
            expect(document.querySelector('[data-active="true"]')).not.toBeNull(),
        )

        fireEvent.keyDown(input, { key: 'Enter' })
        // Enter закрывает overlay (переход выполняет router-navigate).
        await waitFor(() =>
            expect(
                screen.queryByPlaceholderText('Поиск по проекту...'),
            ).toBeNull(),
        )
    })

    it('без результатов ↑↓/Enter ничего не выделяют и overlay не закрывают', async () => {
        apiSearchQuery.mockResolvedValue({
            groups: [],
            total: 0,
            total_by_type: {},
        })
        open()
        type('иван')
        await screen.findByText(/Нет результатов/, undefined, { timeout: 3000 })

        const input = screen.getByPlaceholderText('Поиск по проекту...')
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(document.querySelector('[data-active="true"]')).toBeNull()
        expect(
            screen.queryByPlaceholderText('Поиск по проекту...'),
        ).not.toBeNull()
    })

    /** ST-6 — авто-ретраев нет, повтор ручной. */
    it('«Повторить» после ошибки шлёт запрос заново и показывает результат', async () => {
        apiSearchQuery.mockRejectedValueOnce({
            response: { data: { error: { message: 'Поиск недоступен' } } },
        })
        open()
        type('иван')

        await screen.findByText('Поиск недоступен')
        expect(apiSearchQuery).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByText('Повторить'))

        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalledTimes(2))
        await waitFor(() =>
            expect(document.querySelector('a[href="/contacts/c1"]')).not.toBeNull(),
        )
        expect(screen.queryByText('Поиск недоступен')).toBeNull()
    })

    /** ST-13 + ST-28 — честность выдачи: видимость и лаг индекса. */
    it('показывает visibility-note и предупреждение о лаге индекса', () => {
        open()
        expect(
            screen.getByText(/в рамках вашей видимости/),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Индекс может обновляться с задержкой/),
        ).toBeInTheDocument()
    })

    it('без проекта заметок о видимости нет (ST-19)', () => {
        currentProjectId = undefined
        open()
        expect(screen.queryByText(/в рамках вашей видимости/)).toBeNull()
        expect(screen.queryByText('Все доступные')).toBeNull()
    })

    /** FR-SEARCH-110: stale-хит — toast, overlay не закрывается. */
    it('при недоступной записи показывает toast и остаётся в поиске', async () => {
        probeSearchHitAvailability.mockResolvedValue(false)
        open()
        type('иван')

        await waitFor(() =>
            expect(document.querySelector('a[href="/contacts/c1"]')).not.toBeNull(),
        )

        fireEvent.click(
            document.querySelector('a[href="/contacts/c1"]') as HTMLElement,
        )

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(probeSearchHitAvailability).toHaveBeenCalled()
        // overlay ещё открыт
        expect(screen.getByPlaceholderText('Поиск по проекту...')).toBeInTheDocument()
    })

    it('Enter на stale-хите оставляет overlay открытым', async () => {
        probeSearchHitAvailability.mockResolvedValue(false)
        open()
        type('иван')
        await waitFor(() =>
            expect(document.querySelector('a[href="/contacts/c1"]')).not.toBeNull(),
        )
        const input = screen.getByPlaceholderText('Поиск по проекту...')
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        await waitFor(() =>
            expect(document.querySelector('[data-active="true"]')).not.toBeNull(),
        )
        fireEvent.keyDown(input, { key: 'Enter' })
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(screen.getByPlaceholderText('Поиск по проекту...')).toBeInTheDocument()
    })

    it('Enter при сетевой ошибке probe не бросает и не закрывает overlay', async () => {
        probeSearchHitAvailability.mockRejectedValue(new Error('network'))
        open()
        type('иван')
        await waitFor(() =>
            expect(document.querySelector('a[href="/contacts/c1"]')).not.toBeNull(),
        )
        const input = screen.getByPlaceholderText('Поиск по проекту...')
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        await waitFor(() =>
            expect(document.querySelector('[data-active="true"]')).not.toBeNull(),
        )
        fireEvent.keyDown(input, { key: 'Enter' })
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(screen.getByPlaceholderText('Поиск по проекту...')).toBeInTheDocument()
    })
})
