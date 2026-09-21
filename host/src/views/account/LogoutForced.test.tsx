import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const signOut = vi.fn()
const navigate = vi.fn()

vi.mock('@/auth', () => ({
    default: {},
    useAuth: () => ({ signOut }),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import LogoutForced from './LogoutForced'

const renderLogoutForced = (entry: string) =>
    render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route path="/account/logout-forced" element={<LogoutForced />} />
            </Routes>
        </MemoryRouter>,
    )

describe('LogoutForced (SCR-MPROF-LOGOUT-FORCED)', () => {
    beforeEach(() => {
        signOut.mockReset()
        navigate.mockReset()
    })

    it('clears session and shows default session_revoked reason', async () => {
        renderLogoutForced('/account/logout-forced')

        expect(signOut).toHaveBeenCalled()
        expect(await screen.findByText('Сессия завершена')).toBeInTheDocument()
        expect(
            screen.getByText('Сессия была завершена. Пожалуйста, войдите снова.'),
        ).toBeInTheDocument()
    })

    it('shows password_changed reason from query param', async () => {
        renderLogoutForced('/account/logout-forced?reason=password_changed')

        expect(
            await screen.findByText('Пароль был изменён на другом устройстве — войдите заново.'),
        ).toBeInTheDocument()
    })

    it('navigates to sign-in with reason after user clicks login again', async () => {
        renderLogoutForced('/account/logout-forced?reason=token_expired')

        const button = await screen.findByRole('button', { name: 'Войти снова' })
        await waitFor(() => expect(button).not.toBeDisabled())
        await userEvent.click(button)

        expect(navigate).toHaveBeenCalledWith('/auth/signin?reason=token_expired')
    })
})
