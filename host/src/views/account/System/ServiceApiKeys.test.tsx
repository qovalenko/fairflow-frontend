import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import * as SystemAuthService from '@/services/SystemAuthService'

const useWorkspaceRoleMock = vi.fn(() => ({
    isSystemOwnerOrAdmin: true,
}))
const toastPush = vi.fn()

vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => useWorkspaceRoleMock(),
}))
vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import ServiceApiKeys from './ServiceApiKeys'

const sampleKey: SystemAuthService.ServiceApiKeyRow = {
    id: 'key-1',
    name: 'Gateway → Auth',
    keyPrefix: 'ff_sk_abc',
    scopes: ['auth:read'],
    expiresAt: '2027-06-01T00:00:00.000Z',
    lastUsedAt: '2026-01-10T12:00:00.000Z',
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
}

describe('ServiceApiKeys (SCR-AUTH-SERVICE-KEYS)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
        useWorkspaceRoleMock.mockReturnValue({ isSystemOwnerOrAdmin: true })
    })

    it('shows no-permission message for non-admin users', () => {
        useWorkspaceRoleMock.mockReturnValue({ isSystemOwnerOrAdmin: false })

        render(
            <MemoryRouter>
                <ServiceApiKeys />
            </MemoryRouter>,
        )

        expect(screen.getByText('Недостаточно прав.')).toBeInTheDocument()
    })

    it('shows loading spinner while service keys load', () => {
        vi.spyOn(SystemAuthService, 'apiListServiceApiKeys').mockImplementation(
            () => new Promise(() => {}),
        )

        render(
            <MemoryRouter>
                <ServiceApiKeys />
            </MemoryRouter>,
        )

        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows empty state when no service keys exist', async () => {
        vi.spyOn(SystemAuthService, 'apiListServiceApiKeys').mockResolvedValue([])

        render(
            <MemoryRouter>
                <ServiceApiKeys />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Ключи не найдены.')).toBeInTheDocument()
    })

    it('shows service key row with status badge', async () => {
        vi.spyOn(SystemAuthService, 'apiListServiceApiKeys').mockResolvedValue([sampleKey])

        render(
            <MemoryRouter>
                <ServiceApiKeys />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Gateway → Auth')).toBeInTheDocument()
        expect(screen.getByText('ff_sk_abc')).toBeInTheDocument()
        expect(screen.getByText('auth:read')).toBeInTheDocument()
        expect(screen.getByText('активен')).toBeInTheDocument()
    })

    it('shows danger toast when service keys load fails', async () => {
        vi.spyOn(SystemAuthService, 'apiListServiceApiKeys').mockRejectedValue(
            new Error('network'),
        )

        render(
            <MemoryRouter>
                <ServiceApiKeys />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls[0][0] as { props: { title: string } }
            expect(notification.props.title).toBe('Не удалось загрузить реестр ключей')
        })
    })
})
