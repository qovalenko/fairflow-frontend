import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const completeOAuthSignIn = vi.fn()
const navigate = vi.fn()
const notify = vi.fn()

vi.mock('@/auth/useAuth', () => ({
    default: () => ({ completeOAuthSignIn }),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})
vi.mock('@/utils/notify', () => ({
    notify: (...a: unknown[]) => notify(...a),
}))

describe('OauthCallback (SCR-AUTH-OAUTH-CALLBACK)', () => {
    beforeEach(() => {
        completeOAuthSignIn.mockReset()
        navigate.mockReset()
        notify.mockReset()
        vi.resetModules()
    })

    async function renderWithHash(hash: string) {
        const path = '/auth/oauth/callback'
        window.history.replaceState({}, '', `${path}${hash ? `#${hash}` : ''}`)
        const { default: OauthCallback } = await import('./OauthCallback')
        return render(
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/auth/oauth/callback" element={<OauthCallback />} />
                </Routes>
            </MemoryRouter>,
        )
    }

    it('shows loading state while OAuth sign-in completes', async () => {
        completeOAuthSignIn.mockImplementation(() => new Promise(() => {}))
        await renderWithHash('access_token=good-token')

        expect(screen.getByText('Входим…')).toBeInTheDocument()
        expect(screen.getByText('Завершаем внешний вход.')).toBeInTheDocument()
    })

    it('redirects to sign-in when OAuth provider returns error', async () => {
        await renderWithHash('error=oauth_not_employee&redirectUrl=%2Fdashboard')

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith(
                '/auth/signin?redirectUrl=%2Fdashboard&reason=oauth_not_employee',
                { replace: true },
            ),
        )
        expect(notify).toHaveBeenCalledWith(
            'Вход через внешний провайдер доступен только сотрудникам',
            'danger',
        )
    })

    it('redirects to 2FA when MFA is required', async () => {
        await renderWithHash('mfaRequired=1&preauthId=pre-1&redirectUrl=%2Fp%2Fproj-1')

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith(
                '/auth/2fa?preauthId=pre-1&redirectUrl=%2Fp%2Fproj-1',
                { replace: true },
            ),
        )
    })

    it('redirects to sign-in when access token is missing', async () => {
        await renderWithHash('redirectUrl=%2Fdashboard')

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith(
                '/auth/signin?redirectUrl=%2Fdashboard&reason=oauth_no_token',
                { replace: true },
            ),
        )
        expect(notify).toHaveBeenCalledWith('Не получен токен входа', 'danger')
    })

    it('navigates to redirect URL after successful OAuth sign-in', async () => {
        completeOAuthSignIn.mockResolvedValue({ status: 'success' })
        await renderWithHash('access_token=good-token&redirectUrl=%2Fp%2Fproj-1')

        await waitFor(() =>
            expect(navigate).toHaveBeenCalledWith('/p/proj-1', { replace: true }),
        )
        expect(completeOAuthSignIn).toHaveBeenCalledWith('good-token')
    })

    it('shows error screen when OAuth completion fails', async () => {
        completeOAuthSignIn.mockResolvedValue({
            status: 'error',
            message: 'Не удалось завершить вход',
        })
        await renderWithHash('access_token=bad-token')

        expect(await screen.findByText('Не удалось войти')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Ко входу' }))
        expect(navigate).toHaveBeenCalledWith('/auth/signin', { replace: true })
    })
})
