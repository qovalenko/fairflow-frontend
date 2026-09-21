import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RouteChunkErrorBoundary from './RouteChunkErrorBoundary'

function BrokenRoute(): never {
    throw new TypeError(
        'Failed to fetch dynamically imported module: http://example/assets/chunk.js',
    )
}

describe('RouteChunkErrorBoundary', () => {
    beforeEach(() => {
        sessionStorage.clear()
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('shows reload fallback for chunk load errors after auto-reload was attempted', () => {
        sessionStorage.setItem('ff.routeChunkAutoReload', '1')

        render(
            <RouteChunkErrorBoundary routeKey="signIn">
                <BrokenRoute />
            </RouteChunkErrorBoundary>,
        )

        expect(screen.getByText(/Страница устарела/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Обновить страницу/i })).toBeInTheDocument()
    })
})
