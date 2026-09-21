import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import { useProjectStore } from '@/store/projectStore'

const apiGetNotificationCatalog = vi.fn()
const apiGetNotificationPreferences = vi.fn()
const apiUpdateNotificationPreferences = vi.fn()
const toastPush = vi.fn()

let canRead = true
let projectId: string | null = 'p-1'

vi.mock('@/services/NotificationService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/NotificationService')>()),
    apiGetNotificationCatalog: (...a: unknown[]) => apiGetNotificationCatalog(...a),
    apiGetNotificationPreferences: (...a: unknown[]) => apiGetNotificationPreferences(...a),
    apiUpdateNotificationPreferences: (...a: unknown[]) =>
        apiUpdateNotificationPreferences(...a),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject?: string, action?: string) =>
        typeof subject === 'string' && typeof action === 'string' ? canRead : () => canRead,
}))
vi.mock('@/utils/hooks/useResolvedProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import NotificationSettings from './NotificationSettings'

function renderSettings() {
    return render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter>
                <NotificationSettings />
            </MemoryRouter>
        </SWRConfig>,
    )
}

const enabledProject = {
    id: 'p-1',
    name: 'Demo',
    enabledModules: ['notifications'],
}

describe('NotificationSettings (SCR-NOTIFY-SETTINGS)', () => {
    beforeEach(() => {
        canRead = true
        projectId = 'p-1'
        apiGetNotificationCatalog.mockReset()
        apiGetNotificationPreferences.mockReset()
        apiUpdateNotificationPreferences.mockReset()
        toastPush.mockReset()
        useProjectStore.setState({
            currentProject: enabledProject,
            currentProjectId: 'p-1',
        })
        apiGetNotificationCatalog.mockResolvedValue({
            categories: [
                {
                    category: 'deals',
                    module: 'deals',
                    title: 'Сделки',
                    severity: 'info',
                    default_channels: ['in_app'],
                    mandatory: false,
                },
                {
                    category: 'sales',
                    module: 'orders',
                    title: 'Продажи',
                    severity: 'critical',
                    default_channels: ['in_app', 'email'],
                    mandatory: true,
                },
            ],
        })
        apiGetNotificationPreferences.mockResolvedValue({
            email_mode: 'off',
            digest_time: null,
            timezone: null,
            categories: {},
            quiet_hours: null,
        })
    })

    afterEach(cleanup)

    it('shows module-disabled stub when notifications module is off', async () => {
        useProjectStore.setState({
            currentProject: { ...enabledProject, enabledModules: [] },
            currentProjectId: 'p-1',
        })
        renderSettings()
        expect(
            await screen.findByText('Модуль уведомлений выключен в проекте'),
        ).toBeInTheDocument()
    })

    it('shows no-permission stub when user lacks notifications:read', async () => {
        canRead = false
        renderSettings()
        expect(
            await screen.findByText('У вас нет доступа к настройкам уведомлений'),
        ).toBeInTheDocument()
    })

    it('shows loading skeleton while catalog and preferences load', () => {
        apiGetNotificationCatalog.mockReturnValue(new Promise(() => undefined))
        apiGetNotificationPreferences.mockReturnValue(new Promise(() => undefined))
        renderSettings()
        expect(screen.getByRole('heading', { name: 'Уведомления' })).toBeInTheDocument()
        expect(document.querySelector('.animate-pulse')).toBeTruthy()
    })

    it('shows error state with retry when catalog load fails', async () => {
        apiGetNotificationCatalog.mockRejectedValue(new Error('network'))
        renderSettings()
        expect(await screen.findByText('Не удалось загрузить настройки')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetNotificationCatalog).toHaveBeenCalledTimes(2))
    })

    it('renders category table with mandatory row locked', async () => {
        renderSettings()
        expect(await screen.findByText('Сделки')).toBeInTheDocument()
        expect(screen.getByText('Продажи')).toBeInTheDocument()
        expect(screen.getByText('всегда включено')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сохранить' }).className).toMatch(
            /cursor-not-allowed/,
        )
    })

    it('saves updated preferences and shows success toast', async () => {
        apiUpdateNotificationPreferences.mockResolvedValue({
            email_mode: 'immediate',
            digest_time: null,
            timezone: null,
            categories: { deals: { in_app: true, email: false } },
            quiet_hours: null,
        })
        renderSettings()
        await screen.findByText('Сделки')

        await userEvent.click(screen.getByRole('button', { name: 'Сразу' }))
        expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(apiUpdateNotificationPreferences).toHaveBeenCalled())
        expect(toastPush).toHaveBeenCalled()
    })
})
