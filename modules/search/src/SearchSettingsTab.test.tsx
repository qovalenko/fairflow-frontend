import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

/**
 * TODO-494: вкладка настроек умела редактировать `indexableTypes`, но в
 * `apiSearchReindex` их не передавала — параметр так и оставался без читателя,
 * и домен всегда делал ПОЛНЫЙ реиндекс.
 */

const apiGetSearchSettings = vi.fn()
const apiPutSearchSettings = vi.fn()
const apiSearchStatus = vi.fn()
const apiSearchReindex = vi.fn()
// TODO-492: member-readable проекция настроек (`GET /api/search/settings`).
const apiGetSearchClientSettings = vi.fn()
// Тосты живут в портале document.body с exit-переходом и переживают cleanup
// между тестами, поэтому проверяем не DOM портала, а сам поднятый элемент
// <Notification> — ровно то, что различает исходы (type/title/текст).
const toastPush = vi.fn()
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

let projectId: string | undefined = 'proj-1'
const perms = new Set<string>(['module:manage', 'search:manage'])

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
import useSearchClientSettings, {
    searchClientSettingsKey,
} from '@/utils/hooks/useSearchClientSettings'

const ALL: string[] = [
    'contact',
    'company',
    'deal',
    'order',
    'activity',
    'product',
]

const renderTab = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <SearchSettingsTab />
        </SWRConfig>,
    )

beforeEach(() => {
    vi.clearAllMocks()
    projectId = 'proj-1'
    perms.clear()
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

describe('SearchSettingsTab → реиндекс (TODO-494)', () => {
    it('передаёт частичный набор indexableTypes в apiSearchReindex', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ['contact', 'deal'],
        })

        renderTab()
        const btn = await screen.findByText('Переиндексировать')
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())

        fireEvent.click(btn)

        await waitFor(() => expect(apiSearchReindex).toHaveBeenCalled())
        expect(apiSearchReindex.mock.calls[0][0]).toEqual({
            projectId: 'proj-1',
            entityTypes: ['contact', 'deal'],
        })
    })

    it('полный набор типов = реиндекс без фильтра', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ALL,
        })

        renderTab()
        const btn = await screen.findByText('Переиндексировать')
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())

        fireEvent.click(btn)

        await waitFor(() => expect(apiSearchReindex).toHaveBeenCalled())
        expect(apiSearchReindex.mock.calls[0][0]).toEqual({
            projectId: 'proj-1',
        })
    })

    /**
     * TODO-256: домен умеет сказать «проход неполный» (ReindexResponse.truncated
     * + skipped_types — обрезка бюджетом SEARCH_REINDEX_MAX_DOCS или потерянный
     * лок), но до пользователя это не доходило: тост всегда был зелёный. Админ
     * с заведомо недостроенным индексом видел «успех».
     */
    it('truncated-ответ показывает предупреждение с пропущенными типами, а не «успех»', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ALL,
        })
        apiSearchReindex.mockResolvedValue({
            indexed_count: 7,
            sources: ['contact'],
            truncated: true,
            skipped_types: ['deal', 'order'],
        })

        renderTab()
        const btn = await screen.findByText('Переиндексировать')
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())

        fireEvent.click(btn)

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        const el = toastPush.mock.calls[0][0] as {
            props: { type?: string; title?: string }
        }
        // Не «успех»: исход — предупреждение.
        expect(el.props.type).toBe('warning')
        expect(el.props.title).toBe('Реиндексация неполная')
        // Пропущенные типы названы человекочитаемо и подсказано повторить.
        const text = render(el as never).container.textContent ?? ''
        expect(text).toMatch(/Не достроены типы: Сделки, Продажи/)
        expect(text).toMatch(/Повторите перестройку/)
    })

    it('обычный ответ (truncated=false) остаётся зелёным успехом', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ALL,
        })
        apiSearchReindex.mockResolvedValue({
            indexed_count: 42,
            sources: ALL,
            truncated: false,
            skipped_types: [],
        })

        renderTab()
        const btn = await screen.findByText('Переиндексировать')
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())

        fireEvent.click(btn)

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        const el = toastPush.mock.calls[0][0] as {
            props: { type?: string; title?: string }
        }
        expect(el.props.type).toBe('success')
        expect(el.props.title).toBe('Реиндексация')
        expect(render(el as never).container.textContent ?? '').toMatch(
            /Обработано записей: 42/,
        )
    })

    it('несохранённые правки блокируют реиндекс (иначе уедет старый набор)', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ['contact', 'deal'],
        })

        renderTab()
        await screen.findByText('Переиндексировать')
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())

        // Снимаем галочку типа — форма становится «грязной».
        fireEvent.click(await screen.findByText('Контакты'))

        expect(await screen.findByText('Сначала сохраните настройки')).toBeTruthy()
        fireEvent.click(screen.getByText('Переиндексировать'))
        expect(apiSearchReindex).not.toHaveBeenCalled()
    })

    it('без права search:manage секции реиндекса нет', async () => {
        perms.delete('search:manage')
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ALL,
        })

        renderTab()
        await waitFor(() => expect(apiGetSearchSettings).toHaveBeenCalled())
        expect(screen.queryByText('Переиндексировать')).toBeNull()
    })

    it('без проекта вкладка не ходит в API (ST-19)', () => {
        projectId = undefined
        renderTab()
        expect(apiGetSearchSettings).not.toHaveBeenCalled()
        expect(screen.getByText('Проект не выбран')).toBeTruthy()
    })
})

/**
 * TODO-492 (хвост): вкладка настроек пишет то, что применяет КЛИЕНТ (порог,
 * лимит на тип, Ctrl/Cmd+K), а читает их шапка/страница результатов через
 * member-readable проекцию gateway. Две вещи обязаны сойтись:
 *  1) ключи SWR у админского чтения control-ручки и у клиентской проекции РАЗНЫЕ
 *     (иначе один фетчер перетирает данные другого — кэш SWR глобальный);
 *  2) после сохранения проекция инвалидируется, иначе новые значения доедут
 *     только после перезагрузки страницы.
 */
describe('SearchSettingsTab → клиентская проекция настроек (TODO-492)', () => {
    it('ключ клиентской проекции не совпадает с ключом админского чтения', () => {
        // Ключ вкладки — ['/search/settings', pid] (SearchSettingsTab).
        expect([...searchClientSettingsKey('proj-1')]).not.toEqual([
            '/search/settings',
            'proj-1',
        ])
        expect(searchClientSettingsKey('proj-1')[1]).toBe('proj-1')
    })

    it('сохранение заставляет потребителя проекции перечитать настройки', async () => {
        apiGetSearchSettings.mockResolvedValue({
            minQueryChars: 2,
            perTypeLimit: 5,
            hotkeyEnabled: true,
            indexableTypes: ALL,
        })
        apiPutSearchSettings.mockResolvedValue({
            minQueryChars: 4,
            perTypeLimit: 5,
            hotkeyEnabled: false,
            indexableTypes: ALL,
        })

        // Потребитель проекции (аналог лупы в шапке) смонтирован рядом с вкладкой.
        const Probe = () => {
            const { minQueryChars } = useSearchClientSettings('proj-1')
            return <div data-testid="probe">{minQueryChars}</div>
        }
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <SearchSettingsTab />
                <Probe />
            </SWRConfig>,
        )
        await waitFor(() =>
            expect(apiGetSearchClientSettings).toHaveBeenCalledTimes(1),
        )
        expect(screen.getByTestId('probe').textContent).toBe('2')

        apiGetSearchClientSettings.mockResolvedValue({
            minQueryChars: 4,
            perTypeLimit: 5,
            hotkeyEnabled: false,
            indexableTypes: [],
        })

        // Кнопка «Сохранить» активна только для изменённой формы (ST-30).
        fireEvent.click(await screen.findByText('Контакты'))
        fireEvent.click(await screen.findByText('Сохранить'))

        await waitFor(() => expect(apiPutSearchSettings).toHaveBeenCalled())
        // Без инвалидации проекция осталась бы на старом пороге до перезагрузки.
        await waitFor(() =>
            expect(screen.getByTestId('probe').textContent).toBe('4'),
        )
    })
})
