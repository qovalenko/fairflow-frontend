import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

vi.mock('@/auth', () => ({
    useAuth: () => ({ authenticated: true }),
}))
vi.mock('@/configs/app.config', () => ({
    default: { authenticatedEntryPath: '/' },
}))

import PublicRoute from './PublicRoute'

describe('PublicRoute (FR-AUTH-320)', () => {
    it('redirects authenticated user away from public auth pages', () => {
        render(
            <MemoryRouter initialEntries={['/auth/signin']}>
                <Routes>
                    <Route element={<PublicRoute />}>
                        <Route path="/auth/signin" element={<div>sign in</div>} />
                    </Route>
                    <Route path="/" element={<div>home</div>} />
                </Routes>
            </MemoryRouter>,
        )
        expect(screen.queryByText('sign in')).not.toBeInTheDocument()
        expect(screen.getByText('home')).toBeInTheDocument()
    })

    it('keeps authenticated user on project-invite accept page', () => {
        render(
            <MemoryRouter initialEntries={['/auth/project-invite/token-1']}>
                <Routes>
                    <Route element={<PublicRoute />}>
                        <Route
                            path="/auth/project-invite/:token"
                            element={<div>accept invite</div>}
                        />
                    </Route>
                    <Route path="/" element={<div>home</div>} />
                </Routes>
            </MemoryRouter>,
        )
        expect(screen.getByText('accept invite')).toBeInTheDocument()
    })
})
