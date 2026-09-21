/**
 * Standalone dev bootstrap (vite-entry-app.tsx).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const renderRoot = vi.fn()

vi.mock('react-dom/client', () => ({
    default: {
        createRoot: () => ({
            render: (node: React.ReactNode) => renderRoot(node),
        }),
    },
}))

vi.mock('@/index.css', () => ({}))

vi.mock('@/components/template/StandaloneModuleApp', () => ({
    default: ({
        moduleTitle,
        modulePath,
        ModuleComponent,
    }: {
        moduleTitle: string
        modulePath: string
        ModuleComponent: React.ComponentType
    }) => (
        <div>
            <h1>{moduleTitle}</h1>
            <p>{modulePath}</p>
            <ModuleComponent />
        </div>
    ),
}))

vi.mock('./StatisticsModule', () => ({
    default: () => <div>Экран statistics</div>,
}))

describe('vite-entry-app — standalone bootstrap', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"></div>'
        renderRoot.mockClear()
    })

    afterEach(() => {
        vi.resetModules()
    })

    it('монтирует StatisticsModule через StandaloneModuleApp', async () => {
        await import('./vite-entry-app')

        expect(renderRoot).toHaveBeenCalledTimes(1)
        render(renderRoot.mock.calls[0][0] as React.ReactElement)

        expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument()
        expect(screen.getByText('/statistics')).toBeInTheDocument()
        expect(screen.getByText('Экран statistics')).toBeInTheDocument()
    })
})
