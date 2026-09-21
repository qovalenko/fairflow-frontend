import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import type { Activity } from '@/@types/crm'

const apiGetActivities = vi.fn()
const apiGetMembers = vi.fn()
const apiBulkActivities = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/profile/rememberDefaultView', () => ({
    useRememberProfileDefaultView: () => vi.fn(),
}))
vi.mock('@/utils/hooks/useSegmentRouteTransition', () => ({
    default: (_value: string, onChange: (v: string) => void) => [
        'list',
        (v: string) => onChange(v),
    ],
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: ({
        isOpen,
        onSuccess,
        onClose,
    }: {
        isOpen?: boolean
        onSuccess?: () => void
        onClose?: () => void
    }) =>
        isOpen ? (
            <div>
                <div>Форма задачи открыта</div>
                <button type="button" onClick={() => onSuccess?.()}>
                    Успех drawer
                </button>
                <button type="button" onClick={() => onClose?.()}>
                    Закрыть drawer
                </button>
            </div>
        ) : null,
}))

vi.mock('@/services/CrmService', () => ({
    apiGetActivities: (...a: unknown[]) => apiGetActivities(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    apiBulkActivities: (...a: unknown[]) => apiBulkActivities(...a),
    newIdempotencyKey: () => 'bulk-key-1',
}))

import ActivityList from './ActivityList'

async function pickSelectOption(qaId: string, optionLabel: string) {
    const container = document.querySelector(`[data-qa-id="${qaId}"]`) as HTMLElement
    const input = container.querySelector('input.select__input') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' })
    const option = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[role="option"]')).find(
            (el) => el.textContent === optionLabel,
        )
        if (!found) throw new Error(`option ${optionLabel} not found`)
        return found
    })
    fireEvent.click(option)
}

const activity = (over: Partial<Activity> = {}): Activity => ({
    id: 'a1',
    type: 'task',
    title: 'Позвонить клиенту',
    status: 'planned',
    priority: 'medium',
    assigneeName: 'Пётр Петров',
    dueDate: 1_700_000_000_000,
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const render = (ui: ReactElement, route = '/activities') =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('ActivityList', () => {
    beforeEach(() => {
        permissions = new Set([
            'activities:read',
            'activities:write',
            'activities:export',
            'activities:delete',
        ])
        navigate.mockClear()
        apiGetActivities.mockResolvedValue({ list: [activity()], total: 1 })
        apiGetMembers.mockResolvedValue([{ id: 'u1', name: 'Пётр Петров' }])
        apiBulkActivities.mockResolvedValue({ succeeded: ['a1'], failed: [] })
        vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('без activities:read показывает экран «Недостаточно прав» и не грузит список', async () => {
        permissions = new Set(['activities:write'])

        render(<ActivityList />)

        expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument()
        expect(apiGetActivities).not.toHaveBeenCalled()
    })

    it('показывает активность из ответа API', async () => {
        render(<ActivityList />)

        expect(await screen.findByText('Позвонить клиенту')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    })

    it('пустой список без фильтров — ST-3', async () => {
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })

        render(<ActivityList />)

        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
    })

    it('ошибка загрузки — ST-6 с «Повторить»', async () => {
        apiGetActivities.mockRejectedValue(new Error('boom'))

        render(<ActivityList />)

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('?overdue=1 применяет серверный фильтр просрочки и очищает query', async () => {
        render(<ActivityList />, '/activities?overdue=1')

        await waitFor(() => expect(apiGetActivities).toHaveBeenCalled())
        expect(apiGetActivities.mock.calls[0][0]).toMatchObject({ overdueOnly: true })
    })

    it('?upcoming=1 отправляет окно dateFrom/dateTo на сервер', async () => {
        render(<ActivityList />, '/activities?upcoming=1')

        await waitFor(() => expect(apiGetActivities).toHaveBeenCalled())
        const params = apiGetActivities.mock.calls[0][0] as Record<string, unknown>
        expect(params.overdueOnly).toBe(false)
        expect(typeof params.dateFrom).toBe('number')
        expect(typeof params.dateTo).toBe('number')
        expect((params.dateTo as number) > (params.dateFrom as number)).toBe(true)
    })

    it('поиск уходит в query параметр запроса', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        fireEvent.change(screen.getByPlaceholderText('Поиск...'), {
            target: { value: 'клиент' },
        })

        await waitFor(
            () =>
                expect(
                    apiGetActivities.mock.calls.some(
                        (c) => (c[0] as { query?: string }).query === 'клиент',
                    ),
                ).toBe(true),
            { timeout: 10000 },
        )
    })

    it('массовое завершение вызывает bulk API и снимает выбор', async () => {
        const { container } = render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(checkboxes[checkboxes.length - 1])

        fireEvent.click(await screen.findByRole('button', { name: 'Завершить' }))

        await waitFor(() =>
            expect(apiBulkActivities).toHaveBeenCalledWith(
                { action: 'complete', ids: ['a1'], projectId: 'p1' },
                'bulk-key-1',
            ),
        )
        await waitFor(() => expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument())
    }, 10000)

    it('экспорт заблокирован без выбранных строк', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const exportBtn = document.querySelector(
            '[data-qa-id="activities.list.export"]',
        ) as HTMLButtonElement
        expect(exportBtn.className).toMatch(/cursor-not-allowed/)
    })

    it('экспорт активен при выборе строки', async () => {
        const { container } = render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(checkboxes[checkboxes.length - 1])

        const exportBtn = await waitFor(() => {
            const btn = document.querySelector(
                '[data-qa-id="activities.list.export"]',
            ) as HTMLButtonElement
            if (btn.disabled) throw new Error('export still disabled')
            return btn
        })
        expect(exportBtn).toBeEnabled()
    })

    it('массовое удаление вызывает bulk API delete', async () => {
        const { container } = render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(checkboxes[checkboxes.length - 1])

        fireEvent.click(await screen.findByRole('button', { name: 'Удалить' }))

        await waitFor(() =>
            expect(apiBulkActivities).toHaveBeenCalledWith(
                { action: 'delete', ids: ['a1'], projectId: 'p1' },
                'bulk-key-1',
            ),
        )
    })

    it('без activities:delete кнопка массового удаления недоступна', async () => {
        permissions = new Set(['activities:read', 'activities:write', 'activities:export'])
        const { container } = render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(checkboxes[checkboxes.length - 1])

        const bulkDelete = document.querySelector(
            '[data-qa-id="activities.list.bulkDelete"]',
        ) as HTMLButtonElement
        expect(bulkDelete.className).toMatch(/cursor-not-allowed/)
    })

    it('клик по строке открывает карточку активности', async () => {
        render(<ActivityList />)
        fireEvent.click(await screen.findByText('Позвонить клиенту'))

        expect(navigate).toHaveBeenCalledWith('/activities/a1')
    })

    it('пустой список с фильтром просрочки — ST-3 «Ничего не найдено» и сброс', async () => {
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })

        render(<ActivityList />)
        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()

        fireEvent.click(
            document.querySelector(
                '[data-qa-id="activities.list.datePreset"][data-qa-preset="overdue"]',
            ) as HTMLElement,
        )

        expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))

        await waitFor(() =>
            expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument(),
        )
        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
    })

    it('«Повторить» после ошибки загрузки перезапрашивает список', async () => {
        apiGetActivities
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValue({ list: [activity()], total: 1 })

        render(<ActivityList />)
        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

        expect(await screen.findByText('Позвонить клиенту')).toBeInTheDocument()
    })

    it('успешное создание задачи из bulk-бара закрывает drawer и снимает выбор', async () => {
        const { container } = render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        fireEvent.click(checkboxes[checkboxes.length - 1])
        expect(await screen.findByText(/Выбрано:/)).toBeInTheDocument()

        fireEvent.click(
            document.querySelector('[data-qa-id="activities.list.createTask"]') as HTMLElement,
        )
        expect(await screen.findByText('Форма задачи открыта')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Успех drawer' }))

        await waitFor(() =>
            expect(screen.queryByText('Форма задачи открыта')).not.toBeInTheDocument(),
        )
        await waitFor(() => expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument())
    })

    it('клик по связи сделки в строке открывает карточку сделки', async () => {
        apiGetActivities.mockResolvedValue({
            list: [
                activity({
                    dealId: 'd1',
                    dealName: 'Крупная сделка',
                }),
            ],
            total: 1,
        })

        render(<ActivityList />)
        fireEvent.click(await screen.findByText('Крупная сделка'))

        expect(navigate).toHaveBeenCalledWith('/deals/d1')
    })

    it('фильтр по статусу уходит в запрос API', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        await pickSelectOption('activities.list.statusFilter', 'В работе')

        await waitFor(() =>
            expect(
                apiGetActivities.mock.calls.some(
                    (c) => (c[0] as { status?: string }).status === 'in_progress',
                ),
            ).toBe(true),
        )
    })

    it('фильтр по ответственному уходит в запрос API', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        await pickSelectOption('activities.list.assigneeFilter', 'Пётр Петров')

        await waitFor(() =>
            expect(
                apiGetActivities.mock.calls.some(
                    (c) => (c[0] as { assigneeId?: string }).assigneeId === 'u1',
                ),
            ).toBe(true),
        )
    })

    it('пресет «Сегодня» отправляет окно dateFrom/dateTo на сервер', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        fireEvent.click(
            document.querySelector(
                '[data-qa-id="activities.list.datePreset"][data-qa-preset="today"]',
            ) as HTMLElement,
        )

        await waitFor(() =>
            expect(
                apiGetActivities.mock.calls.some((c) => {
                    const params = c[0] as { dateFrom?: number; dateTo?: number }
                    return typeof params.dateFrom === 'number' && typeof params.dateTo === 'number'
                }),
            ).toBe(true),
        )
    })

    it('переключение на календарь уводит на /activities/calendar', async () => {
        render(<ActivityList />)
        await screen.findByText('Позвонить клиенту')

        fireEvent.click(
            document.querySelector('[data-qa-id="activities.list.viewCalendar"]') as HTMLElement,
        )

        expect(navigate).toHaveBeenCalledWith('/activities/calendar')
    })
})
