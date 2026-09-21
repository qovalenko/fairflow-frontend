/**
 * StatisticsModule — вид-роутер области: dashboard vs analytics (FR-MSTAT-16).
 */
import { MemoryRouter, Routes, Route } from 'react-router'
import { render, screen, act } from '@testing-library/react'
import StatisticsModule from './StatisticsModule'

vi.mock('./Dashboard', () => ({
    default: () => <div data-testid="dashboard-view">Dashboard</div>,
}))
vi.mock('./Analytics', () => ({
    default: () => <div data-testid="analytics-view">Analytics</div>,
}))

const renderAt = async (path: string, routePath = '*') => {
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path={routePath} element={<StatisticsModule />} />
                </Routes>
            </MemoryRouter>,
        )
    })
}

describe('StatisticsModule — маршрутизация экранов', () => {
    it('host `/dashboard` → операционный дашборд', async () => {
        await renderAt('/dashboard', '/dashboard')
        expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
        expect(screen.queryByTestId('analytics-view')).not.toBeInTheDocument()
    })

    it('standalone `/p/:pid/dashboard` → дашборд', async () => {
        await renderAt('/p/p1/dashboard', '/p/:pid/dashboard')
        expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    })

    it('host `/statistics` → аналитика', async () => {
        await renderAt('/statistics', '/statistics')
        expect(screen.getByTestId('analytics-view')).toBeInTheDocument()
    })

    it('standalone `/p/:pid/statistics` → аналитика', async () => {
        await renderAt('/p/p1/statistics', '/p/:pid/statistics')
        expect(screen.getByTestId('analytics-view')).toBeInTheDocument()
    })

    it('неизвестный путь → аналитика по умолчанию', async () => {
        await renderAt('/unknown', '*')
        expect(screen.getByTestId('analytics-view')).toBeInTheDocument()
    })
})
