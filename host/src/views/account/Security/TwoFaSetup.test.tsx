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
        onConfirm,
        title,
    }: {
        onConfirm: (cred: { currentPassword: string }) => Promise<void>
        title?: string
    }) => (
        <div>
            <h6>{title}</h6>
            <button
                type="button"
                onClick={() => onConfirm({ currentPassword: 'secret' })}
            >
                Продолжить reauth
            </button>
        </div>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import TwoFaSetup from './TwoFaSetup'

describe('TwoFaSetup (SCR-MPROF-2FA-SETUP)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        navigate.mockReset()
    })

    it('redirects to security when 2FA is already enabled', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: true,
            },
        })

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/account/security', { replace: true }),
        )
    })

    it('shows org require-2FA policy on reauth step', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
                require2fa: true,
            },
        })

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Организация требует 2FA для вашей роли.'),
        ).toBeInTheDocument()
        expect(screen.getByText('Подтвердите личность')).toBeInTheDocument()
    })

    it('shows QR step after successful reauth init', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
            },
        })
        vi.spyOn(AuthService, 'apiInit2fa').mockResolvedValue({
            secret: 'ABCD1234',
            otpauthUri: 'otpauth://totp/Fairflow',
            qrSvg: '<svg data-testid="qr"></svg>',
        })

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить reauth' }))

        expect(await screen.findByDisplayValue('ABCD1234')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('6-значный код')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Активировать' }).className).toMatch(
            /cursor-not-allowed/,
        )
    })

    it('shows init loading text while secret is generated', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
            },
        })
        let resolveInit!: (value: Awaited<ReturnType<typeof AuthService.apiInit2fa>>) => void
        vi.spyOn(AuthService, 'apiInit2fa').mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveInit = resolve
                }),
        )

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить reauth' }))
        expect(screen.getByText('Генерируем секрет…')).toBeInTheDocument()

        resolveInit({
            secret: 'ZZZZ',
            otpauthUri: 'otpauth://totp/Fairflow',
        })

        expect(await screen.findByDisplayValue('ZZZZ')).toBeInTheDocument()
    })

    it('shows API error when TOTP verification fails', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
            },
        })
        vi.spyOn(AuthService, 'apiInit2fa').mockResolvedValue({
            secret: 'ABCD1234',
            otpauthUri: 'otpauth://totp/Fairflow',
        })
        vi.spyOn(AuthService, 'apiEnable2fa').mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: { code: 'INVALID_TOTP' } },
        })

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить reauth' }))
        await userEvent.type(await screen.findByPlaceholderText('6-значный код'), '123456')
        await userEvent.click(screen.getByRole('button', { name: 'Активировать' }))

        expect(await screen.findByText('Неверный код подтверждения.')).toBeInTheDocument()
    })

    it('shows backup codes step after successful enable', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'user@test.local',
                twoFactorEnabled: false,
            },
        })
        vi.spyOn(AuthService, 'apiInit2fa').mockResolvedValue({
            secret: 'ABCD1234',
            otpauthUri: 'otpauth://totp/Fairflow',
        })
        vi.spyOn(AuthService, 'apiEnable2fa').mockResolvedValue({
            backupCodes: ['code-1', 'code-2'],
        })

        render(
            <MemoryRouter>
                <TwoFaSetup />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить reauth' }))
        await userEvent.type(await screen.findByPlaceholderText('6-значный код'), '654321')
        await userEvent.click(screen.getByRole('button', { name: 'Активировать' }))

        expect(
            await screen.findByText('Двухфакторная аутентификация включена.'),
        ).toBeInTheDocument()
        expect(screen.getByText('code-1')).toBeInTheDocument()

        const doneBtn = screen.getByRole('button', { name: 'Готово' })
        expect(doneBtn.className).toMatch(/cursor-not-allowed/)

        await userEvent.click(screen.getByRole('checkbox'))
        expect(doneBtn.className).not.toMatch(/cursor-not-allowed/)
    })
})
