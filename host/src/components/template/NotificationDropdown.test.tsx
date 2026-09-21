import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { NotificationItem } from '@/services/NotificationService'

const markRead = vi.fn()
const markAllRead = vi.fn()
const refresh = vi.fn()

let notificationsState = {
    canRead: true,
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
vi.mock('@/utils/hooks/useResponsive', () => ({
    default: () => ({ larger: { md: true } }),
}))
vi.mock('@/utils/hoc/withHeaderItem', () => ({
    default: (Component: React.ComponentType) => Component,
}))

import NotificationDropdown from './NotificationDropdown'

const openDropdown = () => {
    const toggle = document.querySelector('.dropdown-toggle')
    expect(toggle).toBeTruthy()
    fireEvent.click(toggle!)
}

describe('NotificationDropdown (SCR-NOTIFY-BELL)', () => {
    beforeEach(() => {
        markRead.mockReset().mockResolvedValue(undefined)
        markAllRead.mockReset().mockResolvedValue(undefined)
        refresh.mockReset()
        notificationsState = {
            canRead: true,
            list: [],
            unreadCount: 0,
            isLoading: false,
            error: null,
            moduleDisabled: false,
            offline: false,
        }
    })

    it('renders nothing without notifications:read permission', () => {
        notificationsState.canRead = false
        const { container } = render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('shows empty state in dropdown body', async () => {
        render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        openDropdown()
        expect(screen.getByText('Нет уведомлений')).toBeInTheDocument()
    })

    it('shows loading skeleton while list is fetching', async () => {
        notificationsState.isLoading = true
        render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        openDropdown()
        expect(document.querySelector('.animate-pulse')).toBeTruthy()
    })

    it('shows error state with retry action', async () => {
        notificationsState.error = new Error('boom')
        render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        openDropdown()
        expect(screen.getByText('Не удалось загрузить уведомления')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(refresh).toHaveBeenCalled()
    })

    it('shows module-disabled stub', async () => {
        notificationsState.moduleDisabled = true
        render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        openDropdown()
        expect(
            screen.getByText('Модуль уведомлений выключен в проекте'),
        ).toBeInTheDocument()
    })

    it('renders unread badge and notification rows', async () => {
        notificationsState.unreadCount = 2
        notificationsState.list = [
            {
                id: 'n-1',
                target: 'Сделка',
                description: 'изменена',
                date: new Date().toISOString(),
                readed: false,
                category: 'deals',
            },
        ]
        render(
            <MemoryRouter>
                <NotificationDropdown />
            </MemoryRouter>,
        )
        expect(screen.getByText('2')).toBeInTheDocument()
        openDropdown()
        expect(screen.getByText(/Сделка/)).toBeInTheDocument()
    })
})
