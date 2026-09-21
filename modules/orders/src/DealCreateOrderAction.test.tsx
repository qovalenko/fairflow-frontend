import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import DealCreateOrderAction from './DealCreateOrderAction'

const navigateMock = vi.fn()
let canWrite = true

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'orders' && action === 'write' ? canWrite : false,
}))

const LocationProbe = () => {
    const { pathname, search } = useLocation()
    return <div data-testid="loc">{`${pathname}${search}`}</div>
}

const renderAction = (props: { dealId?: string; status?: string }) =>
    render(
        <MemoryRouter initialEntries={['/deals/d1']}>
            <Routes>
                <Route
                    path="/deals/:id"
                    element={
                        <>
                            <DealCreateOrderAction {...props} />
                            <LocationProbe />
                        </>
                    }
                />
                <Route path="/orders" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    )

describe('DealCreateOrderAction — slot deal.card.action', () => {
    beforeEach(() => {
        canWrite = true
        navigateMock.mockReset()
    })

    it('не рендерится без права orders:write', () => {
        canWrite = false
        renderAction({ dealId: 'd1', status: 'won' })
        expect(screen.queryByRole('button', { name: 'Создать продажу' })).not.toBeInTheDocument()
    })

    it('не рендерится для сделки не в статусе won', () => {
        renderAction({ dealId: 'd1', status: 'open' })
        expect(screen.queryByRole('button', { name: 'Создать продажу' })).not.toBeInTheDocument()
    })

    it('показывает кнопку для won-сделки и ведёт на список с dealId', async () => {
        const user = userEvent.setup()
        renderAction({ dealId: 'd1', status: 'won' })

        await user.click(screen.getByRole('button', { name: 'Создать продажу' }))
        expect(navigateMock).toHaveBeenCalledWith('/orders?dealId=d1')
    })

    it('без status (старый host) кнопка остаётся — обратная совместимость', () => {
        renderAction({ dealId: 'd1' })
        expect(screen.getByRole('button', { name: 'Создать продажу' })).toBeInTheDocument()
    })
})
