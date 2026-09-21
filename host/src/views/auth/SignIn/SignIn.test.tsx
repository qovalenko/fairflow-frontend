import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const fetchOidcProviders = vi.fn()

vi.mock('@/auth', () => ({
    useAuth: () => ({ signIn: vi.fn() }),
}))
vi.mock('./components/SsoSignIn', () => ({
    default: () => null,
}))
vi.mock('@/services/OAuthServices', () => ({
    fetchOidcProviders: (...a: unknown[]) => fetchOidcProviders(...a),
    startOidcProviderSignIn: vi.fn(),
    startYandexOAuthSignIn: vi.fn(),
}))

import { SignInBase } from './SignIn'

describe('SignIn (SCR-AUTH-SIGNIN)', () => {
    beforeEach(() => {
        fetchOidcProviders.mockResolvedValue([])
    })

    it('shows sign-in form and forgot-password link', () => {
        render(
            <MemoryRouter>
                <SignInBase />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'С возвращением!' })).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Эл. почта')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Забыли пароль?' })).toHaveAttribute(
            'href',
            '/auth/forgot-password',
        )
    })

    it('shows session-ended reason from query param', () => {
        render(
            <MemoryRouter initialEntries={['/auth/signin?reason=session_revoked']}>
                <SignInBase />
            </MemoryRouter>,
        )

        expect(
            screen.getByText('Сессия была завершена. Войдите снова.'),
        ).toBeInTheDocument()
    })

    it('shows bootstrap-already-initialized reason', () => {
        render(
            <MemoryRouter initialEntries={['/auth/signin?reason=already_initialized']}>
                <SignInBase />
            </MemoryRouter>,
        )

        expect(
            screen.getByText(
                'Система уже настроена. Войдите под своей учётной записью.',
            ),
        ).toBeInTheDocument()
    })

    it('does not show reason banner for unknown reason code', () => {
        render(
            <MemoryRouter initialEntries={['/auth/signin?reason=unknown_code']}>
                <SignInBase />
            </MemoryRouter>,
        )

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
})
