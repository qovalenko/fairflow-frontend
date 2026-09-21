import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import ProtectedRoute from './ProtectedRoute'

vi.mock('@/auth', () => ({
    useAuth: () => ({ authenticated: false }),
}))
vi.mock('@/configs/app.config', () => ({
    default: { unAuthenticatedEntryPath: '/auth/signin' },
}))
vi.mock('@/constants/app.constant', () => ({
    REDIRECT_URL_KEY: 'redirectUrl',
}))

function LoginCapture() {
    const loc = useLocation()
    return <div data-testid="login-search">{loc.search}</div>
}

describe('ProtectedRoute (TODO-521)', () => {
    it('preserves query and hash in redirect param', () => {
        render(
            <MemoryRouter initialEntries={['/deals?tab=open#section']}>
                <Routes>
                    <Route element={<ProtectedRoute />}>
                        <Route path="/deals" element={<div>deals</div>} />
                    </Route>
                    <Route path="/auth/signin" element={<LoginCapture />} />
                </Routes>
            </MemoryRouter>,
        )
        const search = screen.getByTestId('login-search').textContent ?? ''
        expect(search).toContain('redirectUrl=')
        expect(decodeURIComponent(search)).toContain('/deals?tab=open#section')
    })
})
