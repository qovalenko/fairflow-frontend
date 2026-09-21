import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const apiBulkUpdateDeals = vi.fn()
const apiBulkAcceptDealDrift = vi.fn()
const apiDeleteDeal = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let permissions = new Set<string>()

vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiBulkUpdateDeals: (...a: unknown[]) => apiBulkUpdateDeals(...a),
    apiBulkAcceptDealDrift: (...a: unknown[]) => apiBulkAcceptDealDrift(...a),
    apiDeleteDeal: (...a: unknown[]) => apiDeleteDeal(...a),
}))
vi.mock('./dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))

import BulkPanel from './BulkPanel'

const pickInLastSelect = async (label: string) => {
    const inputs = document.querySelectorAll('input.select__input')
    const input = inputs[inputs.length - 1] as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: label.slice(0, 2) } })
    await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[role="option"]')).find(
            (el) => el.textContent === label,
        )
        expect(found).toBeTruthy()
        fireEvent.click(found!)
    })
}

describe('BulkPanel', () => {
    beforeEach(() => {
        permissions = new Set([
            'deals:write',
            'deals:manage',
            'deals:delete',
            'deals.stage:move',
        ])
        apiBulkUpdateDeals.mockReset()
        apiBulkAcceptDealDrift.mockReset()
        apiDeleteDeal.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiBulkUpdateDeals.mockResolvedValue({ updated: ['d1', 'd2'], skipped: [] })
        apiBulkAcceptDealDrift.mockResolvedValue({ accepted: ['d1'], skipped: [] })
        apiDeleteDeal.mockResolvedValue(undefined)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('показывает счётчик выбранных и снимает выбор', () => {
        const onClear = vi.fn()
        render(
            <BulkPanel
                selectedIds={['d1', 'd2']}
                driftDealIds={[]}
                members={[{ id: 'u1', name: 'Пётр', email: 'p@example.com', role: 'manager' }]}
                stageOptions={[{ value: 's1', label: 'Новая' }]}
                onClear={onClear}
                onDone={vi.fn()}
            />,
        )

        expect(screen.getByText('Выбрано: 2')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Снять выбор' }))
        expect(onClear).toHaveBeenCalled()
    })

    it('массовое назначение шлёт assigneeId на сервер', async () => {
        const onDone = vi.fn()
        render(
            <BulkPanel
                selectedIds={['d1', 'd2']}
                driftDealIds={[]}
                members={[{ id: 'u1', name: 'Пётр Петров', email: 'p@example.com', role: 'manager' }]}
                stageOptions={[{ value: 's1', label: 'Новая' }]}
                onClear={vi.fn()}
                onDone={onDone}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Назначить' }))
        await pickInLastSelect('Пётр Петров')
        fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

        await waitFor(() =>
            expect(apiBulkUpdateDeals).toHaveBeenCalledWith({
                dealIds: ['d1', 'd2'],
                change: { assigneeId: 'u1' },
            }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Назначено: 2')
        expect(onDone).toHaveBeenCalled()
    })

    it('кнопка drift видна только при наличии driftDealIds и deals:write', async () => {
        permissions = new Set(['deals:write'])
        const onDone = vi.fn()

        render(
            <BulkPanel
                selectedIds={['d1']}
                driftDealIds={['d1']}
                members={[]}
                stageOptions={[]}
                onClear={vi.fn()}
                onDone={onDone}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Принять изменения (1)' }))

        await waitFor(() =>
            expect(apiBulkAcceptDealDrift).toHaveBeenCalledWith({ dealIds: ['d1'] }),
        )
        expect(onDone).toHaveBeenCalled()
    })

    it('без deals.stage:move не показывает перемещение стадии', () => {
        permissions = new Set(['deals:manage', 'deals:delete'])

        render(
            <BulkPanel
                selectedIds={['d1']}
                driftDealIds={[]}
                members={[]}
                stageOptions={[{ value: 's1', label: 'Новая' }]}
                onClear={vi.fn()}
                onDone={vi.fn()}
            />,
        )

        expect(screen.queryByRole('button', { name: 'Переместить стадию' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Назначить' })).toBeInTheDocument()
    })
})
