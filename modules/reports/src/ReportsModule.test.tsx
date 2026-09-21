import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ReportsModule from './ReportsModule'

vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./Reports', () => ({ default: () => <div>ЭКРАН: список отчётов</div> }))
vi.mock('./ReportBuilder', () => ({ default: () => <div>ЭКРАН: конструктор</div> }))

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ReportsModule />
        </MemoryRouter>,
    )

describe('ReportsModule — резолв маршрутов', () => {
    it('/reports → экран списка', () => {
        renderAt('/reports')
        expect(screen.getByText('ЭКРАН: список отчётов')).toBeInTheDocument()
    })

    it('/reports/builder → конструктор', () => {
        renderAt('/reports/builder')
        expect(screen.getByText('ЭКРАН: конструктор')).toBeInTheDocument()
    })

    it('legacy /p/:pid/reports не обслуживается (TODO-479)', () => {
        renderAt('/p/p1/reports')
        // fallback на Reports, но это не host-маршрут — проверяем, что не builder
        expect(screen.getByText('ЭКРАН: список отчётов')).toBeInTheDocument()
        expect(screen.queryByText('ЭКРАН: конструктор')).not.toBeInTheDocument()
    })
})
