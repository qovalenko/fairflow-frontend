import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiGetNotificationList = vi.fn()
const apiMarkAllNotificationsRead = vi.fn()

let projectId: string | null = 'p-1'

vi.mock('@/utils/hooks/useResolvedProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/services/NotificationService', () => ({
    apiGetNotificationList: (...a: unknown[]) => apiGetNotificationList(...a),
    apiMarkAllNotificationsRead: (...a: unknown[]) =>
        apiMarkAllNotificationsRead(...a),
}))

import NotificationsPage from './NotificationsPage'

describe('NotificationsPage', () => {
    beforeEach(() => {
        projectId = 'p-1'
        apiGetNotificationList.mockReset()
        apiMarkAllNotificationsRead.mockReset()
    })

    it('shows loading spinner while fetching notifications', () => {
        apiGetNotificationList.mockReturnValue(new Promise(() => undefined))
        render(
            <MemoryRouter>
                <NotificationsPage />
            </MemoryRouter>,
        )
        expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeInTheDocument()
        expect(screen.queryByText('Нет уведомлений')).not.toBeInTheDocument()
    })

    it('renders empty state when list is empty', async () => {
        apiGetNotificationList.mockResolvedValue({ list: [], total: 0 })
        render(
            <MemoryRouter>
                <NotificationsPage />
            </MemoryRouter>,
        )
        expect(await screen.findByText('Нет уведомлений')).toBeInTheDocument()
    })

    it('renders notification rows from API response', async () => {
        apiGetNotificationList.mockResolvedValue({
            list: [
                {
                    id: 'n-1',
                    target: 'Сделка',
                    description: 'обновлена',
                    date: '2026-01-10T12:00:00.000Z',
                    readed: false,
                },
            ],
            total: 1,
        })
        render(
            <MemoryRouter>
                <NotificationsPage />
            </MemoryRouter>,
        )
        expect(await screen.findByText(/Сделка/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Прочитать все' })).toBeInTheDocument()
    })

    it('shows error message when load fails', async () => {
        apiGetNotificationList.mockRejectedValue(new Error('network down'))
        render(
            <MemoryRouter>
                <NotificationsPage />
            </MemoryRouter>,
        )
        expect(await screen.findByText('network down')).toBeInTheDocument()
    })

    it('marks all notifications read and reloads list', async () => {
        apiGetNotificationList
            .mockResolvedValueOnce({
                list: [{ id: 'n-1', target: 'A', description: 'b', date: '', readed: false }],
                total: 1,
            })
            .mockResolvedValueOnce({ list: [], total: 0 })
        apiMarkAllNotificationsRead.mockResolvedValue({})
        render(
            <MemoryRouter>
                <NotificationsPage />
            </MemoryRouter>,
        )
        await screen.findByText(/A/)
        await userEvent.click(screen.getByRole('button', { name: 'Прочитать все' }))
        await waitFor(() => expect(apiMarkAllNotificationsRead).toHaveBeenCalledWith({ projectId: 'p-1' }))
        await waitFor(() => expect(apiGetNotificationList).toHaveBeenCalledTimes(2))
    })
})
