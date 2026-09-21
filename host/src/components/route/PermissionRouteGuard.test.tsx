import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

let projectionSource: 'loading' | 'ready' = 'ready'
let allowed = true

vi.mock('@/utils/hooks/usePermissionProjection', () => ({
    default: () => ({ source: projectionSource }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    useRequiresPermission: () => allowed,
}))

import PermissionRouteGuard from './PermissionRouteGuard'

describe('PermissionRouteGuard (FR-SHELL-3)', () => {
    beforeEach(() => {
        projectionSource = 'ready'
        allowed = true
    })

    const renderGuard = (requires?: string) =>
        render(
            <MemoryRouter initialEntries={['/target']}>
                <Routes>
                    <Route
                        path="/target"
                        element={
                            <PermissionRouteGuard requires={requires}>
                                <div>secured</div>
                            </PermissionRouteGuard>
                        }
                    />
                    <Route path="/access-denied" element={<div>denied</div>} />
                </Routes>
            </MemoryRouter>,
        )

    it('renders children when no requires gate is set', () => {
        renderGuard(undefined)
        expect(screen.getByText('secured')).toBeInTheDocument()
    })

    it('renders nothing while permission projection is loading', () => {
        projectionSource = 'loading'
        renderGuard('project:manage')
        expect(screen.queryByText('secured')).not.toBeInTheDocument()
        expect(screen.queryByText('denied')).not.toBeInTheDocument()
    })

    it('redirects to access-denied when permission is denied', () => {
        allowed = false
        renderGuard('project:manage')
        expect(screen.queryByText('secured')).not.toBeInTheDocument()
        expect(screen.getByText('denied')).toBeInTheDocument()
    })

    it('renders children when permission is granted', () => {
        allowed = true
        renderGuard('project:manage')
        expect(screen.getByText('secured')).toBeInTheDocument()
    })
})
