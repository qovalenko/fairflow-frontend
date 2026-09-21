import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const renderRoot = vi.fn()

vi.mock('react-dom/client', () => ({
    default: {
        createRoot: () => ({ render: renderRoot }),
    },
}))

vi.mock('@/components/template/StandaloneModuleApp', () => ({
    default: ({
        moduleTitle,
        modulePath,
        ModuleComponent,
    }: {
        moduleTitle: string
        modulePath: string
        ModuleComponent: () => ReactNode
    }) => (
        <div data-testid="standalone-app">
            <h1>{moduleTitle}</h1>
            <span>{modulePath}</span>
            <ModuleComponent />
        </div>
    ),
}))

vi.mock('./AutomationModule', () => ({
    default: () => <div>AutomationModule</div>,
}))

describe('vite-entry-app — standalone mount', () => {
    beforeEach(() => {
        renderRoot.mockClear()
        document.body.innerHTML = '<div id="root"></div>'
        vi.resetModules()
    })

    it('монтирует AutomationModule через StandaloneModuleApp', async () => {
        await import('./vite-entry-app')

        expect(renderRoot).toHaveBeenCalledOnce()
        const tree = renderRoot.mock.calls[0][0]
        render(tree)

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Automation' })).toBeInTheDocument()
        })
        expect(screen.getByText('/automation')).toBeInTheDocument()
        expect(screen.getByText('AutomationModule')).toBeInTheDocument()
    })
})
