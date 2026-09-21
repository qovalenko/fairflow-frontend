import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => () => true,
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import OidcProviders from './OidcProviders'

const sampleProvider: SystemAuthService.OidcProviderAdminRow = {
    id: 'keycloak',
    name: 'Keycloak',
    issuer: 'https://sso.example.com/realms/acme',
    clientId: 'fairflow',
    discoveryUrl: '',
    scopes: ['openid', 'profile', 'email'],
    isActive: true,
    trustEmail: false,
    fromEnv: false,
}

describe('OidcProviders (SCR-AUTH-OIDC-ADMIN)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
        useWorkspaceRoleMock.mockReturnValue({ isSystemOwnerOrAdmin: true })
    })

    it('shows no-permission message for non-admin users', () => {
        useWorkspaceRoleMock.mockReturnValue({ isSystemOwnerOrAdmin: false })

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(
            screen.getByText('Недостаточно прав для настройки SSO.'),
        ).toBeInTheDocument()
    })

    it('shows loading spinner while providers load', () => {
        vi.spyOn(SystemAuthService, 'apiListOidcProvidersAdmin').mockImplementation(
            () => new Promise(() => {}),
        )

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(screen.getByText('Настроенные провайдеры')).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows empty state when no SSO providers configured', async () => {
        vi.spyOn(SystemAuthService, 'apiListOidcProvidersAdmin').mockResolvedValue([])

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Провайдеры не настроены.')).toBeInTheDocument()
    })

    it('shows configured provider rows', async () => {
        vi.spyOn(SystemAuthService, 'apiListOidcProvidersAdmin').mockResolvedValue([
            sampleProvider,
        ])

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(await screen.findByText('keycloak')).toBeInTheDocument()
        expect(screen.getByText('Keycloak')).toBeInTheDocument()
        expect(screen.getByText('активен')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Изменить' })).toBeInTheDocument()
    })

    it('shows danger toast when providers load fails', async () => {
        vi.spyOn(SystemAuthService, 'apiListOidcProvidersAdmin').mockRejectedValue(
            new Error('network'),
        )

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls[0][0] as { props: { title: string } }
            expect(notification.props.title).toBe('Не удалось загрузить провайдеры SSO')
        })
    })

    it('saves edited provider and shows success toast', async () => {
        const listSpy = vi
            .spyOn(SystemAuthService, 'apiListOidcProvidersAdmin')
            .mockResolvedValue([sampleProvider])
        const upsertSpy = vi
            .spyOn(SystemAuthService, 'apiUpsertOidcProvider')
            .mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(await screen.findByText('keycloak')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Изменить' }))
        expect(screen.getByText('Редактирование провайдера')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(upsertSpy).toHaveBeenCalled())
        const successToast = toastPush.mock.calls.at(-1)?.[0] as { props: { title: string } }
        expect(successToast.props.title).toBe('Провайдер сохранён')
        expect(listSpy.mock.calls.length).toBeGreaterThan(1)
    })

    it('deactivates active provider and shows success toast', async () => {
        vi.spyOn(SystemAuthService, 'apiListOidcProvidersAdmin').mockResolvedValue([
            sampleProvider,
        ])
        const deactivateSpy = vi
            .spyOn(SystemAuthService, 'apiDeactivateOidcProvider')
            .mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <OidcProviders />
            </MemoryRouter>,
        )

        expect(await screen.findByText('keycloak')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Отключить' }))

        await waitFor(() => expect(deactivateSpy).toHaveBeenCalledWith('keycloak'))
        const successToast = toastPush.mock.calls.at(-1)?.[0] as { props: { title: string } }
        expect(successToast.props.title).toBe('Провайдер отключён')
    })
})
