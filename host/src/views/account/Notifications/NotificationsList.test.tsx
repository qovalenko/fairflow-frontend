import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { NotificationItem } from '@/services/NotificationService'

const markRead = vi.fn()
const markAllRead = vi.fn()
const refresh = vi.fn()
const navigate = vi.fn()

let notificationsState = {
    canRead: true,
    moduleEnabled: true,
    list: [] as NotificationItem[],
    unreadCount: 0,
    isLoading: false,
    error: null as unknown,
    moduleDisabled: false,
    offline: false,
}

vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({
        ...notificationsState,
        refresh,
        markRead,
        markAllRead,
    }),
}))
vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { projects: { id: string; name: string }[] } }) => unknown) =>
        selector({ user: { projects: [{ id: 'p-1', name: 'Demo' }] } }),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import NotificationsList from './NotificationsList'

describe('NotificationsList (SCR-NOTIFY-LIST)', () => {
    beforeEach(() => {
        markRead.mockReset().mockResolvedValue(undefined)
        markAllRead.mockReset().mockResolvedValue(undefined)
        refresh.mockReset()
        navigate.mockReset()
        notificationsState = {
            canRead: true,
            moduleEnabled: true,
            list: [],
            unreadCount: 0,
            isLoading: false,
            error: null,
            moduleDisabled: false,
            offline: false,
        }
    })

    it('shows loading skeleton while notifications are fetching', () => {
        notificationsState.isLoading = true
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByRole('heading', { name: 'Все уведомления' })).toBeInTheDocument()
        expect(document.querySelector('.animate-pulse')).toBeTruthy()
    })

    it('shows empty state when there are no notifications', () => {
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText('Нет уведомлений')).toBeInTheDocument()
    })

    it('shows unread-filter empty state with reset action', async () => {
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('tab', { name: 'Непрочитанные' }))
        expect(screen.getByText('Всё прочитано')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Показать все' }))
        expect(screen.getByRole('tab', { name: 'Все' })).toHaveAttribute('aria-selected', 'true')
    })

    it('shows error state with retry action', async () => {
        notificationsState.error = new Error('network')
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText('Не удалось загрузить уведомления')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(refresh).toHaveBeenCalled()
    })

    it('shows module-disabled stub', () => {
        notificationsState.moduleEnabled = false
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText('Модуль уведомлений выключен в проекте')).toBeInTheDocument()
    })

    it('shows no-permission stub when user lacks notifications:read', () => {
        notificationsState.canRead = false
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText('У вас нет доступа к уведомлениям')).toBeInTheDocument()
    })

    it('renders grouped notification rows and mark-all action', async () => {
        notificationsState.unreadCount = 1
        notificationsState.list = [
            {
                id: 'n-1',
                target: 'Сделка',
                description: 'обновлена',
                date: new Date().toISOString(),
                readed: false,
                location: '/deals/1',
            },
        ]
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText('Сегодня')).toBeInTheDocument()
        expect(screen.getByText(/Сделка/)).toBeInTheDocument()
        const markAllBtn = screen.getByRole('button', { name: 'Отметить все как прочитанные' })
        expect(markAllBtn).toBeEnabled()
        await userEvent.click(markAllBtn)
        expect(markAllRead).toHaveBeenCalled()
    })

    it('shows offline banner with manual refresh', async () => {
        notificationsState.offline = true
        render(
            <MemoryRouter>
                <NotificationsList />
            </MemoryRouter>,
        )
        expect(screen.getByText(/Соединение потеряно/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /Обновить/ }))
        expect(refresh).toHaveBeenCalled()
    })
})
