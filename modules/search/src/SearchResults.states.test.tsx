/**
 * SCR-SEARCH-RESULTS — экранные состояния ST-1/3/4/6/10/19 и фильтры EL-RESULTS-2/3.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

const apiSearchQuery = vi.fn()
const apiGetSearchClientSettings = vi.fn()

let projectId: string | undefined = 'proj-1'
let allowContactsRead = true
let searchPolicyFlags: Record<string, boolean> = {}
let visibilityScope = {
    mode: 'all' as string,
    level: 'custom' as string,
    selfId: 'u1',
    departmentIds: ['d1'] as string[],
}

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'contacts' && action === 'read' ? allowContactsRead : true,
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
    useVisibilityScope: () => visibilityScope,
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

const hit = (id: string, type: 'contact' | 'deal' = 'contact') => ({
    id: `${type}:${id}`,
    entity_type: type,
    entity_id: id,
    title: `Запись ${id}`,
    path: `/p/proj-1/${type}s/${id}`,
    score: 1,
    updated_at: 1,
})

const responseWithHits = () => ({
    groups: [
        {
            entity_type: 'contact',
            type_total: 1,
            list: [hit('c1')],
        },
        {
            entity_type: 'deal',
            type_total: 2,
            list: [hit('d1', 'deal')],
        },
    ],
    total: 3,
    total_by_type: { contact: 1, deal: 2 },
    has_more: false,
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
    allowContactsRead = true
    searchPolicyFlags = {}
    visibilityScope = {
        mode: 'all',
        level: 'custom',
        selfId: 'u1',
        departmentIds: ['d1'],
    }
    apiGetSearchClientSettings.mockResolvedValue({
        minQueryChars: 2,
        perTypeLimit: 5,
        hotkeyEnabled: true,
        indexableTypes: [],
    })
})

afterEach(() => {
    vi.useRealTimers()
})

describe('SearchResults — экранные состояния', () => {
    it('ST-19: проект не выбран', () => {
        projectId = undefined
        renderPage('?q=иван')
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })

    it('ST-10: deny search:read закрывает экран', async () => {
        searchPolicyFlags = { 'search:read': false }
        renderPage('?q=иван')
        await waitFor(() =>
            expect(screen.getByText('Раздел недоступен')).toBeInTheDocument(),
        )
        expect(
            screen.getByText(/Поиск отключён политикой проекта/),
        ).toBeInTheDocument()
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })

    it('ST-1: первичная загрузка показывает skeleton', async () => {
        let resolve!: (v: unknown) => void
        apiSearchQuery.mockReturnValue(
            new Promise((r) => {
                resolve = r
            }),
        )

        renderPage('?q=иван')

        expect(screen.getByText('Результаты поиска')).toBeInTheDocument()
        await waitFor(() => expect(apiSearchQuery).toHaveBeenCalled())
        expect(document.querySelector('[data-qa-id="search.results.loading"]')).toBeTruthy()

        resolve(responseWithHits())
        await waitFor(() =>
            expect(screen.getByText('Запись c1')).toBeInTheDocument(),
        )
    })

    it('ST-6: ошибка поиска и повтор', async () => {
        const user = userEvent.setup()
        apiSearchQuery
            .mockRejectedValueOnce({
                response: {
                    data: { error: { message: 'Сервис недоступен', code: 'E503' } },
                },
            })
            .mockResolvedValueOnce(responseWithHits())

        renderPage('?q=иван')

        await waitFor(() =>
            expect(screen.getByText('Сервис недоступен')).toBeInTheDocument(),
        )
        expect(screen.getByText('Код: E503')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Повторить' }))

        await waitFor(() =>
            expect(screen.getByText('Запись c1')).toBeInTheDocument(),
        )
        expect(apiSearchQuery).toHaveBeenCalledTimes(2)
    })

    it('ST-3: без достаточной длины запроса — подсказка, без запроса', async () => {
        renderPage('?q=и')
        await waitFor(() =>
            expect(
                screen.getByText('Уточните поисковый запрос, чтобы увидеть результаты.'),
            ).toBeInTheDocument(),
        )
        expect(apiSearchQuery).not.toHaveBeenCalled()
    })

    it('ST-4: пустая выдача по запросу', async () => {
        apiSearchQuery.mockResolvedValue({
            groups: [],
            total: 0,
            total_by_type: {},
            has_more: false,
        })

        renderPage('?q=иван')

        await waitFor(() =>
            expect(
                screen.getByText(/Ничего не найдено по «иван»/),
            ).toBeInTheDocument(),
        )
    })

    it('с данными: группы, хиты и футер видимости', async () => {
        apiSearchQuery.mockResolvedValue(responseWithHits())

        renderPage('?q=иван')

        await waitFor(() =>
            expect(screen.getByText('Запись c1')).toBeInTheDocument(),
        )
        expect(screen.getByText('Запись d1')).toBeInTheDocument()
        expect(
            screen.getByText('Данные и счётчики — в рамках вашей видимости.'),
        ).toBeInTheDocument()
        expect(
            screen.getByText('Индекс может обновляться с задержкой'),
        ).toBeInTheDocument()
    })
})

describe('SearchResults — фильтры EL-RESULTS-2/3', () => {
    it('EL-RESULTS-2: chip типа сужает запрос', async () => {
        const user = userEvent.setup()
        apiSearchQuery.mockResolvedValue(responseWithHits())

        renderPage('?q=иван')

        await waitFor(() =>
            expect(screen.getByText(/Сделки \(2\)/)).toBeInTheDocument(),
        )

        await user.click(screen.getByText(/Сделки \(2\)/))

        await waitFor(() =>
            expect(apiSearchQuery.mock.calls.at(-1)?.[0]).toMatchObject({
                entityTypes: ['deal'],
                pageIndex: 0,
            }),
        )
    })

    it('EL-RESULTS-3: пресет «Мои» уходит в scope=my', async () => {
        const user = userEvent.setup()
        apiSearchQuery.mockResolvedValue(responseWithHits())

        renderPage('?q=иван&scope=all')

        await waitFor(() => expect(screen.getByText('Мои')).toBeInTheDocument())
        await user.click(screen.getByText('Мои'))

        await waitFor(() =>
            expect(apiSearchQuery.mock.calls.at(-1)?.[0]).toMatchObject({
                scope: 'my',
                pageIndex: 0,
            }),
        )
    })

    it('EL-RESULTS-3: «Мой отдел» скрыт без departmentIds', async () => {
        visibilityScope = {
            mode: 'all',
            level: 'custom',
            selfId: 'u1',
            departmentIds: [],
        }
        apiSearchQuery.mockResolvedValue(responseWithHits())

        renderPage('?q=иван')

        await waitFor(() =>
            expect(screen.getByText('Запись c1')).toBeInTheDocument(),
        )
        expect(screen.queryByText('Мой отдел')).toBeNull()
    })
})
