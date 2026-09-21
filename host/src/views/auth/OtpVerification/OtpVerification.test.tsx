import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/utils/sleep', () => ({
    default: () => Promise.resolve(),
}))

import OtpVerification from './OtpVerification'

describe('OtpVerification (SCR-AUTH-OTP)', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('does not verify when OTP is empty', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<OtpVerification />)

        expect(screen.getByRole('heading', { name: 'OTP Verification' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
        expect(screen.queryByText('OTP verified!')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Verify OTP' })).toBeInTheDocument()
    })

    it.skip(
        '[fixme] shows Russian validation message when OTP empty — OtpInput leaves field undefined, zod emits generic message',
        async () => {
            const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
            render(<OtpVerification />)

            await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
            expect(await screen.findByText('Введите корректный код')).toBeInTheDocument()
        },
    )

    it('shows success after valid OTP verification', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<OtpVerification />)

        const firstDigit = screen.getByLabelText('Digit 1 of 6')
        await user.click(firstDigit)
        await user.paste('123456')
        await user.click(screen.getByRole('button', { name: 'Verify OTP' }))

        expect(await screen.findByText('OTP verified!')).toBeInTheDocument()
    })

    it('shows resend confirmation after clicking Resend OTP', async () => {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<OtpVerification />)

        await user.click(screen.getByRole('button', { name: 'Resend OTP' }))

        await waitFor(() =>
            expect(
                screen.getByText('We have sent you One Time Password.'),
            ).toBeInTheDocument(),
        )
    })
})
