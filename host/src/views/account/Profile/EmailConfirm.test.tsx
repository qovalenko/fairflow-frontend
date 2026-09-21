import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiConfirmEmailChange = vi.fn()
const navigate = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiConfirmEmailChange: (...a: unknown[]) => apiConfirmEmailChange(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import EmailConfirm from './EmailConfirm'

const renderEmailConfirm = (entry: string) =>
    render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="/account/profile/email-confirm" element={<EmailConfirm />} />
            </Routes>
        </MemoryRouter>,
    )

describe('EmailConfirm (SCR-MPROF-EMAIL-CONFIRM)', () => {
    beforeEach(() => {
        apiConfirmEmailChange.mockReset()
        navigate.mockReset()
    })

    it('shows loading then success after token confirmation', async () => {
        apiConfirmEmailChange.mockResolvedValue(undefined)
        renderEmailConfirm('/account/profile/email-confirm?token=good-token')

        expect(screen.getByText('Подтверждаем новый email…')).toBeInTheDocument()
        expect(await screen.findByText('Email подтверждён')).toBeInTheDocument()
        expect(apiConfirmEmailChange).toHaveBeenCalledWith('good-token')
    })

    it('shows invalid-link state without token', async () => {
        renderEmailConfirm('/account/profile/email-confirm')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
        expect(apiConfirmEmailChange).not.toHaveBeenCalled()
    })

    it('shows expired state for 410 from confirm endpoint', async () => {
        apiConfirmEmailChange.mockRejectedValue({
            isAxiosError: true,
            response: { status: 410, data: { code: 'TOKEN_EXPIRED' } },
        })
        renderEmailConfirm('/account/profile/email-confirm?token=old-token')

        expect(await screen.findByText('Ссылка устарела')).toBeInTheDocument()
        expect(
            screen.getByText('Срок действия ссылки истёк. Запросите смену email заново.'),
        ).toBeInTheDocument()
    })

    it('shows error state for unexpected API failure', async () => {
        apiConfirmEmailChange.mockRejectedValue({
            isAxiosError: true,
            response: { status: 500, data: { message: 'fail' } },
        })
        renderEmailConfirm('/account/profile/email-confirm?token=bad-token')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
    })

    it('navigates to profile after success', async () => {
        apiConfirmEmailChange.mockResolvedValue(undefined)
        renderEmailConfirm('/account/profile/email-confirm?token=good-token')

        await userEvent.click(
            await screen.findByRole('button', { name: 'Перейти в профиль' }),
        )
        expect(navigate).toHaveBeenCalledWith('/account/profile')
    })
})
