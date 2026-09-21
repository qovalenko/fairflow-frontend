import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetTrashedDeals = vi.fn()
const apiRestoreDeal = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetTrashedDeals: (...a: unknown[]) => apiGetTrashedDeals(...a),
    apiRestoreDeal: (...a: unknown[]) => apiRestoreDeal(...a),
}))
vi.mock('./dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))

import DealTrash from './DealTrash'

const trashedDeal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Удалённая сделка',
    amount: 50_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    companyName: 'ООО Ромашка',
    deletedAt: 1_700_000_000,
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealTrash', () => {
    beforeEach(() => {
        permissions = new Set(['deals:delete'])
        apiGetTrashedDeals.mockReset()
        apiRestoreDeal.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiGetTrashedDeals.mockResolvedValue({ list: [trashedDeal()], total: 1 })
        apiRestoreDeal.mockResolvedValue(trashedDeal({ deletedAt: undefined }))
    })

    it('без deals:delete показывает заглушку без запроса к API', () => {
        permissions = new Set(['deals:read'])
        render(<DealTrash />)
        expect(
            screen.getByText(/Доступ к корзине сделок есть только у пользователей с правом удаления/),
        ).toBeInTheDocument()
        expect(apiGetTrashedDeals).not.toHaveBeenCalled()
    })

    it('запрашивает корзину с projectId и показывает удалённые сделки', async () => {
        render(<DealTrash />)

        await waitFor(() =>
            expect(apiGetTrashedDeals).toHaveBeenCalledWith({
                projectId: 'p1',
                pageSize: 200,
            }),
        )
        expect(await screen.findByText('Удалённая сделка')).toBeInTheDocument()
        expect(screen.getByText(/ООО Ромашка/)).toBeInTheDocument()
    })

    it('пустая корзина — честное сообщение', async () => {
        apiGetTrashedDeals.mockResolvedValue({ list: [], total: 0 })
        render(<DealTrash />)

        expect(await screen.findByText('Корзина пуста.')).toBeInTheDocument()
    })

    it('восстановление вызывает apiRestoreDeal и обновляет список', async () => {
        render(<DealTrash />)
        await screen.findByText('Удалённая сделка')

        fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }))

        await waitFor(() => expect(apiRestoreDeal).toHaveBeenCalledWith('d1'))
        expect(notifySuccess).toHaveBeenCalledWith('Сделка восстановлена')
    })

    it('ошибка загрузки корзины — «Повторить»', async () => {
        apiGetTrashedDeals.mockRejectedValue(new Error('boom'))
        render(<DealTrash />)

        expect(await screen.findByText('Не удалось загрузить корзину')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })
})
