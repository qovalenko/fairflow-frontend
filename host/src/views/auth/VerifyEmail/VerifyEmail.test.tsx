import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiConfirmEmailVerify = vi.fn()
const apiRequestEmailVerify = vi.fn()
const notify = vi.fn()

vi.mock('@/services/AuthService', () => ({
    apiConfirmEmailVerify: (...a: unknown[]) => apiConfirmEmailVerify(...a),
    apiRequestEmailVerify: (...a: unknown[]) => apiRequestEmailVerify(...a),
}))
vi.mock('@/utils/notify', () => ({
    notify: (...a: unknown[]) => notify(...a),
}))

import VerifyEmail from './VerifyEmail'

const renderVerifyEmail = (entry: string) =>
    render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="/auth/verify-email/:token" element={<VerifyEmail />} />
                <Route path="/auth/verify-email" element={<VerifyEmail />} />
            </Routes>
        </MemoryRouter>,
    )

describe('VerifyEmail (SCR-AUTH-VERIFY-EMAIL)', () => {
    beforeEach(() => {
        apiConfirmEmailVerify.mockReset()
        apiRequestEmailVerify.mockReset()
        notify.mockReset()
    })

    it('shows success after token confirmation', async () => {
        apiConfirmEmailVerify.mockResolvedValue(undefined)
        renderVerifyEmail('/auth/verify-email/good-token')

        expect(await screen.findByText('Email подтверждён!')).toBeInTheDocument()
        expect(apiConfirmEmailVerify).toHaveBeenCalledWith('good-token')
    })

    it('shows expired state without token and allows resend', async () => {
        apiRequestEmailVerify.mockResolvedValue(undefined)
        renderVerifyEmail('/auth/verify-email?email=user@test.local')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
        await userEvent.click(
            screen.getByRole('button', { name: 'Отправить письмо повторно' }),
        )
        await waitFor(() =>
            expect(apiRequestEmailVerify).toHaveBeenCalledWith('user@test.local'),
        )
        expect(notify).toHaveBeenCalledWith('Письмо отправлено повторно', 'success')
    })

    it('shows error state when confirmation fails unexpectedly', async () => {
        apiConfirmEmailVerify.mockRejectedValue({
            isAxiosError: true,
            response: { status: 500, data: { message: 'fail' } },
        })
        renderVerifyEmail('/auth/verify-email/bad-token')

        expect(await screen.findByText('Не удалось подтвердить')).toBeInTheDocument()
    })

    it('shows expired copy for 410 from confirm endpoint', async () => {
        apiConfirmEmailVerify.mockRejectedValue({
            isAxiosError: true,
            response: { status: 410, data: { code: 'TOKEN_EXPIRED' } },
        })
        renderVerifyEmail('/auth/verify-email/old-token')

        expect(await screen.findByText('Ссылка недействительна')).toBeInTheDocument()
    })
})
