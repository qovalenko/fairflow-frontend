import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const fetchOidcProviders = vi.fn()
const startOidcProviderSignIn = vi.fn()
const startYandexOAuthSignIn = vi.fn()

vi.mock('@/services/OAuthServices', () => ({
    fetchOidcProviders: (...a: unknown[]) => fetchOidcProviders(...a),
    startOidcProviderSignIn: (...a: unknown[]) => startOidcProviderSignIn(...a),
    startYandexOAuthSignIn: (...a: unknown[]) => startYandexOAuthSignIn(...a),
}))

import SsoSignIn from './SsoSignIn'

describe('SsoSignIn (SCR-AUTH-SSO)', () => {
    beforeEach(() => {
        fetchOidcProviders.mockReset()
        startOidcProviderSignIn.mockReset()
        startYandexOAuthSignIn.mockReset()
        vi.stubEnv('VITE_SSO_YANDEX', '')
    })

    it('renders nothing when no SSO providers are available', async () => {
        fetchOidcProviders.mockResolvedValue([])
        const { container } = render(
            <MemoryRouter>
                <SsoSignIn />
            </MemoryRouter>,
        )

        await waitFor(() => expect(fetchOidcProviders).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('shows OIDC provider buttons when providers are loaded', async () => {
        fetchOidcProviders.mockResolvedValue([{ id: 'corp-oidc', name: 'Corp SSO' }])
        render(
            <MemoryRouter>
                <SsoSignIn />
            </MemoryRouter>,
        )

        expect(await screen.findByRole('button', { name: 'Войти через Corp SSO' })).toBeInTheDocument()
        expect(screen.getByText('или')).toBeInTheDocument()
    })

    it('starts OIDC sign-in redirect on provider click', async () => {
        fetchOidcProviders.mockResolvedValue([{ id: 'corp-oidc', name: 'Corp SSO' }])
        render(
            <MemoryRouter initialEntries={['/auth/signin?redirectUrl=%2Fdashboard']}>
                <SsoSignIn />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Войти через Corp SSO' }))
        expect(startOidcProviderSignIn).toHaveBeenCalledWith('corp-oidc', {
            redirectUrl: '/dashboard',
        })
    })

    it('shows Yandex button when feature flag is enabled', async () => {
        vi.stubEnv('VITE_SSO_YANDEX', 'true')
        fetchOidcProviders.mockResolvedValue([])
        render(
            <MemoryRouter>
                <SsoSignIn />
            </MemoryRouter>,
        )

        expect(await screen.findByRole('button', { name: 'Войти через Яндекс' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Войти через Яндекс' }))
        expect(startYandexOAuthSignIn).toHaveBeenCalledWith({ redirectUrl: undefined })
    })
})
