import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiVerifyMfa = vi.fn()
const navigate = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiVerifyMfa: (...a: unknown[]) => apiVerifyMfa(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import TwoFactorAuth from './TwoFactorAuth'

describe('TwoFactorAuth (SCR-AUTH-2FA)', () => {
    beforeEach(() => {
        apiVerifyMfa.mockReset()
        navigate.mockReset()
    })

    it('validates empty submit', async () => {
        render(
            <MemoryRouter initialEntries={['/auth/2fa?preauthId=pa-1']}>
                <TwoFactorAuth />
            </MemoryRouter>,
        )

        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))
        expect(await screen.findByText('Введите код из 6 цифр')).toBeInTheDocument()
        expect(apiVerifyMfa).not.toHaveBeenCalled()
    })

    it('submits MFA code and navigates home on success', async () => {
        apiVerifyMfa.mockResolvedValue(undefined)
        render(
            <MemoryRouter initialEntries={['/auth/2fa?preauthId=pa-1']}>
                <TwoFactorAuth />
            </MemoryRouter>,
        )

        const firstDigit = screen.getByLabelText('Digit 1 of 6')
        await userEvent.click(firstDigit)
        await userEvent.paste('123456')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        await waitFor(() =>
            expect(apiVerifyMfa).toHaveBeenCalledWith({
                preauthId: 'pa-1',
                code: '123456',
            }),
        )
        expect(navigate).toHaveBeenCalledWith('/')
    })

    it('shows API error for invalid code', async () => {
        apiVerifyMfa.mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: { code: 'INVALID_TOTP' } },
        })
        render(
            <MemoryRouter initialEntries={['/auth/2fa?preauthId=pa-1']}>
                <TwoFactorAuth />
            </MemoryRouter>,
        )

        const firstDigit = screen.getByLabelText('Digit 1 of 6')
        await userEvent.click(firstDigit)
        await userEvent.paste('000000')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        expect(await screen.findByText('Неверный код подтверждения.')).toBeInTheDocument()
    })

    it('redirects to sign-in when pre-auth expired', async () => {
        apiVerifyMfa.mockRejectedValue({
            isAxiosError: true,
            response: { status: 410, data: { message: 'expired' } },
        })
        render(
            <MemoryRouter initialEntries={['/auth/2fa?preauthId=pa-1']}>
                <TwoFactorAuth />
            </MemoryRouter>,
        )

        const firstDigit = screen.getByLabelText('Digit 1 of 6')
        await userEvent.click(firstDigit)
        await userEvent.paste('123456')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/auth/signin?reason=token_expired'),
        )
    })

    it('links to backup-code flow with preauthId', () => {
        render(
            <MemoryRouter initialEntries={['/auth/2fa?preauthId=pa-1']}>
                <TwoFactorAuth />
            </MemoryRouter>,
        )

        expect(screen.getByRole('link', { name: 'Использовать резервный код' })).toHaveAttribute(
            'href',
            '/auth/backup-code?preauthId=pa-1',
        )
    })
})
