import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as AuthService from '@/services/AuthService'

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/shared/ReauthDialog', () => ({
    default: () => null,
}))
vi.mock('@/utils/notify', () => ({
    notify: vi.fn(),
}))

import Security from './Security'

describe('Security (SCR-MPROF-SECURITY)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('shows loading skeleton then disabled 2FA state', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
                require2fa: false,
                backupCodesRemaining: undefined,
            },
        })

        render(
            <MemoryRouter>
                <Security />
            </MemoryRouter>,
        )

        expect(screen.getByText('Безопасность')).toBeInTheDocument()
        await waitFor(() =>
            expect(screen.getByRole('link', { name: 'Включить 2FA' })).toHaveAttribute(
                'href',
                '/account/security/2fa/setup',
            ),
        )
        expect(screen.getByText('Выключено')).toBeInTheDocument()
    })

    it('shows retry when profile load fails', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockRejectedValue(new Error('network'))
        render(
            <MemoryRouter>
                <Security />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось получить статус 2FA.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('shows enabled 2FA actions and low backup warning', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: true,
                require2fa: false,
                backupCodesRemaining: 1,
            },
        })

        render(
            <MemoryRouter>
                <Security />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Включено')).toBeInTheDocument()
        expect(screen.getByText(/Осталось мало резервных кодов/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Резервные коды' })).toHaveAttribute(
            'href',
            '/account/security/2fa/backup-codes',
        )
        expect(screen.getByRole('button', { name: 'Отключить 2FA' })).toBeInTheDocument()
    })

    it('blocks disable 2FA when org policy requires it', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: true,
                require2fa: true,
                backupCodesRemaining: 5,
            },
        })

        render(
            <MemoryRouter>
                <Security />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Включено')).toBeInTheDocument()
        const disableBtn = screen.getByRole('button', { name: 'Отключить 2FA' })
        expect(disableBtn.className).toMatch(/cursor-not-allowed/)
    })

    it('changes password when fields valid', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
                require2fa: false,
                backupCodesRemaining: undefined,
            },
        })
        vi.spyOn(AuthService, 'apiChangeMyPassword').mockResolvedValue({ revokedSessions: 2 })

        render(
            <MemoryRouter>
                <Security />
            </MemoryRouter>,
        )

        await waitFor(() => expect(screen.getByPlaceholderText('Текущий пароль')).toBeEnabled())

        await userEvent.type(screen.getByPlaceholderText('Текущий пароль'), 'old-pass')
        await userEvent.type(screen.getByPlaceholderText('Новый пароль'), 'NewPass1!')
        await userEvent.type(screen.getByPlaceholderText('Повторите новый пароль'), 'NewPass1!')
        await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

        await waitFor(() =>
            expect(AuthService.apiChangeMyPassword).toHaveBeenCalledWith({
                currentPassword: 'old-pass',
                newPassword: 'NewPass1!',
            }),
        )
        expect(screen.getByPlaceholderText('Текущий пароль')).toHaveValue('')
        expect(screen.getByPlaceholderText('Новый пароль')).toHaveValue('')
    })
})
