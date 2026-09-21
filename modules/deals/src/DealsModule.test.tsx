import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}))
vi.mock('./Deals/DealList', () => ({ default: () => <div>DealList view</div> }))
vi.mock('./Deals/DealKanban', () => ({ default: () => <div>DealKanban view</div> }))
vi.mock('./Deals/DealDetails', () => ({ default: () => <div>DealDetails view</div> }))
vi.mock('./Deals/DealDashboard', () => ({ default: () => <div>DealDashboard view</div> }))
vi.mock('./Deals/DealTrash', () => ({ default: () => <div>DealTrash view</div> }))
vi.mock('./Pipelines/PipelineList', () => ({ default: () => <div>PipelineList view</div> }))
vi.mock('./Import/DealImport', () => ({ default: () => <div>DealImport view</div> }))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { defaultDealsView?: string } }) => unknown) =>
        sel({ user: {} }),
}))

import DealsModule from './DealsModule'

describe('DealsModule — маршрутизация', () => {
    it('рендерит список на /deals', () => {
        render(
            <MemoryRouter initialEntries={['/deals']}>
                <DealsModule />
            </MemoryRouter>,
        )
        expect(screen.getByText('DealList view')).toBeInTheDocument()
    })

    it('рендерит канбан на /deals/kanban', () => {
        render(
            <MemoryRouter initialEntries={['/deals/kanban']}>
                <DealsModule />
            </MemoryRouter>,
        )
        expect(screen.getByText('DealKanban view')).toBeInTheDocument()
    })

    it('рендерит дашборд на /deals/dashboard', () => {
        render(
            <MemoryRouter initialEntries={['/deals/dashboard']}>
                <DealsModule />
            </MemoryRouter>,
        )
        expect(screen.getByText('DealDashboard view')).toBeInTheDocument()
    })

    it('рендерит корзину на /deals/trash', () => {
        render(
            <MemoryRouter initialEntries={['/deals/trash']}>
                <DealsModule />
            </MemoryRouter>,
        )
        expect(screen.getByText('DealTrash view')).toBeInTheDocument()
    })

    it('рендерит воронки на /deals/pipelines', () => {
        render(
            <MemoryRouter initialEntries={['/deals/pipelines']}>
                <DealsModule />
            </MemoryRouter>,
        )
        expect(screen.getByText('PipelineList view')).toBeInTheDocument()
    })
})
