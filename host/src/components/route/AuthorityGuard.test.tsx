import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import AuthorityGuard from './AuthorityGuard'

describe('AuthorityGuard', () => {
    it('renders children when user role matches required authority', () => {
        render(
            <MemoryRouter initialEntries={['/secret']}>
                <Routes>
                    <Route
                        path="/secret"
                        element={
                            <AuthorityGuard
                                userAuthority={['ADMIN', 'USER']}
                                authority={['ADMIN']}
                            >
                                <div>protected content</div>
                            </AuthorityGuard>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        )
        expect(screen.getByText('protected content')).toBeInTheDocument()
    })

    it('redirects to access-denied when role does not match', () => {
        render(
            <MemoryRouter initialEntries={['/secret']}>
                <Routes>
                    <Route
                        path="/secret"
                        element={
                            <AuthorityGuard
                                userAuthority={['USER']}
                                authority={['ADMIN']}
                            >
                                <div>protected content</div>
                            </AuthorityGuard>
                        }
                    />
                    <Route path="/access-denied" element={<div>denied</div>} />
                </Routes>
            </MemoryRouter>,
        )
        expect(screen.queryByText('protected content')).not.toBeInTheDocument()
        expect(screen.getByText('denied')).toBeInTheDocument()
    })

    it('allows access when authority list is empty (legacy ungated route)', () => {
        render(
            <MemoryRouter>
                <AuthorityGuard userAuthority={[]} authority={[]}>
                    <div>open route</div>
                </AuthorityGuard>
            </MemoryRouter>,
        )
        expect(screen.getByText('open route')).toBeInTheDocument()
    })
})
