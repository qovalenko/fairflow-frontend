import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Activity } from '@/@types/crm'

const apiGetActivity = vi.fn()
const apiUpdateActivity = vi.fn()
const apiCompleteActivity = vi.fn()
const apiDeleteActivity = vi.fn()
const apiCreateActivity = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useParams: () => ({ id: 'a1' }),
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/store/projectStore', () => ({
    useProjectStore: (sel: (s: { currentProject?: { moduleConfigs?: unknown[] } }) => unknown) =>
        sel({ currentProject: { moduleConfigs: [] } }),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetActivity: (...a: unknown[]) => apiGetActivity(...a),
    apiUpdateActivity: (...a: unknown[]) => apiUpdateActivity(...a),
    apiCompleteActivity: (...a: unknown[]) => apiCompleteActivity(...a),
    apiDeleteActivity: (...a: unknown[]) => apiDeleteActivity(...a),
    apiCreateActivity: (...a: unknown[]) => apiCreateActivity(...a),
    newIdempotencyKey: () => 'idem-1',
}))

import ActivityDetails from './ActivityDetails'

const activity: Activity = {
    id: 'a1',
    type: 'task',
    title: 'Подготовить договор',
    status: 'planned',
    priority: 'medium',
    assigneeName: 'Пётр Петров',
    description: 'Согласовать условия',
    dueDate: 1_700_000_000_000 - 86400000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
}

const renderDetails = () =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <ActivityDetails />
        </SWRConfig>,
    )

describe('ActivityDetails', () => {
    beforeEach(() => {
        permissions = new Set(['activities:read', 'activities:write', 'activities:delete'])
        navigate.mockClear()
        apiGetActivity.mockResolvedValue(activity)
        apiUpdateActivity.mockResolvedValue(activity)
        apiCompleteActivity.mockResolvedValue({ ...activity, status: 'completed' })
        apiDeleteActivity.mockResolvedValue({ ok: true })
        apiCreateActivity.mockResolvedValue({ id: 'a2' })
        vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('показывает карточку активности после загрузки', async () => {
        renderDetails()

        expect(await screen.findByText('Подготовить договор')).toBeInTheDocument()
        expect(screen.getByText('Согласовать условия')).toBeInTheDocument()
        expect(screen.getAllByText('Пётр Петров').length).toBeGreaterThan(0)
    })

    it('ошибка загрузки — экран ST-6', async () => {
        apiGetActivity.mockRejectedValue(new Error('fail'))

        renderDetails()

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
    })

    it('активность не найдена — кнопка возврата к списку', async () => {
        apiGetActivity.mockResolvedValue(null)

        renderDetails()

        expect(await screen.findByText('Активность не найдена')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к списку' }))
        expect(navigate).toHaveBeenCalledWith('/activities')
    })

    it('«Завершить» вызывает apiCompleteActivity', async () => {
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() =>
            expect(apiCompleteActivity).toHaveBeenCalledWith('a1', {}, 'p1', 'idem-1'),
        )
    })

    it('удаление после confirm уводит в список', async () => {
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByLabelText('Удалить'))

        await waitFor(() => expect(apiDeleteActivity).toHaveBeenCalledWith('a1', 'p1', 'idem-1'))
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/activities'))
    })

    it('loading — спиннер до ответа API', () => {
        apiGetActivity.mockReturnValue(new Promise(() => {}))
        renderDetails()

        expect(document.querySelector('[data-qa-id="activities.details.loading"]')).toBeTruthy()
    })

    it('показывает блок результата завершения', async () => {
        apiGetActivity.mockResolvedValue({
            ...activity,
            status: 'completed',
            result: 'Договор подписан',
        })

        renderDetails()

        expect(await screen.findByText('Результат')).toBeInTheDocument()
        expect(screen.getByText('Договор подписан')).toBeInTheDocument()
    })

    it('завершение с follow-up создаёт новую активность', async () => {
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByRole('button', { name: 'Завершить и следующую' }))
        await screen.findByText('Завершить и запланировать следующую')

        const titleInput = await screen.findByDisplayValue('Follow-up: Подготовить договор')
        fireEvent.change(titleInput, { target: { value: 'Следующий шаг' } })
        fireEvent.click(screen.getByRole('button', { name: 'Завершить и создать' }))

        await waitFor(() => expect(apiCompleteActivity).toHaveBeenCalled())
        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(apiCreateActivity.mock.calls[0][0]).toMatchObject({
            projectId: 'p1',
            title: 'Следующий шаг',
            status: 'planned',
        })
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/activities/a2'))
    })

    it('ошибка завершения оставляет карточку на экране', async () => {
        apiCompleteActivity.mockRejectedValue(new Error('fail'))
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByRole('button', { name: 'Завершить' }))

        await waitFor(() => expect(apiCompleteActivity).toHaveBeenCalled())
        expect(screen.getByText('Подготовить договор')).toBeInTheDocument()
    })

    it('ошибка удаления не уводит в список', async () => {
        apiDeleteActivity.mockRejectedValue(new Error('fail'))
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByLabelText('Удалить'))

        await waitFor(() => expect(apiDeleteActivity).toHaveBeenCalled())
        expect(navigate).not.toHaveBeenCalledWith('/activities')
    })

    it('показывает дату обновления, если updatedAt отличается от createdAt', async () => {
        apiGetActivity.mockResolvedValue({
            ...activity,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_100_000_000,
        })

        renderDetails()

        expect(await screen.findByText(/Обновлено:/)).toBeInTheDocument()
    })

    it('ошибка смены статуса оставляет карточку на экране', async () => {
        apiUpdateActivity.mockRejectedValue(new Error('fail'))
        renderDetails()
        await screen.findByText('Подготовить договор')

        const statusContainer = document.querySelector(
            '[data-qa-id="activities.details.status"]',
        ) as HTMLElement
        const input = statusContainer.querySelector('input.select__input') as HTMLInputElement
        fireEvent.focus(input)
        fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' })
        const option = await waitFor(() => {
            const found = Array.from(document.querySelectorAll('[role="option"]')).find(
                (el) => el.textContent === 'В работе',
            )
            if (!found) throw new Error('option not found')
            return found
        })
        fireEvent.click(option)

        await waitFor(() => expect(apiUpdateActivity).toHaveBeenCalled())
        expect(screen.getByText('Подготовить договор')).toBeInTheDocument()
    })

    it('ошибка follow-up оставляет карточку на экране', async () => {
        apiCreateActivity.mockRejectedValue(new Error('fail'))
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByRole('button', { name: 'Завершить и следующую' }))
        await screen.findByText('Завершить и запланировать следующую')
        fireEvent.click(screen.getByRole('button', { name: 'Завершить и создать' }))

        await waitFor(() => expect(apiCompleteActivity).toHaveBeenCalled())
        expect(screen.getByText('Подготовить договор')).toBeInTheDocument()
    })

    it('follow-up типа «Заметка» создаёт активность без reminderOffset', async () => {
        renderDetails()
        await screen.findByText('Подготовить договор')

        fireEvent.click(screen.getByRole('button', { name: 'Завершить и следующую' }))
        await screen.findByText('Завершить и запланировать следующую')

        const typeInput = document.querySelector(
            '[data-qa-id="activities.followUp.type"] input.select__input',
        ) as HTMLInputElement
        fireEvent.focus(typeInput)
        fireEvent.keyDown(typeInput, { key: 'ArrowDown', code: 'ArrowDown' })
        fireEvent.click(
            await waitFor(() => {
                const found = Array.from(document.querySelectorAll('[role="option"]')).find(
                    (el) => el.textContent === 'Заметка',
                )
                if (!found) throw new Error('option not found')
                return found
            }),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Завершить и создать' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        const payload = apiCreateActivity.mock.calls[0][0] as Record<string, unknown>
        expect(payload.type).toBe('note')
        expect(payload).not.toHaveProperty('reminderOffset')
    })
})
