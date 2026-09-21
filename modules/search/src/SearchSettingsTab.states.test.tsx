/**
 * SCR-SEARCH-SETTINGS / SCR-SEARCH-STATUS — экранные состояния ST-1/6/7/10/17/29
 * и секция индекса ST-3/6/28.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'

const apiGetSearchSettings = vi.fn()
const apiPutSearchSettings = vi.fn()
const apiSearchStatus = vi.fn()
const apiSearchReindex = vi.fn()
const apiGetSearchClientSettings = vi.fn()
const toastPush = vi.fn()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

let projectId: string | undefined = 'proj-1'
const perms = new Set<string>(['project:manage', 'module:manage', 'search:manage'])

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (s: string, a: string) => perms.has(`${s}:${a}`),
}))
vi.mock('@/services/SearchService', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/services/SearchService')>()
    return {
        ...actual,
        apiGetSearchSettings: (...a: unknown[]) => apiGetSearchSettings(...a),
        apiPutSearchSettings: (...a: unknown[]) => apiPutSearchSettings(...a),
        apiSearchStatus: (...a: unknown[]) => apiSearchStatus(...a),
        apiSearchReindex: (...a: unknown[]) => apiSearchReindex(...a),
        apiGetSearchClientSettings: (...a: unknown[]) =>
            apiGetSearchClientSettings(...a),
    }
})

import SearchSettingsTab from './SearchSettingsTab'

const ALL_TYPES = [
    'contact',
    'company',
    'deal',
    'order',
    'activity',
    'product',
]

const loadedSettings = {
    minQueryChars: 2,
    perTypeLimit: 5,
    hotkeyEnabled: true,
    indexableTypes: ALL_TYPES,
}

const renderTab = (props: { moduleDisabled?: boolean; projectId?: string } = {}) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <SearchSettingsTab projectId={props.projectId ?? projectId} {...props} />
        </SWRConfig>,
    )

beforeEach(() => {
    vi.clearAllMocks()
    projectId = 'proj-1'
    perms.clear()
    perms.add('project:manage')
    perms.add('module:manage')
    perms.add('search:manage')
    apiSearchStatus.mockResolvedValue({
        lastEventProcessedAt: 1,
        lagMs: 100,
        indexedCount: 42,
        freshnessSlaMs: 5000,
    })
    apiSearchReindex.mockResolvedValue({ indexed_count: 42, sources: [] })
    apiGetSearchClientSettings.mockResolvedValue({
        minQueryChars: 2,
        perTypeLimit: 5,
        hotkeyEnabled: true,
        indexableTypes: [],
    })
})

describe('SearchSettingsTab — экранные состояния', () => {
    it('ST-17: модуль выключен', async () => {
        renderTab({ moduleDisabled: true })
        expect(
            screen.getByText('Модуль «Поиск» выключен в этом проекте.'),
        ).toBeInTheDocument()
        expect(screen.queryByText('Минимум символов для поиска')).toBeNull()
    })

    it('ST-10: нет project:manage / module:manage / search:manage', async () => {
        perms.clear()
        renderTab()
        expect(
            screen.getByText('Нужно право управления модулями проекта.'),
        ).toBeInTheDocument()
        expect(screen.queryByText('Минимум символов для поиска')).toBeNull()
    })

    it('ST-1: загрузка настроек', async () => {
        let resolve!: (v: unknown) => void
        apiGetSearchSettings.mockReturnValue(
            new Promise((r) => {
                resolve = r
            }),
        )

        renderTab()

        expect(document.querySelector('[data-qa-id="search.settings.loading"]')).toBeTruthy()

        resolve(loadedSettings)
        await waitFor(() =>
            expect(screen.getByText('Минимум символов для поиска')).toBeInTheDocument(),
        )
    })

    it('ST-6: ошибка загрузки и повтор', async () => {
        const user = userEvent.setup()
        apiGetSearchSettings
            .mockRejectedValueOnce({
                response: {
                    data: { error: { message: 'Gateway timeout', code: 'E504' } },
                },
            })
            .mockResolvedValueOnce(loadedSettings)

        renderTab()

        await waitFor(() =>
            expect(screen.getByText('Gateway timeout')).toBeInTheDocument(),
        )
        expect(screen.getByText('Код: E504')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Повторить' }))

        await waitFor(() =>
            expect(screen.getByText('Минимум символов для поиска')).toBeInTheDocument(),
        )
        expect(apiGetSearchSettings).toHaveBeenCalledTimes(2)
    })

    it('ST-29: успешное сохранение показывает toast', async () => {
        const user = userEvent.setup()
        apiGetSearchSettings.mockResolvedValue(loadedSettings)
        apiPutSearchSettings.mockResolvedValue({
            ...loadedSettings,
            minQueryChars: 3,
        })

        renderTab()
        await waitFor(() =>
            expect(screen.getByText('Минимум символов для поиска')).toBeInTheDocument(),
        )

        await user.click(screen.getByText('Контакты'))
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiPutSearchSettings).toHaveBeenCalled())
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        const el = toastPush.mock.calls[0][0] as {
            props: { type?: string; title?: string }
        }
        expect(el.props.type).toBe('success')
        expect(el.props.title).toBe('Готово')
    })

    it('ST-7: ошибка сохранения показывает danger toast', async () => {
        const user = userEvent.setup()
        apiGetSearchSettings.mockResolvedValue(loadedSettings)
        apiPutSearchSettings.mockRejectedValue({
            response: { data: { error: { message: 'Conflict', code: 'E409' } } },
        })

        renderTab()
        await waitFor(() =>
            expect(screen.getByText('Минимум символов для поиска')).toBeInTheDocument(),
        )

        await user.click(screen.getByText('Контакты'))
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        const el = toastPush.mock.calls[0][0] as {
            props: { type?: string; title?: string }
        }
        expect(el.props.type).toBe('danger')
        expect(el.props.title).toBe('Не удалось сохранить')
    })
})

describe('SearchSettingsTab — SCR-SEARCH-STATUS', () => {
    it('ST-3: пустой индекс подсказывает реиндексацию', async () => {
        apiGetSearchSettings.mockResolvedValue(loadedSettings)
        apiSearchStatus.mockResolvedValue({
            lastEventProcessedAt: null,
            lagMs: 0,
            indexedCount: 0,
            freshnessSlaMs: 5000,
        })

        renderTab()

        await waitFor(() =>
            expect(
                screen.getByText('Индекс пуст — запустите реиндексацию.'),
            ).toBeInTheDocument(),
        )
    })

    it('ST-28: lag выше SLA — предупреждение', async () => {
        apiGetSearchSettings.mockResolvedValue(loadedSettings)
        apiSearchStatus.mockResolvedValue({
            lastEventProcessedAt: 1,
            lagMs: 12000,
            indexedCount: 10,
            freshnessSlaMs: 5000,
        })

        renderTab()

        await waitFor(() =>
            expect(
                screen.getByText(/Индекс отстаёт сильнее ожидаемого/),
            ).toBeInTheDocument(),
        )
    })

    it('ST-6: ошибка статуса индекса и повтор', async () => {
        const user = userEvent.setup()
        apiGetSearchSettings.mockResolvedValue(loadedSettings)
        apiSearchStatus
            .mockRejectedValueOnce({
                response: {
                    data: { error: { message: 'Status unavailable', code: 'E503' } },
                },
            })
            .mockResolvedValueOnce({
                lastEventProcessedAt: 1,
                lagMs: 100,
                indexedCount: 42,
                freshnessSlaMs: 5000,
            })

        renderTab()
        await waitFor(() =>
            expect(screen.getByText('Status unavailable')).toBeInTheDocument(),
        )

        await user.click(screen.getByRole('button', { name: 'Повторить' }))

        await waitFor(() =>
            expect(screen.getByText('Документов в индексе')).toBeInTheDocument(),
        )
        expect(apiSearchStatus).toHaveBeenCalledTimes(2)
    })
})
