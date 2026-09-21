import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as AuthService from '@/services/AuthService'

const navigate = vi.fn()

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/shared/ReauthDialog', () => ({
    default: ({
        isOpen,
        onConfirm,
        title,
    }: {
        isOpen: boolean
        onConfirm: (cred: { currentPassword: string; totpCode?: string }) => Promise<void>
        title?: string
    }) =>
        isOpen ? (
            <div>
                <h6>{title}</h6>
                <button
                    type="button"
                    onClick={() =>
                        onConfirm({ currentPassword: 'secret', totpCode: '123456' })
                    }
                >
                    Подтвердить reauth
                </button>
            </div>
        ) : null,
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import TwoFaBackup from './TwoFaBackup'

describe('TwoFaBackup (SCR-MPROF-2FA-BACKUP)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        navigate.mockReset()
    })

    it('shows loading then remaining backup codes count', async () => {
        let resolveProfile!: (
            value: Awaited<ReturnType<typeof AuthService.apiGetMyProfile>>,
        ) => void
        vi.spyOn(AuthService, 'apiGetMyProfile').mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveProfile = resolve
                }),
        )

        render(
            <MemoryRouter>
                <TwoFaBackup />
            </MemoryRouter>,
        )

        expect(screen.getByText('Резервные коды')).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Перевыпустить коды' }),
        ).not.toBeInTheDocument()

        resolveProfile({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: true,
                backupCodesRemaining: 5,
            },
        })

        expect(await screen.findByRole('button', { name: 'Перевыпустить коды' })).toBeInTheDocument()
        expect(screen.getByText('5', { exact: false })).toBeInTheDocument()
    })

    it('shows retry when profile load fails', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockRejectedValue(new Error('network'))
        render(
            <MemoryRouter>
                <TwoFaBackup />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось загрузить данные.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('redirects to security when 2FA is disabled', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
            },
        })

        render(
            <MemoryRouter>
                <TwoFaBackup />
            </MemoryRouter>,
        )

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/account/security', { replace: true }),
        )
    })

    it('shows fresh backup codes after successful regenerate', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: true,
                backupCodesRemaining: 2,
            },
        })
        vi.spyOn(AuthService, 'apiRegenerateBackupCodes').mockResolvedValue({
            backupCodes: ['backup-aaa', 'backup-bbb'],
        })

        render(
            <MemoryRouter>
                <TwoFaBackup />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Перевыпустить коды' }))
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить reauth' }))

        expect(
            await screen.findByText('Коды перевыпущены. Прежние коды недействительны.'),
        ).toBeInTheDocument()
        expect(screen.getByText('backup-aaa')).toBeInTheDocument()
        expect(screen.getByText('backup-bbb')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Готово' }))
        expect(navigate).toHaveBeenCalledWith('/account/security')
    })
})
