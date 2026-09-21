import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiCancelEmailChangeByToken = vi.fn()
const navigate = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiCancelEmailChangeByToken: (...a: unknown[]) => apiCancelEmailChangeByToken(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import EmailCancel from './EmailCancel'

const renderEmailCancel = (entry: string) =>
    render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="/account/profile/email-cancel" element={<EmailCancel />} />
            </Routes>
        </MemoryRouter>,
    )

describe('EmailCancel (SCR-MPROF-EMAIL-CANCEL)', () => {
    beforeEach(() => {
        apiCancelEmailChangeByToken.mockReset()
        navigate.mockReset()
    })

    it('shows loading then success after token cancellation', async () => {
        apiCancelEmailChangeByToken.mockResolvedValue(undefined)
        renderEmailCancel('/account/profile/email-cancel?token=good-token')

        expect(screen.getByText('Отменяем смену email…')).toBeInTheDocument()
        expect(await screen.findByText('Смена email отменена')).toBeInTheDocument()
        expect(apiCancelEmailChangeByToken).toHaveBeenCalledWith('good-token')
    })

    it('shows invalid-link state without token', async () => {
        renderEmailCancel('/account/profile/email-cancel')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
        expect(apiCancelEmailChangeByToken).not.toHaveBeenCalled()
    })

    it('shows expired state for 410 from cancel endpoint', async () => {
        apiCancelEmailChangeByToken.mockRejectedValue({
            isAxiosError: true,
            response: { status: 410, data: { code: 'TOKEN_EXPIRED' } },
        })
        renderEmailCancel('/account/profile/email-cancel?token=old-token')

        expect(await screen.findByText('Ссылка устарела')).toBeInTheDocument()
        expect(
            screen.getByText('Запрос уже отменён, подтверждён или срок ссылки истёк.'),
        ).toBeInTheDocument()
    })

    it('shows error state for unexpected API failure', async () => {
        apiCancelEmailChangeByToken.mockRejectedValue({
            isAxiosError: true,
            response: { status: 500, data: { message: 'fail' } },
        })
        renderEmailCancel('/account/profile/email-cancel?token=bad-token')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
    })

    it('navigates to security after success', async () => {
        apiCancelEmailChangeByToken.mockResolvedValue(undefined)
        renderEmailCancel('/account/profile/email-cancel?token=good-token')

        await userEvent.click(
            await screen.findByRole('button', { name: 'Перейти к настройкам безопасности' }),
        )
        expect(navigate).toHaveBeenCalledWith('/account/security')
    })
})
