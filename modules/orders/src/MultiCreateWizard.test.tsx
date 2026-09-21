import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import MultiCreateWizard from './MultiCreateWizard'
import {
    apiCreateOrdersBatch,
    apiGetOrderTypes,
    apiGetProducts,
} from '@/services/CrmService'

const toastPush = vi.fn()

vi.mock('@/services/CrmService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/CrmService')>()
    return {
        ...actual,
        apiCreateOrdersBatch: vi.fn(),
        apiGetOrderTypes: vi.fn(),
        apiGetProducts: vi.fn(),
    }
})
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))

const getProductsMock = vi.mocked(apiGetProducts)
const getTypesMock = vi.mocked(apiGetOrderTypes)
const batchMock = vi.mocked(apiCreateOrdersBatch)

const products = {
    list: [
        { id: 'p1', name: 'РКО', orderTypeId: 't1', orderTypeDangling: false },
        { id: 'p2', name: 'Без типа', orderTypeId: '', orderTypeDangling: false },
        { id: 'p3', name: 'Сирота', orderTypeId: 't-old', orderTypeDangling: true },
    ],
    total: 3,
}

const types = [{ id: 't1', name: 'Договор' }]

const renderWizard = (over: Partial<Parameters<typeof MultiCreateWizard>[0]> = {}) => {
    const onClose = vi.fn()
    const onDone = vi.fn()
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MultiCreateWizard
                isOpen
                onClose={onClose}
                projectId="p1"
                context={{ dealId: 'd1', productId: 'p1' }}
                onDone={onDone}
                {...over}
            />
        </SWRConfig>,
    )
    return { onClose, onDone }
}

describe('MultiCreateWizard — пакетное создание из сделки', () => {
    beforeEach(() => {
        toastPush.mockReset()
        batchMock.mockReset()
        getProductsMock.mockResolvedValue(products as never)
        getTypesMock.mockResolvedValue(types as never)
        batchMock.mockResolvedValue({ created: [{ id: 'o1' }], errors: [] } as never)
    })

    it('показывает загрузку продуктов', () => {
        getProductsMock.mockReturnValue(new Promise(() => undefined))
        renderWizard()
        expect(screen.getByText('Загрузка продуктов…')).toBeInTheDocument()
    })

    it('подставляет тип из выбранного продукта', async () => {
        renderWizard()
        await waitFor(() =>
            expect(screen.getByText(/Тип продажи:\s*Договор/)).toBeInTheDocument(),
        )
        expect(screen.getByRole('button', { name: 'Создать все (1)' })).toBeEnabled()
    })

    it('блокирует строку без типа продажи у продукта', async () => {
        const user = userEvent.setup()
        renderWizard({ context: { dealId: 'd1' } })

        await screen.findByRole('button', { name: /Создать все/ })
        const inputs = document.querySelectorAll('input.select__input')
        await user.click(inputs[0])
        await user.click(await screen.findByText('Без типа'))

        expect(
            await screen.findByText(/Тип продажи:\s*У продукта не настроен тип продажи/),
        ).toBeInTheDocument()
        const submit = screen.getByRole('button', { name: /Создать все \(0\)/ })
        expect(submit.className).toMatch(/cursor-not-allowed|opacity-50/)
    })

    it('блокирует продукт с удалённым типом продажи', async () => {
        const user = userEvent.setup()
        renderWizard({ context: { dealId: 'd1' } })

        await screen.findByRole('button', { name: /Создать все/ })
        const inputs = document.querySelectorAll('input.select__input')
        await user.click(inputs[0])
        await user.click(await screen.findByText('Сирота'))

        expect(await screen.findByText(/Тип продажи:\s*Тип продажи удалён/)).toBeInTheDocument()
    })

    it('успешный submit вызывает batch и закрывает мастер', async () => {
        const user = userEvent.setup()
        const { onClose, onDone } = renderWizard()

        await user.click(await screen.findByRole('button', { name: 'Создать все (1)' }))

        await waitFor(() => expect(batchMock).toHaveBeenCalled())
        expect(batchMock.mock.calls[0][0]).toMatchObject({
            dealId: 'd1',
            items: [{ productId: 'p1', orderTypeId: 't1' }],
        })
        expect(toastPush).toHaveBeenCalledWith('Создано продаж: 1')
        expect(onDone).toHaveBeenCalledWith([{ id: 'o1' }])
        expect(onClose).toHaveBeenCalled()
    })

    it('ошибка API — toast с текстом, мастер остаётся открытым', async () => {
        const user = userEvent.setup()
        batchMock.mockRejectedValue({
            response: { data: { error: { message: 'Сделка закрыта' } } },
        })
        const { onClose } = renderWizard()

        await user.click(await screen.findByRole('button', { name: 'Создать все (1)' }))

        await waitFor(() => expect(toastPush).toHaveBeenCalledWith('Сделка закрыта'))
        expect(onClose).not.toHaveBeenCalled()
    })
})
