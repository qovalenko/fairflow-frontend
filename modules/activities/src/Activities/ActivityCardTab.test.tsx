import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ComponentProps } from 'react'
import type { Activity } from '@/@types/crm'

const apiGetActivities = vi.fn()
const apiCompleteActivity = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
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
                <div>Drawer создания задачи</div>
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
    apiCompleteActivity: (...a: unknown[]) => apiCompleteActivity(...a),
    newIdempotencyKey: () => 'complete-key-1',
}))

import ActivityCardTab from './ActivityCardTab'

const activity = (over: Partial<Activity> = {}): Activity => ({
    id: 'a1',
    type: 'task',
    title: 'Связанная задача',
    status: 'planned',
    priority: 'medium',
    dueDate: 1_700_000_000_000,
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const renderTab = (props: ComponentProps<typeof ActivityCardTab>) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <ActivityCardTab {...props} />
        </SWRConfig>,
    )

describe('ActivityCardTab', () => {
    beforeEach(() => {
        permissions = new Set(['activities:read', 'activities:write'])
        apiGetActivities.mockResolvedValue({ list: [activity()], total: 1 })
        apiCompleteActivity.mockResolvedValue({ ...activity(), status: 'completed' })
    })

    it('запрашивает активности серверным фильтром по контакту', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityCardTab contactId="c1" />
            </SWRConfig>,
        )

        await waitFor(() => expect(apiGetActivities).toHaveBeenCalled())
        expect(apiGetActivities.mock.calls[0][0]).toMatchObject({
            projectId: 'p1',
            linkEntityType: 'contact',
            linkEntityId: 'c1',
        })
    })

    it('показывает активность из ответа сервера', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityCardTab dealId="d1" />
            </SWRConfig>,
        )

        expect(await screen.findByText('Связанная задача')).toBeInTheDocument()
    })

    it('без activities:read — ST-10', async () => {
        permissions = new Set(['activities:write'])
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityCardTab contactId="c1" />
            </SWRConfig>,
        )

        expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument()
    })

    it('inline-complete вызывает apiCompleteActivity', async () => {
        renderTab({ contactId: 'c1' })

        const completeBtn = await screen.findByRole('button', { name: 'Завершить' })
        fireEvent.click(completeBtn)

        await waitFor(() =>
            expect(apiCompleteActivity).toHaveBeenCalledWith('a1', {}, 'p1', 'complete-key-1'),
        )
    })

    it('loading — скелетон до ответа API', () => {
        apiGetActivities.mockReturnValue(new Promise(() => {}))
        const { unmount } = renderTab({ contactId: 'c1' })

        expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
        unmount()
    })

    it('ошибка загрузки — ST-6 с «Повторить»', async () => {
        apiGetActivities.mockRejectedValue(new Error('boom'))
        renderTab({ contactId: 'c1' })

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetActivities.mock.calls.length).toBeGreaterThan(1))
    })

    it('пустой список — ST-3 и кнопка создания открывает drawer', async () => {
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })
        renderTab({ contactId: 'c1' })

        expect(await screen.findByText('Пока нет активностей')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Создать активность' }))
        expect(await screen.findByText('Drawer создания задачи')).toBeInTheDocument()
    })

    it('успешное создание из drawer закрывает форму и перезапрашивает список', async () => {
        renderTab({ companyId: 'co1' })

        fireEvent.click(await screen.findByRole('button', { name: 'Активность' }))
        expect(await screen.findByText('Drawer создания задачи')).toBeInTheDocument()

        const callsBefore = apiGetActivities.mock.calls.length
        fireEvent.click(screen.getByRole('button', { name: 'Успех drawer' }))

        await waitFor(() =>
            expect(screen.queryByText('Drawer создания задачи')).not.toBeInTheDocument(),
        )
        await waitFor(() => expect(apiGetActivities.mock.calls.length).toBeGreaterThan(callsBefore))
    })

    it('показывает «Следующий шаг» для ближайшей открытой активности', async () => {
        apiGetActivities.mockResolvedValue({
            list: [
                activity({ id: 'later', title: 'Поздняя', dueDate: 1_800_000_000_000 }),
                activity({ id: 'sooner', title: 'Ранняя', dueDate: 1_700_000_000_000 }),
            ],
            total: 2,
        })
        renderTab({ dealId: 'd1' })

        expect(await screen.findByText('Следующий шаг')).toBeInTheDocument()
        expect(screen.getByText('Ранняя')).toBeInTheDocument()
        expect(screen.getByText('Поздняя')).toBeInTheDocument()
    })

    it('завершённая активность показывает метку «Завершено» без кнопки', async () => {
        apiGetActivities.mockResolvedValue({
            list: [activity({ status: 'completed', title: 'Готово' })],
            total: 1,
        })
        renderTab({ orderId: 'o1' })

        expect(await screen.findByText('Готово')).toBeInTheDocument()
        expect(screen.getByText('Завершено')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
    })

    it('ошибка inline-complete оставляет активность на экране', async () => {
        apiCompleteActivity.mockRejectedValue(new Error('fail'))
        renderTab({ contactId: 'c1' })

        fireEvent.click(await screen.findByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(apiCompleteActivity).toHaveBeenCalled())
        expect(screen.getByText('Связанная задача')).toBeInTheDocument()
    })

    it('клик по названию открывает карточку активности', async () => {
        renderTab({ contactId: 'c1' })

        fireEvent.click(await screen.findByText('Связанная задача'))
        expect(navigate).toHaveBeenCalledWith('/activities/a1')
    })

    it('без контекста сущности показывает подсказку', () => {
        renderTab({})

        expect(screen.getByText('Нет контекста сущности.')).toBeInTheDocument()
    })
})
