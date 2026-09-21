import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetDealDrift = vi.fn()
const apiAcceptDealDrift = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/services/CrmService', () => ({
    apiGetDealDrift: (...a: unknown[]) => apiGetDealDrift(...a),
    apiAcceptDealDrift: (...a: unknown[]) => apiAcceptDealDrift(...a),
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

import DriftPanel from './DriftPanel'

const deal: Deal = {
    id: 'd1',
    name: 'Сделка',
    amount: 0,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    createdAt: 0,
    updatedAt: 0,
}

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DriftPanel', () => {
    beforeEach(() => {
        apiGetDealDrift.mockReset()
        apiAcceptDealDrift.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
    })

    it('показывает загрузку, пока SWR не вернул drift', () => {
        apiGetDealDrift.mockReturnValue(new Promise(() => {}))

        render(
            <DriftPanel deal={deal} isOpen onClose={vi.fn()} onAccepted={vi.fn()} />,
        )

        expect(screen.getByText('Изменения привязанного контакта')).toBeInTheDocument()
        expect(screen.queryByText('Расхождений нет — снимок актуален.')).not.toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить изменения')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Принять изменения' })).not.toBeInTheDocument()
    })

    it('ошибка загрузки — сообщение и кнопка «Повторить»', async () => {
        apiGetDealDrift.mockRejectedValue(new Error('boom'))

        render(
            <DriftPanel deal={deal} isOpen onClose={vi.fn()} onAccepted={vi.fn()} />,
        )

        expect(await screen.findByText('Не удалось загрузить изменения')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой drift — снимок актуален, без кнопки принятия', async () => {
        apiGetDealDrift.mockResolvedValue({ drift: [], sourceDeleted: false })

        render(
            <DriftPanel deal={deal} isOpen onClose={vi.fn()} onAccepted={vi.fn()} />,
        )

        expect(await screen.findByText('Расхождений нет — снимок актуален.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Принять изменения' })).not.toBeInTheDocument()
    })

    it('показывает diff полей и принимает изменения', async () => {
        apiGetDealDrift.mockResolvedValue({
            drift: [
                {
                    field: 'phone',
                    snapshotValue: '+7 900 000-00-00',
                    currentValue: '+7 900 111-22-33',
                },
            ],
            sourceDeleted: false,
        })
        apiAcceptDealDrift.mockResolvedValue({ ...deal, driftFlag: false })
        const onAccepted = vi.fn()
        const onClose = vi.fn()

        render(
            <DriftPanel deal={deal} isOpen onClose={onClose} onAccepted={onAccepted} />,
        )

        expect(await screen.findByText('Телефон')).toBeInTheDocument()
        expect(screen.getByText('+7 900 000-00-00')).toBeInTheDocument()
        expect(screen.getByText('+7 900 111-22-33')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Принять изменения' }))

        await waitFor(() => expect(apiAcceptDealDrift).toHaveBeenCalledWith('d1'))
        expect(notifySuccess).toHaveBeenCalledWith('Изменения приняты, снимок обновлён')
        expect(onAccepted).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('удалённый источник — предупреждение без принятия', async () => {
        apiGetDealDrift.mockResolvedValue({ drift: [], sourceDeleted: true })

        render(
            <DriftPanel deal={deal} isOpen onClose={vi.fn()} onAccepted={vi.fn()} />,
        )

        expect(
            await screen.findByText(/Привязанный контакт\/компания удалён/),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Принять изменения' })).not.toBeInTheDocument()
    })
})
