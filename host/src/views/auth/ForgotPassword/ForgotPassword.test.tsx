import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiForgotPassword = vi.fn()
const navigate = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiForgotPassword: (...a: unknown[]) => apiForgotPassword(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import { ForgotPasswordBase } from './ForgotPassword'

describe('ForgotPassword (SCR-AUTH-FORGOT-PASSWORD)', () => {
    beforeEach(() => {
        apiForgotPassword.mockReset()
        navigate.mockReset()
    })

    it('shows request form with instructions', () => {
        render(
            <MemoryRouter>
                <ForgotPasswordBase />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Восстановление пароля' })).toBeInTheDocument()
        expect(
            screen.getByText('Введите email, чтобы получить код подтверждения'),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument()
    })

    it('shows success state after email is sent', async () => {
        apiForgotPassword.mockResolvedValue(true)
        render(
            <MemoryRouter>
                <ForgotPasswordBase />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

        expect(await screen.findByRole('heading', { name: 'Проверьте почту' })).toBeInTheDocument()
        expect(
            screen.getByText('Мы отправили инструкцию по восстановлению пароля на вашу почту'),
        ).toBeInTheDocument()
        await waitFor(() =>
            expect(apiForgotPassword).toHaveBeenCalledWith({ email: 'user@test.local' }),
        )
    })

    it('navigates to sign-in from success screen', async () => {
        apiForgotPassword.mockResolvedValue(true)
        render(
            <MemoryRouter>
                <ForgotPasswordBase />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить' }))

        expect(navigate).toHaveBeenCalledWith('/auth/signin')
    })
})
