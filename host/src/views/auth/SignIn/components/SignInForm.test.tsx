import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signIn = vi.fn()

vi.mock('@/auth', () => ({
    useAuth: () => ({ signIn }),
}))

import SignInForm from './SignInForm'

describe('SignInForm', () => {
    beforeEach(() => {
        signIn.mockReset()
    })

    it('shows validation errors for empty submit', async () => {
        render(<SignInForm />)
        await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
        expect(await screen.findByText('Введите email')).toBeInTheDocument()
        expect(screen.getByText('Введите пароль')).toBeInTheDocument()
        expect(signIn).not.toHaveBeenCalled()
    })

    it('calls signIn with entered credentials', async () => {
        signIn.mockResolvedValue({ status: 'success' })
        render(<SignInForm />)
        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.type(screen.getByPlaceholderText('Пароль'), 'secret')
        await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
        await waitFor(() =>
            expect(signIn).toHaveBeenCalledWith({
                email: 'user@test.local',
                password: 'secret',
            }),
        )
    })

    it('surfaces failed sign-in message from auth layer', async () => {
        const setMessage = vi.fn()
        signIn.mockResolvedValue({ status: 'failed', message: 'Неверный пароль' })
        render(<SignInForm setMessage={setMessage} />)
        await userEvent.type(screen.getByPlaceholderText('Эл. почта'), 'user@test.local')
        await userEvent.type(screen.getByPlaceholderText('Пароль'), 'wrong')
        await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
        await waitFor(() => expect(setMessage).toHaveBeenCalledWith('Неверный пароль'))
    })
})
