import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

const apiGetActivitiesCalendar = vi.fn()
const apiGetActivity = vi.fn()
const navigate = vi.fn()

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
        'calendar',
        (v: string) => onChange(v),
    ],
}))
vi.mock('@/services/CrmService', () => ({
    apiGetActivitiesCalendar: (...a: unknown[]) => apiGetActivitiesCalendar(...a),
    apiGetActivity: (...a: unknown[]) => apiGetActivity(...a),
}))

const calendarPropsRef = vi.hoisted(() => ({
    current: null as null | { dateClick?: (arg: { date: Date; view: { type: string } }) => void },
}))
let useCalendarStub = false

vi.mock('@/components/shared/CalendarView', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/components/shared/CalendarView')>()
    return {
        default: (props: Record<string, unknown>) => {
            if (useCalendarStub) {
                calendarPropsRef.current = props as typeof calendarPropsRef.current
                return <div data-qa-id="calendar-stub" />
            }
            return actual.default(props as never)
        },
    }
})

let permissions = new Set<string>()

import ActivityCalendar from './ActivityCalendar'

const calendarEvent = {
    id: 'e1',
    title: 'Встреча',
    start: '2026-08-20T10:00:00.000Z',
    end: '2026-08-20T11:00:00.000Z',
    extendedProps: { type: 'meeting', overdue: false },
}

const renderCalendar = (route = '/activities/calendar') =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[route]}>
                <ActivityCalendar />
            </MemoryRouter>
        </SWRConfig>,
    )

async function openFilterDropdown() {
    await userEvent.click(screen.getByRole('button', { name: 'Фильтр' }))
}

describe('ActivityCalendar', () => {
    beforeEach(() => {
        useCalendarStub = false
        calendarPropsRef.current = null
        permissions = new Set(['activities:read', 'activities:write'])
        navigate.mockClear()
        apiGetActivitiesCalendar.mockResolvedValue([])
        apiGetActivity.mockReset()
    })

    it('без activities:read — ST-10', async () => {
        permissions = new Set(['activities:write'])
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument()
    })

    it('при старте запрашивает месяц и при пустом ответе показывает ST-3', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
        expect(apiGetActivitiesCalendar).toHaveBeenCalled()
        const params = apiGetActivitiesCalendar.mock.calls[0][0] as {
            dateFrom?: number
            dateTo?: number
        }
        expect(typeof params.dateFrom).toBe('number')
        expect(typeof params.dateTo).toBe('number')
        expect((params.dateTo as number) > (params.dateFrom as number)).toBe(true)
    })

    it('легенда типов активностей видна пользователю', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        expect(await screen.findByText('Легенда:')).toBeInTheDocument()
        expect(screen.getByText('Задачи')).toBeInTheDocument()
        expect(screen.getByText('Звонки')).toBeInTheDocument()
        expect(screen.getByText('Встречи')).toBeInTheDocument()
        expect(screen.getByText('Просрочено')).toBeInTheDocument()
    })

    it('переключение Месяц → Неделя → День не размонтирует FullCalendar', async () => {
        apiGetActivitiesCalendar.mockResolvedValue([
            {
                id: 'e1',
                title: 'Встреча',
                start: '2026-08-20T10:00:00.000Z',
                end: '2026-08-20T11:00:00.000Z',
                extendedProps: { type: 'meeting', overdue: false },
            },
        ])

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        await waitFor(() => {
            expect(document.querySelector('.fc-dayGridMonth-view')).toBeTruthy()
        })

        fireEvent.click(await screen.findByRole('button', { name: /неделя/i }))
        await waitFor(() => {
            expect(document.querySelector('.fc-timeGridWeek-view')).toBeTruthy()
        })

        fireEvent.click(screen.getByRole('button', { name: /день/i }))
        await waitFor(() => {
            expect(document.querySelector('.fc-timeGridDay-view')).toBeTruthy()
        })

        fireEvent.click(screen.getByRole('button', { name: /месяц/i }))
        await waitFor(() => {
            expect(document.querySelector('.fc-dayGridMonth-view')).toBeTruthy()
        })
    })

    it('ошибка загрузки — ST-6 с «Повторить»', async () => {
        apiGetActivitiesCalendar.mockRejectedValue(new Error('boom'))
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('клик по событию открывает preview с данными активности', async () => {
        apiGetActivitiesCalendar.mockResolvedValue([
            {
                id: 'e1',
                title: 'Встреча',
                start: '2026-08-20T10:00:00.000Z',
                end: '2026-08-20T11:00:00.000Z',
                extendedProps: { type: 'meeting', overdue: false },
            },
        ])
        apiGetActivity.mockResolvedValue({
            id: 'e1',
            type: 'meeting',
            title: 'Встреча с клиентом',
            status: 'planned',
            priority: 'medium',
            assigneeName: 'Анна',
            startDate: 1_756_300_800_000,
            endDate: 1_756_304_400_000,
            createdAt: 0,
            updatedAt: 0,
        })

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        await waitFor(() => {
            expect(document.querySelector('[data-qa-activity="e1"]')).toBeTruthy()
        })

        fireEvent.click(document.querySelector('[data-qa-activity="e1"]') as HTMLElement)

        expect(await screen.findByRole('dialog', { name: 'Предпросмотр активности' })).toBeInTheDocument()
        expect(screen.getByText('Встреча с клиентом')).toBeInTheDocument()
        expect(apiGetActivity).toHaveBeenCalledWith('e1', 'p1')
    })

    it('«Открыть» в preview переходит на страницу активности', async () => {
        apiGetActivitiesCalendar.mockResolvedValue([
            {
                id: 'e1',
                title: 'Встреча',
                start: '2026-08-20T10:00:00.000Z',
                end: '2026-08-20T11:00:00.000Z',
                extendedProps: { type: 'meeting', overdue: false },
            },
        ])
        apiGetActivity.mockResolvedValue({
            id: 'e1',
            type: 'meeting',
            title: 'Встреча с клиентом',
            status: 'planned',
            priority: 'medium',
            createdAt: 0,
            updatedAt: 0,
        })

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/activities/calendar']}>
                    <ActivityCalendar />
                </MemoryRouter>
            </SWRConfig>,
        )

        await waitFor(() => {
            expect(document.querySelector('[data-qa-activity="e1"]')).toBeTruthy()
        })
        fireEvent.click(document.querySelector('[data-qa-activity="e1"]') as HTMLElement)
        await screen.findByRole('dialog', { name: 'Предпросмотр активности' })

        fireEvent.click(screen.getByRole('button', { name: 'Открыть' }))
        expect(navigate).toHaveBeenCalledWith('/activities/e1')
    })

    it('фильтр по типу задачи уходит в API и показывает подпись в легенде', async () => {
        renderCalendar()
        await screen.findByText('Пока нет активностей')

        await openFilterDropdown()
        fireEvent.click(document.querySelector('[data-qa-type="task"]') as HTMLElement)

        await waitFor(() =>
            expect(apiGetActivitiesCalendar).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'task' }),
            ),
        )
        expect(await screen.findByText(/Фильтр:.*Задача/)).toBeInTheDocument()
    })

    it('«Только мои» добавляет mine=self в запрос календаря', async () => {
        renderCalendar()
        await screen.findByText('Пока нет активностей')

        await openFilterDropdown()
        fireEvent.click(
            document.querySelector('[data-qa-id="activities.calendar.mineOnly"]') as HTMLElement,
        )

        await waitFor(() =>
            expect(apiGetActivitiesCalendar).toHaveBeenCalledWith(
                expect.objectContaining({ mine: 'self' }),
            ),
        )
        expect(await screen.findByText(/только мои/)).toBeInTheDocument()
    })

    it('пустой ответ с фильтрами — ST-3 «Ничего не найдено» и сброс', async () => {
        renderCalendar()
        await screen.findByText('Пока нет активностей')

        await openFilterDropdown()
        fireEvent.click(document.querySelector('[data-qa-type="call"]') as HTMLElement)

        expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
        fireEvent.click(
            document.querySelector('[data-qa-id="activities.state.filterReset"]') as HTMLElement,
        )
        await waitFor(() => expect(screen.queryByText('Ничего не найдено')).not.toBeInTheDocument())
    })

    it('dateClick в month view открывает форму с датой без времени', async () => {
        useCalendarStub = true
        apiGetActivitiesCalendar.mockResolvedValue([calendarEvent])
        renderCalendar()

        await waitFor(() => expect(calendarPropsRef.current?.dateClick).toBeTypeOf('function'))

        calendarPropsRef.current?.dateClick?.({
            date: new Date('2026-08-25T12:00:00'),
            view: { type: 'dayGridMonth' },
        })

        expect(navigate).toHaveBeenCalledWith('/activities/new?dueDate=2026-08-25')
    })

    it('dateClick в week view открывает форму с датой и временем', async () => {
        useCalendarStub = true
        apiGetActivitiesCalendar.mockResolvedValue([calendarEvent])
        renderCalendar()

        await waitFor(() => expect(calendarPropsRef.current?.dateClick).toBeTypeOf('function'))

        calendarPropsRef.current?.dateClick?.({
            date: new Date('2026-08-25T14:30:00'),
            view: { type: 'timeGridWeek' },
        })

        expect(navigate).toHaveBeenCalledWith(
            '/activities/new?dueDate=2026-08-25T14%3A30',
        )
    })

    it('без activities:write dateClick не открывает форму создания', async () => {
        useCalendarStub = true
        permissions = new Set(['activities:read'])
        apiGetActivitiesCalendar.mockResolvedValue([calendarEvent])
        renderCalendar()

        await waitFor(() => expect(calendarPropsRef.current?.dateClick).toBeTypeOf('function'))
        calendarPropsRef.current?.dateClick?.({
            date: new Date('2026-08-25T12:00:00'),
            view: { type: 'dayGridMonth' },
        })

        expect(navigate).not.toHaveBeenCalled()
    })

    it('клик по связи в preview переходит к сущности', async () => {
        apiGetActivitiesCalendar.mockResolvedValue([calendarEvent])
        apiGetActivity.mockResolvedValue({
            id: 'e1',
            type: 'meeting',
            title: 'Встреча с клиентом',
            status: 'planned',
            priority: 'medium',
            dealId: 'd1',
            dealName: 'Сделка Alpha',
            createdAt: 0,
            updatedAt: 0,
        })

        renderCalendar()

        await waitFor(() => {
            expect(document.querySelector('[data-qa-activity="e1"]')).toBeTruthy()
        })
        fireEvent.click(document.querySelector('[data-qa-activity="e1"]') as HTMLElement)
        await screen.findByRole('dialog', { name: 'Предпросмотр активности' })

        fireEvent.click(screen.getByRole('button', { name: 'Сделка Alpha' }))
        expect(navigate).toHaveBeenCalledWith('/deals/d1')
    })

    it('ошибка загрузки карточки по клику на событие уводит на страницу активности', async () => {
        apiGetActivitiesCalendar.mockResolvedValue([calendarEvent])
        apiGetActivity.mockRejectedValue(new Error('not found'))

        renderCalendar()

        await waitFor(() => {
            expect(document.querySelector('[data-qa-activity="e1"]')).toBeTruthy()
        })
        fireEvent.click(document.querySelector('[data-qa-activity="e1"]') as HTMLElement)

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/activities/e1'))
    })

    it('переключение на список уводит на /activities', async () => {
        renderCalendar()
        await screen.findByText('Пока нет активностей')

        fireEvent.click(
            document.querySelector('[data-qa-id="activities.calendar.viewList"]') as HTMLElement,
        )

        expect(navigate).toHaveBeenCalledWith('/activities')
    })

    it('сброс фильтров из выпадающего меню снимает активный фильтр', async () => {
        renderCalendar()
        await screen.findByText('Пока нет активностей')

        await openFilterDropdown()
        fireEvent.click(document.querySelector('[data-qa-type="task"]') as HTMLElement)
        expect(await screen.findByText(/Фильтр:.*Задача/)).toBeInTheDocument()

        await openFilterDropdown()
        fireEvent.click(
            document.querySelector('[data-qa-id="activities.calendar.filterReset"]') as HTMLElement,
        )

        await waitFor(() => expect(screen.queryByText(/Фильтр:/)).not.toBeInTheDocument())
    })

    it('пустой календарь без activities:write не показывает кнопку создания', async () => {
        permissions = new Set(['activities:read'])
        renderCalendar()

        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Создать активность' })).not.toBeInTheDocument()
    })
})
