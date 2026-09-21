import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

/**
 * TODO-261 — пагинация страницы результатов.
 *
 * AS-IS (дефект): страница рисовала `data.groups`, которые бэкенд строил без
 * учёта `pageIndex`, а кнопка «Вперёд» была активна, пока
 * `(page+1)*pageSize < data.total` — то есть почти всегда. Клик по ней менял
 * `?page=`, слал новый запрос и получал те же самые первые N хитов.
 *
 * TO-BE: срез страницы режет домен, а «есть ли следующая» приходит полем
 * `has_more` — фронт больше не считает это арифметикой по суммарному total
 * (размер страницы задаётся ПО ТИПУ и резолвится gateway'ем из настроек
 * проекта, клиенту он неизвестен).
 */

const apiSearchQuery = vi.fn()
// TODO-492: member-readable проекция настроек модуля (`GET /api/search/settings`).
const apiGetSearchClientSettings = vi.fn()
let projectId: string | undefined = 'proj-1'
let allow = true
/** Флаги module-policy проекта для модуля `search` (пусто = правил нет). */
let searchPolicyFlags: Record<string, boolean> = {}

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => allow,
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
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () => ({
        mode: 'all',
        level: 'custom',
        selfId: 'u1',
        departmentIds: ['d1'],
    }),
}))
vi.mock('@/services/SearchService', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/services/SearchService')>()
    return {
        ...actual,
        apiSearchQuery: (...a: unknown[]) => apiSearchQuery(...a),
        apiGetSearchClientSettings: (...a: unknown[]) =>
            apiGetSearchClientSettings(...a),
    }
})

import SearchResults from './SearchResults'

const hit = (id: string) => ({
    id: `contact:${id}`,
    entity_type: 'contact',
    entity_id: id,
    // Заголовок содержит запрос, поэтому в DOM он разбит <Highlighter> на
    // куски — проверяем не текст, а ссылку хита (стабильный признак записи).
    title: `Иванов ${id}`,
    path: `/p/proj-1/contacts/${id}`,
    score: 1,
    updated_at: 1,
})

/** Ссылка на карточку хита — присутствует ⇔ запись показана на странице. */
const linkFor = (id: string) => document.querySelector(`a[href="/contacts/${id}"]`)
const seeHit = (id: string) =>
    waitFor(() => expect(linkFor(id)).not.toBeNull(), { timeout: 3000 })

/** Ответ одной страницы: 100 видимых контактов, на странице — свои записи. */
const page = (ids: string[], hasMore: boolean) => ({
    groups: [
        {
            entity_type: 'contact',
            type_total: 100,
            list: ids.map((id) => hit(id)),
        },
    ],
    total: 100,
    total_by_type: { contact: 100 },
    has_more: hasMore,
})

const renderPage = (search: string) =>
    render(
        <MemoryRouter initialEntries={[`/search${search}`]}>
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <SearchResults />
            </SWRConfig>
        </MemoryRouter>,
    )

beforeEach(() => {
    vi.clearAllMocks()
    projectId = 'proj-1'
    allow = true
    searchPolicyFlags = {}
    apiGetSearchClientSettings.mockResolvedValue({
        minQueryChars: 2,
        perTypeLimit: 5,
        hotkeyEnabled: true,
        indexableTypes: [],
    })
})

describe('SearchResults: пагинация (TODO-261)', () => {
    it('«Вперёд» ведёт на следующую страницу, и она приносит ДРУГИЕ записи', async () => {
        apiSearchQuery
            .mockResolvedValueOnce(page(['c1', 'c2'], true))
            .mockResolvedValueOnce(page(['c3', 'c4'], true))

        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')

        fireEvent.click(screen.getByText('Вперёд →'))

        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalledTimes(2))
        // Второй запрос — именно за второй страницей.
        expect(apiSearchQuery.mock.calls[1][0]).toMatchObject({ pageIndex: 1 })
        await seeHit('c3')
        expect(linkFor('c1')).toBeNull()
    })

    it('«Вперёд» выключена, когда бэкенд сказал has_more=false — даже при большом total', async () => {
        // total=100 при пустом has_more: старая арифметика (page+1)*25 < 100
        // держала кнопку активной и уводила пользователя на копию первой страницы.
        apiSearchQuery.mockResolvedValue(page(['c1', 'c2'], false))

        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')
        expect(
            (screen.getByText('Вперёд →') as HTMLButtonElement).disabled,
        ).toBe(true)
    })

    it('«Вперёд» включена ровно тогда, когда has_more=true', async () => {
        apiSearchQuery.mockResolvedValue(page(['c1', 'c2'], true))

        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')
        expect(
            (screen.getByText('Вперёд →') as HTMLButtonElement).disabled,
        ).toBe(false)
    })

    it('смена размера страницы возвращает на первую страницу', async () => {
        apiSearchQuery.mockResolvedValue(page(['c1', 'c2'], true))

        renderPage('?q=иван&type=contact&size=25&page=3')

        await seeHit('c1')
        expect(apiSearchQuery.mock.calls[0][0]).toMatchObject({ pageIndex: 3 })

        fireEvent.click(screen.getByText('50'))

        await waitFor(() =>
            expect(apiSearchQuery.mock.calls.at(-1)?.[0]).toMatchObject({
                pageIndex: 0,
                pageSize: 50,
            }),
        )
    })
})

/**
 * TODO-492 (хвост): порог запроса на полном экране тоже был константой сборки.
 * `perTypeLimit` здесь намеренно равен размеру страницы (полный экран не режет
 * выдачу до 5 хитов на тип), а вот `minQueryChars` — настройка проекта.
 */
describe('SearchResults: порог запроса из настроек проекта (TODO-492)', () => {
    it('запрос короче настроенного порога не уходит на сервер', async () => {
        apiGetSearchClientSettings.mockResolvedValue({
            minQueryChars: 5,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: [],
        })
        renderPage('?q=иван&type=contact&size=25')

        // Подсказка ST-3 показывает ЗНАЧЕНИЕ из настроек, а не «2».
        await waitFor(
            () =>
                expect(screen.getByText(/Введите минимум/).textContent).toContain(
                    '5',
                ),
            { timeout: 3000 },
        )
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })

    it('при пороге по умолчанию тот же запрос выполняется', async () => {
        apiSearchQuery.mockResolvedValue(page(['c1'], false))
        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')
    })

    it('недоступная ручка настроек не блокирует поиск (дефолты модуля)', async () => {
        apiGetSearchClientSettings.mockRejectedValue(new Error('403'))
        apiSearchQuery.mockResolvedValue(page(['c1'], false))
        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')
    })
})

/**
 * Гейт экрана vs гейт шапки: `search` — cross-cutting возможность (T-018).
 * Каталожный ключ `search:read` появляется в проекции прав только у проекта с
 * ВКЛЮЧЁННЫМ модулем `search`, а по умолчанию он выключен везде — поэтому
 * прежний `can('search','read')` закрывал рабочий экран, на который ведёт
 * «Показать все N →» из лупы в шапке. Закрывать страницу вправе только явное
 * deny-правило module-policy (тем же признаком гейтятся шапка и маршрут).
 */
describe('SearchResults: гейт доступа (T-018)', () => {
    it('без ключа search:read в проекции прав (модуль выключен) страница ищет, а не отказывает', async () => {
        allow = false // каталог прав без `search:read` — модуль не включён
        apiSearchQuery.mockResolvedValue(page(['c1'], false))

        renderPage('?q=иван&type=contact&size=25')

        await seeHit('c1')
        expect(screen.queryByText('Раздел недоступен')).toBeNull()
    })

    it('deny-правило module-policy на search:read закрывает страницу', async () => {
        searchPolicyFlags = { 'search:read': false }
        apiSearchQuery.mockResolvedValue(page(['c1'], false))

        renderPage('?q=иван&type=contact&size=25')

        await waitFor(() =>
            expect(screen.getByText('Раздел недоступен')).toBeTruthy(),
        )
        // Запрос при этом даже не уходит.
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })
})
