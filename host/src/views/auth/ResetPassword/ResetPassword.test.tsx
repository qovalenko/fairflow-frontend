import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiResetPassword = vi.fn()
const navigate = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiResetPassword: (...a: unknown[]) => apiResetPassword(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import { ResetPasswordBase } from './ResetPassword'

describe('ResetPassword (SCR-AUTH-RESET-PAGE)', () => {
    beforeEach(() => {
        apiResetPassword.mockReset()
        navigate.mockReset()
    })

    it('shows reset form with instructions', () => {
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-1']}>
                <Routes>
                    <Route path="/auth/reset-password/:token" element={<ResetPasswordBase />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Новый пароль' })).toBeInTheDocument()
        expect(
            screen.getByText('Новый пароль должен отличаться от предыдущего'),
        ).toBeInTheDocument()
    })

    it('shows success state after password reset', async () => {
        apiResetPassword.mockResolvedValue(true)
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-1']}>
                <Routes>
                    <Route path="/auth/reset-password/:token" element={<ResetPasswordBase />} />
                </Routes>
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'newpass123')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'newpass123')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))

        expect(await screen.findByRole('heading', { name: 'Пароль изменён' })).toBeInTheDocument()
        await waitFor(() =>
            expect(apiResetPassword).toHaveBeenCalledWith({
                token: 'token-1',
                password: 'newpass123',
            }),
        )
    })

    it('navigates to sign-in from success screen', async () => {
        apiResetPassword.mockResolvedValue(true)
        render(
            <MemoryRouter initialEntries={['/auth/reset-password/token-1']}>
                <Routes>
                    <Route path="/auth/reset-password/:token" element={<ResetPasswordBase />} />
                </Routes>
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('••••••••••••'), 'newpass123')
        await userEvent.type(screen.getByPlaceholderText('Подтвердите пароль'), 'newpass123')
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить пароль' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Продолжить' }))

        expect(navigate).toHaveBeenCalledWith('/auth/signin')
    })
})
