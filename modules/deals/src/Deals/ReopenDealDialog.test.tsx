import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Deal, Pipeline } from '@/@types/crm'

const apiReopenDeal = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiReopenDeal: (...a: unknown[]) => apiReopenDeal(...a),
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

import ReopenDealDialog from './ReopenDealDialog'

const pipeline: Pipeline = {
    id: 'pl1',
    name: 'Основная',
    isDefault: true,
    stages: [
        { id: 's1', name: 'Новая', color: '#3B82F6', order: 0, kind: 'active' },
        { id: 's2', name: 'Won', color: '#10B981', order: 1, kind: 'won' },
        { id: 's3', name: 'Lost', color: '#EF4444', order: 2, kind: 'lost' },
    ],
}

const deal: Deal = {
    id: 'd1',
    name: 'Проигранная',
    amount: 0,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's3',
    stageName: 'Lost',
    status: 'lost',
    createdAt: 0,
    updatedAt: 0,
}

/** Выбор опции в react-select последнего селекта на странице. */
const pickInLastSelect = async (label: string) => {
    const inputs = document.querySelectorAll('input.select__input')
    const input = inputs[inputs.length - 1] as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: label.slice(0, 3) } })
    await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[role="option"]')).find(
            (el) => el.textContent === label,
        )
        expect(found).toBeTruthy()
        fireEvent.click(found!)
    })
}

describe('ReopenDealDialog', () => {
    beforeEach(() => {
        apiReopenDeal.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiReopenDeal.mockResolvedValue({ ...deal, status: 'open', stageId: 's1' })
    })

    it('не даёт отправить форму без причины и активной стадии', () => {
        render(
            <ReopenDealDialog
                deal={deal}
                pipeline={pipeline}
                isOpen
                onClose={vi.fn()}
                onReopened={vi.fn()}
            />,
        )

        expect(screen.getByText('Переоткрыть сделку')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Переоткрыть' }).className).toMatch(/opacity-50/)
    })

    it('отправляет reason и targetStageId при подтверждении', async () => {
        const onReopened = vi.fn()
        const onClose = vi.fn()

        render(
            <ReopenDealDialog
                deal={deal}
                pipeline={pipeline}
                isOpen
                onClose={onClose}
                onReopened={onReopened}
            />,
        )

        fireEvent.change(screen.getByPlaceholderText('Почему сделка переоткрывается'), {
            target: { value: 'Клиент вернулся' },
        })
        await pickInLastSelect('Новая')
        fireEvent.click(screen.getByRole('button', { name: 'Переоткрыть' }))

        await waitFor(() =>
            expect(apiReopenDeal).toHaveBeenCalledWith('d1', {
                reason: 'Клиент вернулся',
                targetStageId: 's1',
            }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Сделка переоткрыта')
        expect(onReopened).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('ошибка API — toast с сообщением об ошибке', async () => {
        apiReopenDeal.mockRejectedValue({})

        render(
            <ReopenDealDialog
                deal={deal}
                pipeline={pipeline}
                isOpen
                onClose={vi.fn()}
                onReopened={vi.fn()}
            />,
        )

        fireEvent.change(screen.getByPlaceholderText('Почему сделка переоткрывается'), {
            target: { value: 'Ошибка менеджера' },
        })
        await pickInLastSelect('Новая')
        fireEvent.click(screen.getByRole('button', { name: 'Переоткрыть' }))

        await waitFor(() =>
            expect(notifyError).toHaveBeenCalledWith('Не удалось переоткрыть сделку'),
        )
    })
})
