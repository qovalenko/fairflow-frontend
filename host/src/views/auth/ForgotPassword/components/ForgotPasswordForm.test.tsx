import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiForgotPassword = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiForgotPassword: (...a: unknown[]) => apiForgotPassword(...a),
}))

import ForgotPasswordForm from './ForgotPasswordForm'

describe('ForgotPasswordForm', () => {
    beforeEach(() => {
        apiForgotPassword.mockReset()
    })

    it('validates email before submit', async () => {
        render(<ForgotPasswordForm emailSent={false} />)
        await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
        expect(await screen.findByText('Введите корректный email')).toBeInTheDocument()
        expect(apiForgotPassword).not.toHaveBeenCalled()
    })

    it('calls forgot-password API and switches to success state', async () => {
        apiForgotPassword.mockResolvedValue(true)
        const setEmailSent = vi.fn()
        render(
            <ForgotPasswordForm emailSent={false} setEmailSent={setEmailSent}>
                <div>check your inbox</div>
            </ForgotPasswordForm>,
        )
        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
        await waitFor(() =>
            expect(apiForgotPassword).toHaveBeenCalledWith({ email: 'user@test.local' }),
        )
        expect(setEmailSent).toHaveBeenCalledWith(true)
    })

    it('reports API errors through setMessage', async () => {
        apiForgotPassword.mockRejectedValue('Сервис недоступен')
        const setMessage = vi.fn()
        render(
            <ForgotPasswordForm
                emailSent={false}
                setMessage={setMessage}
            />,
        )
        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
        await waitFor(() => expect(setMessage).toHaveBeenCalledWith('Сервис недоступен'))
    })
})
