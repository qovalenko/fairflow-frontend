import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiResetPassword = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiResetPassword: (...a: unknown[]) => apiResetPassword(...a),
}))

import ResetPasswordForm from './ResetPasswordForm'

describe('ResetPasswordForm (SCR-AUTH-RESET)', () => {
    beforeEach(() => {
        apiResetPassword.mockReset()
    })

    it('validates password length and confirmation match', async () => {
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-1']}>
                <ResetPasswordForm resetComplete={false} />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'short')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'other')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))

        expect(await screen.findByText('Минимум 8 символов')).toBeInTheDocument()
        expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument()
        expect(apiResetPassword).not.toHaveBeenCalled()
    })

    it('calls reset API with token from path and completes form', async () => {
        apiResetPassword.mockResolvedValue(true)
        const setResetComplete = vi.fn()
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-abc']}>
                <Routes>
                    <Route
                        path="/auth/reset-password/:token"
                        element={
                            <ResetPasswordForm
                                resetComplete={false}
                                setResetComplete={setResetComplete}
                            >
                                <div>done</div>
                            </ResetPasswordForm>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'new-password')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'new-password')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))

        await waitFor(() =>
            expect(apiResetPassword).toHaveBeenCalledWith({
                password: 'new-password',
                token: 'token-abc',
            }),
        )
        expect(setResetComplete).toHaveBeenCalledWith(true)
    })

    it('reads token from query string', async () => {
        apiResetPassword.mockResolvedValue(true)
        render(
            <MemoryRouter initialEntries={['/auth/reset-password?token=from-query']}>
                <ResetPasswordForm resetComplete={false} setResetComplete={vi.fn()} />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'long-enough')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'long-enough')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))

        await waitFor(() =>
            expect(apiResetPassword).toHaveBeenCalledWith({
                password: 'long-enough',
                token: 'from-query',
            }),
        )
    })

    it('reports API errors through setMessage', async () => {
        apiResetPassword.mockRejectedValue('Ссылка устарела')
        const setMessage = vi.fn()
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-1']}>
                <ResetPasswordForm resetComplete={false} setMessage={setMessage} />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'long-enough')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'long-enough')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))

        await waitFor(() => expect(setMessage).toHaveBeenCalledWith('Ссылка устарела'))
    })
})
