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

import BackupCode from './BackupCode'

describe('BackupCode (SCR-AUTH-BACKUP-CODE)', () => {
    beforeEach(() => {
        apiVerifyMfa.mockReset()
        navigate.mockReset()
    })

    it('keeps submit inactive until backup code entered', async () => {
        render(
            <MemoryRouter initialEntries={['/auth/backup-code?preauthId=pa-1']}>
                <BackupCode />
            </MemoryRouter>,
        )

        const submit = screen.getByRole('button', { name: 'Подтвердить' })
        expect(submit.className).toMatch(/cursor-not-allowed/)
        await userEvent.click(submit)
        expect(apiVerifyMfa).not.toHaveBeenCalled()
    })

    it('submits backup code and navigates home on success', async () => {
        apiVerifyMfa.mockResolvedValue(undefined)
        render(
            <MemoryRouter initialEntries={['/auth/backup-code?preauthId=pa-1']}>
                <BackupCode />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('XXXX-XXXX'), 'ABCD-1234')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        await waitFor(() =>
            expect(apiVerifyMfa).toHaveBeenCalledWith({
                preauthId: 'pa-1',
                backupCode: 'ABCD-1234',
            }),
        )
        expect(navigate).toHaveBeenCalledWith('/')
    })

    it('shows invalid code error', async () => {
        apiVerifyMfa.mockRejectedValue({
            isAxiosError: true,
            response: { status: 400, data: { code: 'INVALID_TOTP' } },
        })
        render(
            <MemoryRouter initialEntries={['/auth/backup-code?preauthId=pa-1']}>
                <BackupCode />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('XXXX-XXXX'), 'USED-CODE')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        expect(
            await screen.findByText('Неверный код подтверждения.'),
        ).toBeInTheDocument()
    })

    it('redirects to sign-in when pre-auth expired', async () => {
        apiVerifyMfa.mockRejectedValue({
            isAxiosError: true,
            response: { status: 410, data: { message: 'expired' } },
        })
        render(
            <MemoryRouter initialEntries={['/auth/backup-code?preauthId=pa-1']}>
                <BackupCode />
            </MemoryRouter>,
        )

        await userEvent.type(screen.getByPlaceholderText('XXXX-XXXX'), 'ABCD-1234')
        await userEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/auth/signin?reason=token_expired'),
        )
    })
})
