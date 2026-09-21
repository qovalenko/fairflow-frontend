import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiCloseDeal = vi.fn()
const apiGetLostReasons = vi.fn()
const apiGetDealOrdersSummary = vi.fn()
const apiCancelOrder = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiCloseDeal: (...a: unknown[]) => apiCloseDeal(...a),
    apiGetLostReasons: (...a: unknown[]) => apiGetLostReasons(...a),
    apiGetDealOrdersSummary: (...a: unknown[]) => apiGetDealOrdersSummary(...a),
    apiCancelOrder: (...a: unknown[]) => apiCancelOrder(...a),
}))
vi.mock('./dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/components/ui/Dialog', () => ({
    default: ({ isOpen, children }: { isOpen?: boolean; children?: unknown }) =>
        isOpen ? <div role="dialog">{children as never}</div> : null,
}))

import CloseDealDialog from './CloseDealDialog'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Крупная сделка',
    amount: 100_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Переговоры',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('CloseDealDialog', () => {
    beforeEach(() => {
        apiCloseDeal.mockReset()
        apiGetLostReasons.mockReset()
        apiGetDealOrdersSummary.mockReset()
        apiCancelOrder.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiGetLostReasons.mockResolvedValue([])
        apiGetDealOrdersSummary.mockResolvedValue({ items: [] })
        apiCloseDeal.mockResolvedValue(deal({ status: 'won' }))
    })

    it('выигрыш: подтверждение закрывает сделку без справочника причин', async () => {
        const onClosed = vi.fn()
        const onClose = vi.fn()

        render(
            <CloseDealDialog
                result="won"
                deal={deal()}
                isOpen
                onClose={onClose}
                onClosed={onClosed}
            />,
        )

        expect(screen.getByText('Закрыть как выигранную')).toBeInTheDocument()
        expect(screen.getByText(/Крупная сделка/)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Подтвердить' }))

        await waitFor(() =>
            expect(apiCloseDeal).toHaveBeenCalledWith('d1', { result: 'won' }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Сделка выиграна')
        expect(onClosed).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('проигрыш: кнопка закрытия заблокирована, пока не выбрана обязательная причина', async () => {
        apiGetLostReasons.mockResolvedValue([{ id: 'lr1', name: 'Дорого' }])

        render(
            <CloseDealDialog
                result="lost"
                deal={deal()}
                isOpen
                onClose={vi.fn()}
                onClosed={vi.fn()}
            />,
        )

        await screen.findByText('Причина проигрыша')
        const closeBtn = screen.getByRole('button', { name: 'Закрыть' })
        expect(closeBtn.className).toMatch(/opacity-50/)
        expect(screen.getByText('Причина обязательна')).toBeInTheDocument()
    })

    it('проигрыш: при незавершённых продажах требует выбрать судьбу заказов', async () => {
        apiGetLostReasons.mockResolvedValue([])
        apiGetDealOrdersSummary.mockResolvedValue({
            items: [{ id: 'o1', number: 'SO-1', status: 'ACTIVE' }],
        })

        render(
            <CloseDealDialog
                result="lost"
                deal={deal()}
                isOpen
                onClose={vi.fn()}
                onClosed={vi.fn()}
            />,
        )

        await screen.findByText(/Незавершённые продажи: 1/)
        expect(screen.getByRole('button', { name: 'Закрыть' }).className).toMatch(/opacity-50/)

        fireEvent.click(screen.getByRole('button', { name: 'Оставить как есть' }))
        fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }))

        await waitFor(() =>
            expect(apiCloseDeal).toHaveBeenCalledWith('d1', { result: 'lost' }),
        )
        expect(apiCancelOrder).not.toHaveBeenCalled()
    })
})
