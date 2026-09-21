import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import DrillDownPanel, { type DrillContext } from './DrillDownPanel'
import { apiDrillReport } from '@/services/ReportsService'

const navigateMock = vi.hoisted(() => vi.fn())
const canReadTarget = vi.hoisted(() => ({ value: true }))

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('@/services/ReportsService', () => ({
    apiDrillReport: vi.fn(),
    formatRub: (v: number) => `${v} ₽`,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        canReadTarget.value && subject === 'deals' && action === 'read',
}))

const drillMock = vi.mocked(apiDrillReport)

const ctx: DrillContext = {
    reportId: 'r1',
    cell: { dimension: 'stage_id', value: 'won' },
    label: 'Won',
    target: 'deals',
    aggregate: 3,
    params: { period: 'month' },
}

const renderPanel = (
    open = true,
    context: DrillContext | null = ctx,
    onClose = vi.fn(),
) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter>
                <DrillDownPanel
                    open={open}
                    projectId="p1"
                    ctx={context}
                    onClose={onClose}
                />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('DrillDownPanel (SCR-REPORTS-DRILLDOWN)', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        canReadTarget.value = true
        drillMock.mockResolvedValue({
            items: [
                { id: 'd1', name: 'Сделка А', amount: 100_000, ownerId: 'u1' },
                { id: 'd2', name: 'Сделка Б', amount: 50_000, ownerId: 'u2' },
            ],
            total: 2,
        } as never)
    })

    it('ST-1: skeleton при загрузке', () => {
        drillMock.mockReturnValue(new Promise(() => {}))
        renderPanel()
        expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('ST-6: ошибка + «Повторить»', async () => {
        drillMock.mockRejectedValue(
            Object.assign(new Error('fail'), {
                response: { data: { error: { message: 'Drill упал' } } },
            }),
        )
        renderPanel()
        expect(await screen.findByText('Drill упал')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('ST-9: пустой drill после ненулевого агрегата', async () => {
        drillMock.mockResolvedValue({ items: [], total: 0 } as never)
        renderPanel()
        expect(
            await screen.findByText(/Записи не найдены — возможно, данные обновляются с задержкой/),
        ).toBeInTheDocument()
    })

    it('данные: таблица, счётчик и ST-28 lag при расхождении aggregate/total', async () => {
        drillMock.mockResolvedValue({
            items: [{ id: 'd1', name: 'Сделка А', amount: 100_000, ownerId: 'u1' }],
            total: 1,
        } as never)
        renderPanel(true, { ...ctx, aggregate: 5 })
        expect(await screen.findByText('Сделка А')).toBeInTheDocument()
        expect(screen.getByText(/данные обновляются с задержкой/)).toBeInTheDocument()
    })

    it('клик по записи → navigate на карточку и onClose', async () => {
        const user = userEvent.setup()
        const onClose = vi.fn()
        renderPanel(true, ctx, onClose)
        await user.click(await screen.findByRole('button', { name: 'Сделка А' }))
        expect(navigateMock).toHaveBeenCalledWith('/deals/d1')
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('«Открыть в разделе» ведёт в список цели', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(await screen.findByRole('button', { name: /Открыть в разделе/ }))
        expect(navigateMock).toHaveBeenCalledWith('/deals')
    })

    it('без права на цель имя записи не кликабельно', async () => {
        canReadTarget.value = false
        drillMock.mockResolvedValue({
            items: [{ id: 'd1', name: 'Сделка А', amount: 100_000, ownerId: 'u1' }],
            total: 1,
        } as never)
        renderPanel()
        expect(await screen.findByText('Сделка А')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сделка А' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Открыть в разделе/ })).not.toBeInTheDocument()
    })

    it('без projectId drill-запрос не уходит', () => {
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <DrillDownPanel open projectId={undefined} ctx={ctx} onClose={vi.fn()} />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(drillMock).not.toHaveBeenCalled()
    })

    it('сумма не число — в таблице прочерк', async () => {
        drillMock.mockResolvedValue({
            items: [{ id: 'd1', name: 'Без суммы', amount: null, ownerId: 'u1' }],
            total: 1,
        } as never)
        renderPanel()
        expect(await screen.findByText('Без суммы')).toBeInTheDocument()
        expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
})
