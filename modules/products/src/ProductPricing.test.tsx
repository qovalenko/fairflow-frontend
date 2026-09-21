import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Product } from '@/@types/crm'

const apiGetProducts = vi.fn()
const apiUpdateProduct = vi.fn()
const navigateMock = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let permissions = new Set<string>()
const pidRef = vi.hoisted(() => ({ value: 'p1' }))

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('./productsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetProducts: (...a: unknown[]) => apiGetProducts(...a),
    apiUpdateProduct: (...a: unknown[]) => apiUpdateProduct(...a),
}))

import ProductPricing from './ProductPricing'

const product = (over: Partial<Product> = {}): Product => ({
    id: 'prod-1',
    name: 'CRM Pro',
    category: 'CRM',
    price: 10_000,
    unit: 'MONTHLY',
    orderTypeId: 'ot-1',
    orderTypeName: 'Подписка',
    dealsCount: 0,
    ordersCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...over,
})

const moduleDisabled = () =>
    Object.assign(new Error('module products disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const render = (ui: ReactElement) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/products/pricing']}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('ProductPricing', () => {
    beforeEach(() => {
        permissions = new Set(['products:read', 'products:write'])
        pidRef.value = 'p1'
        apiGetProducts.mockResolvedValue({ list: [product()], total: 1 })
        apiUpdateProduct.mockResolvedValue(product({ price: 12_000 }))
        navigateMock.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
    })

    it('403 MODULE_DISABLED → «Модуль «Продукты» выключен»', async () => {
        apiGetProducts.mockRejectedValue(moduleDisabled())

        render(<ProductPricing />)

        expect(await screen.findByText('Модуль «Продукты» выключен')).toBeInTheDocument()
    })

    it('без прав read/write — «Раздел недоступен»', async () => {
        permissions = new Set()

        render(<ProductPricing />)

        expect(await screen.findByText('Раздел недоступен')).toBeInTheDocument()
        expect(apiGetProducts).not.toHaveBeenCalled()
    })

    it('ошибка загрузки — «Повторить»', async () => {
        apiGetProducts.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )

        render(<ProductPricing />)

        expect(await screen.findByText('Не удалось загрузить прайс-лист')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой каталог — ST-3 с переходом к каталогу', async () => {
        apiGetProducts.mockResolvedValue({ list: [], total: 0 })

        render(<ProductPricing />)

        expect(await screen.findByText('Каталог пуст')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К каталогу' })).toBeInTheDocument()
    })

    it('рендерит таблицу цен и итог по странице', async () => {
        render(<ProductPricing />)

        expect(await screen.findByText('CRM Pro')).toBeInTheDocument()
        expect(screen.getAllByText(/10\s*000/).length).toBeGreaterThan(0)
        expect(screen.getByText('Всего продуктов: 1')).toBeInTheDocument()
    })

    it('read-only: без products:write нет кнопки сохранения', async () => {
        permissions = new Set(['products:read'])

        render(<ProductPricing />)

        await screen.findByText('CRM Pro')
        expect(screen.queryByRole('button', { name: /Сохранить изменения/ })).not.toBeInTheDocument()
    })

    it('inline-редактирование цены и сохранение вызывает apiUpdateProduct', async () => {
        render(<ProductPricing />)
        await screen.findByText('CRM Pro')

        fireEvent.click(screen.getAllByText(/10\s*000/)[0])
        const priceInput = screen.getByDisplayValue('10000')
        fireEvent.change(priceInput, { target: { value: '12000' } })
        fireEvent.blur(priceInput)

        const saveBtn = screen.getByRole('button', { name: /Сохранить изменения \(1\)/ })
        expect(saveBtn).toBeEnabled()
        fireEvent.click(saveBtn)

        await waitFor(() =>
            expect(apiUpdateProduct).toHaveBeenCalledWith(
                'prod-1',
                expect.objectContaining({ name: 'CRM Pro', price: 12000 }),
                { projectId: 'p1' },
            ),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Цены сохранены')
    })

    it('битая привязка типа продажи отображается в таблице', async () => {
        apiGetProducts.mockResolvedValue({
            list: [product({ orderTypeDangling: true, orderTypeName: undefined })],
            total: 1,
        })

        render(<ProductPricing />)

        expect(await screen.findByText('Битая привязка')).toBeInTheDocument()
    })

    it('loading — спиннер прайс-листа до ответа API', () => {
        apiGetProducts.mockReturnValue(new Promise(() => {}))

        render(<ProductPricing />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Каталог пуст')).not.toBeInTheDocument()
    })

    it('частичный сбой сохранения показывает ошибку и оставляет строки dirty', async () => {
        apiGetProducts.mockResolvedValue({
            list: [product({ id: 'p1', name: 'A' }), product({ id: 'p2', name: 'B', price: 2000 })],
            total: 2,
        })
        apiUpdateProduct.mockImplementation((id: string) =>
            id === 'p1' ? Promise.resolve(product()) : Promise.reject(new Error('fail')),
        )

        render(<ProductPricing />)
        await screen.findByText('A')

        fireEvent.click(screen.getAllByText(/10\s*000/)[0])
        fireEvent.change(screen.getByDisplayValue('10000'), { target: { value: '11000' } })
        fireEvent.blur(screen.getByDisplayValue('11000'))

        fireEvent.click(screen.getAllByText(/2\s*000/)[0])
        fireEvent.change(screen.getByDisplayValue('2000'), { target: { value: '2500' } })
        fireEvent.blur(screen.getByDisplayValue('2500'))

        fireEvent.click(screen.getByRole('button', { name: /Сохранить изменения \(2\)/ }))

        await waitFor(() =>
            expect(notifyError).toHaveBeenCalledWith(
                'Не удалось сохранить 1 из 2. Проверьте отмеченные строки.',
            ),
        )
    })

    it('inline-редактирование названия продукта сохраняется через bulk-save', async () => {
        render(<ProductPricing />)
        await screen.findByText('CRM Pro')

        fireEvent.click(screen.getByText('CRM Pro'))
        fireEvent.change(screen.getByDisplayValue('CRM Pro'), {
            target: { value: 'CRM Enterprise' },
        })
        fireEvent.blur(screen.getByDisplayValue('CRM Enterprise'))

        fireEvent.click(screen.getByRole('button', { name: /Сохранить изменения \(1\)/ }))

        await waitFor(() =>
            expect(apiUpdateProduct).toHaveBeenCalledWith(
                'prod-1',
                expect.objectContaining({ name: 'CRM Enterprise', price: 10_000 }),
                { projectId: 'p1' },
            ),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Цены сохранены')
    })

    it('пагинация прайс-листа при total > pageSize', async () => {
        apiGetProducts.mockResolvedValue({
            list: Array.from({ length: 50 }, (_, i) =>
                product({ id: `p-${i}`, name: `Prod ${i}`, price: 1000 + i }),
            ),
            total: 60,
        })

        render(<ProductPricing />)

        expect(await screen.findByText('1–50 из 60')).toBeInTheDocument()
        expect(screen.getByText(/сумма — по текущей странице/)).toBeInTheDocument()
    })
})
