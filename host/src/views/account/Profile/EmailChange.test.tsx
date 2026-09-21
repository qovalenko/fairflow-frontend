import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiGetMyProfile = vi.fn()
const apiRequestEmailChange = vi.fn()
const apiCancelEmailChange = vi.fn()
const navigate = vi.fn()

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/AuthService', () => ({
    apiGetMyProfile: (...a: unknown[]) => apiGetMyProfile(...a),
    apiRequestEmailChange: (...a: unknown[]) => apiRequestEmailChange(...a),
    apiCancelEmailChange: (...a: unknown[]) => apiCancelEmailChange(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})
vi.mock('@/utils/notify', () => ({
    notify: vi.fn(),
}))

import EmailChange from './EmailChange'
import { notify } from '@/utils/notify'

const passwordInput = () =>
    document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement

describe('EmailChange (SCR-MPROF-EMAIL-CHANGE)', () => {
    beforeEach(() => {
        apiGetMyProfile.mockReset()
        apiRequestEmailChange.mockReset()
        apiCancelEmailChange.mockReset()
        navigate.mockReset()
    })

    it('shows loading skeleton before profile loads', () => {
        apiGetMyProfile.mockImplementation(() => new Promise(() => {}))
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
        expect(screen.queryByLabelText('Новый email')).not.toBeInTheDocument()
    })

    it('shows pending-email state when change is awaiting confirmation', async () => {
        apiGetMyProfile.mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'old@test.local',
                pendingEmail: 'new@test.local',
                twoFactorEnabled: false,
            },
        })
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        expect(await screen.findByText(/new@test\.local/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отменить запрос' })).toBeInTheDocument()
    })

    it('submits email change request and shows success notification', async () => {
        apiGetMyProfile.mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'old@test.local',
                twoFactorEnabled: false,
            },
        })
        apiRequestEmailChange.mockResolvedValue({ pendingEmail: 'new@test.local' })
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        await screen.findByDisplayValue('old@test.local')
        await userEvent.type(screen.getByPlaceholderText('new@example.com'), 'new@test.local')
        await userEvent.type(passwordInput(), 'secret123')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить смену' }))

        await waitFor(() =>
            expect(apiRequestEmailChange).toHaveBeenCalledWith({
                newEmail: 'new@test.local',
                currentPassword: 'secret123',
                totpCode: undefined,
            }),
        )
        expect(notify).toHaveBeenCalledWith('Письмо с подтверждением отправлено', 'success')
        expect(await screen.findByText(/new@test\.local/)).toBeInTheDocument()
    })

    it('shows email field error when new email is already taken', async () => {
        apiGetMyProfile.mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'old@test.local',
                twoFactorEnabled: false,
            },
        })
        apiRequestEmailChange.mockRejectedValue({
            isAxiosError: true,
            response: { status: 409, data: { code: 'EMAIL_TAKEN', message: 'Email занят' } },
        })
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        await screen.findByDisplayValue('old@test.local')
        await userEvent.type(screen.getByPlaceholderText('new@example.com'), 'taken@test.local')
        await userEvent.type(passwordInput(), 'secret123')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить смену' }))

        expect(
            await screen.findByText('Этот email уже используется. Укажите другой адрес.'),
        ).toBeInTheDocument()
    })

    it('shows password error for invalid credentials', async () => {
        apiGetMyProfile.mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'old@test.local',
                twoFactorEnabled: false,
            },
        })
        apiRequestEmailChange.mockRejectedValue({
            isAxiosError: true,
            response: { status: 403, data: { code: 'INVALID_CREDENTIALS', message: 'Неверный пароль' } },
        })
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        await screen.findByDisplayValue('old@test.local')
        await userEvent.type(screen.getByPlaceholderText('new@example.com'), 'new@test.local')
        await userEvent.type(passwordInput(), 'wrong')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить смену' }))

        expect(await screen.findByText('Неверный текущий пароль.')).toBeInTheDocument()
    })

    it('shows totp error when 2FA code is invalid', async () => {
        apiGetMyProfile.mockResolvedValue({
            user: {
                userId: 'u-1',
                userName: 'User',
                email: 'old@test.local',
                twoFactorEnabled: true,
            },
        })
        apiRequestEmailChange.mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: { code: 'INVALID_TOTP', message: 'Неверный код 2FA' } },
        })
        render(
            <MemoryRouter>
                <EmailChange />
            </MemoryRouter>,
        )

        await screen.findByDisplayValue('old@test.local')
        await userEvent.type(screen.getByPlaceholderText('new@example.com'), 'new@test.local')
        await userEvent.type(passwordInput(), 'secret123')
        await userEvent.type(screen.getByPlaceholderText('6-значный код'), '000000')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить смену' }))

        expect(await screen.findByText('Неверный код подтверждения.')).toBeInTheDocument()
    })
})
