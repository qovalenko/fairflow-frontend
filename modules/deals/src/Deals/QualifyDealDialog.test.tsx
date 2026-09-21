import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'
import { TRASH_DUPLICATE_HINT } from './qualifyDealDuplicates'

const apiFindContactDuplicates = vi.fn()
const apiFindCompanyDuplicates = vi.fn()
const apiQualifyDeal = vi.fn()
const apiRestoreContact = vi.fn()
const apiRestoreCompany = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let canReadCompanies = true

vi.mock('@/components/ui/Dialog', () => ({
    default: ({ isOpen, children }: { isOpen?: boolean; children?: unknown }) =>
        isOpen ? <div role="dialog">{children as never}</div> : null,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'companies' && action === 'read' ? canReadCompanies : true,
}))
vi.mock('@/services/CrmService', () => ({
    apiFindContactDuplicates: (...a: unknown[]) => apiFindContactDuplicates(...a),
    apiFindCompanyDuplicates: (...a: unknown[]) => apiFindCompanyDuplicates(...a),
    apiQualifyDeal: (...a: unknown[]) => apiQualifyDeal(...a),
    apiRestoreContact: (...a: unknown[]) => apiRestoreContact(...a),
    apiRestoreCompany: (...a: unknown[]) => apiRestoreCompany(...a),
}))
vi.mock('./dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))

import QualifyDealDialog from './QualifyDealDialog'

const deal: Deal = {
    id: 'd1',
    name: 'Лид',
    amount: 0,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    lightPhone: '+79001234567',
    lightEmail: 'lead@example.com',
    lightName: 'Иван',
    createdAt: 0,
    updatedAt: 0,
}

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('qualifyDealDuplicates', () => {
    it('использует каноническую формулировку для корзины', () => {
        expect(TRASH_DUPLICATE_HINT).toBe('Похожий в корзине. Восстановить?')
    })
})

describe('QualifyDealDialog', () => {
    beforeEach(() => {
        canReadCompanies = true
        apiFindContactDuplicates.mockReset()
        apiFindCompanyDuplicates.mockReset()
        apiQualifyDeal.mockReset()
        apiRestoreContact.mockReset()
        apiRestoreCompany.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiFindContactDuplicates.mockResolvedValue({ candidates: [] })
        apiFindCompanyDuplicates.mockResolvedValue({ candidates: [] })
        apiQualifyDeal.mockResolvedValue({ ...deal, contactName: 'Иван' })
    })

    it('показывает кандидатов дублей и привязывает существующий контакт', async () => {
        apiFindContactDuplicates.mockResolvedValue({
            candidates: [
                {
                    contactId: 'c1',
                    displayName: 'Иван Иванов',
                    matchedOn: 'phone',
                    maskedValue: '+7***4567',
                    deleted: false,
                },
            ],
        })
        const onQualified = vi.fn()
        const onClose = vi.fn()

        render(
            <QualifyDealDialog deal={deal} isOpen onClose={onClose} onQualified={onQualified} />,
        )

        expect(await screen.findByText(/Похожий контакт уже есть/)).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Привязать' }))

        await waitFor(() =>
            expect(apiQualifyDeal).toHaveBeenCalledWith('d1', {
                target: 'contact',
                contactId: 'c1',
            }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Контакт привязан к сделке')
        expect(onQualified).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('создание без идентификаторов — ошибка валидации', async () => {
        render(
            <QualifyDealDialog
                deal={{ ...deal, lightPhone: '', lightEmail: '', lightName: '' }}
                isOpen
                onClose={vi.fn()}
                onQualified={vi.fn()}
            />,
        )

        fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: 'Создать контакт' }))

        await waitFor(() =>
            expect(notifyError).toHaveBeenCalledWith('Укажите имя, телефон или email'),
        )
        expect(apiQualifyDeal).not.toHaveBeenCalled()
    })

    it('показывает подсказку TRASH_DUPLICATE_HINT для удалённого кандидата', async () => {
        apiFindContactDuplicates.mockResolvedValue({
            candidates: [
                {
                    contactId: 'c-trash',
                    displayName: 'Старый лид',
                    matchedOn: 'email',
                    maskedValue: 'l***@example.com',
                    deleted: true,
                },
            ],
        })

        render(
            <QualifyDealDialog deal={deal} isOpen onClose={vi.fn()} onQualified={vi.fn()} />,
        )

        expect(await screen.findByText(TRASH_DUPLICATE_HINT)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
    })
})
