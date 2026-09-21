import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import type { Product, OrderType } from '@/@types/crm'

const apiGetProduct = vi.fn()
const apiUpdateProduct = vi.fn()
const apiGetProductCategories = vi.fn()
const apiGetOrderTypes = vi.fn()
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
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({
        departmentName: (id?: string | null) => (id ? `Отдел ${id}` : undefined),
    }),
}))
vi.mock('./productsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetProduct: (...a: unknown[]) => apiGetProduct(...a),
    apiUpdateProduct: (...a: unknown[]) => apiUpdateProduct(...a),
    apiGetProductCategories: (...a: unknown[]) => apiGetProductCategories(...a),
    apiGetOrderTypes: (...a: unknown[]) => apiGetOrderTypes(...a),
}))

import ProductEdit from './ProductEdit'

const baseProduct = (over: Partial<Product> = {}): Product => ({
    id: 'prod-1',
    name: 'Тариф',
    description: 'Описание',
    category: 'CRM',
    price: 5000,
    unit: 'MONTHLY',
    orderTypeId: 'ot-1',
    orderTypeName: 'Подписка',
    orderTypeDangling: false,
    ownerDepartmentId: 'dep-1',
    prefill: { region: 'RU' },
    dealsCount: 0,
    ordersCount: 0,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...over,
})

const orderTypes: OrderType[] = [{ id: 'ot-1', name: 'Подписка' } as OrderType]

const renderEdit = (id = 'prod-1') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[`/products/${id}/edit`]}>
                <Routes>
                    <Route path="/products/:id/edit" element={<ProductEdit />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ProductEdit', () => {
    beforeEach(() => {
        permissions = new Set(['products:write'])
        pidRef.value = 'p1'
        apiGetProduct.mockResolvedValue(baseProduct())
        apiGetProductCategories.mockResolvedValue(['CRM'])
        apiGetOrderTypes.mockResolvedValue(orderTypes)
        apiUpdateProduct.mockResolvedValue(baseProduct({ name: 'Тариф Pro' }))
        navigateMock.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
    })

    it('без products:write рисует «Раздел недоступен»', async () => {
        permissions = new Set(['products:read'])

        renderEdit()

        expect(await screen.findByText('Раздел недоступен')).toBeInTheDocument()
        expect(screen.getByText(/нет прав на редактирование продукта/)).toBeInTheDocument()
        expect(apiGetProduct).not.toHaveBeenCalled()
    })

    it('ошибка загрузки — «Повторить»', async () => {
        apiGetProduct.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )

        renderEdit()

        expect(await screen.findByText('Не удалось загрузить продукт')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('гидратирует форму данными продукта', async () => {
        renderEdit()

        expect(await screen.findByDisplayValue('Тариф')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Описание')).toBeInTheDocument()
        expect(screen.getByDisplayValue('5000')).toBeInTheDocument()
        expect(screen.getByDisplayValue('region')).toBeInTheDocument()
    })

    it('сохранение отправляет payload и ведёт на карточку', async () => {
        renderEdit()
        await screen.findByDisplayValue('Тариф')

        fireEvent.change(screen.getByDisplayValue('Тариф'), { target: { value: 'Тариф Pro' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() =>
            expect(apiUpdateProduct).toHaveBeenCalledWith(
                'prod-1',
                expect.objectContaining({
                    name: 'Тариф Pro',
                    orderTypeId: 'ot-1',
                    orderTypeName: 'Подписка',
                }),
                { projectId: 'p1' },
            ),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Сохранено')
        expect(navigateMock).toHaveBeenCalledWith('/products/prod-1')
    })

    it('архивный продукт — read-only баннер и нет кнопки «Сохранить»', async () => {
        apiGetProduct.mockResolvedValue(baseProduct({ status: 'archived' }))

        renderEdit()

        expect(
            await screen.findByText(/Архивный продукт нельзя редактировать/),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })

    it('404 → «Продукт не найден»', async () => {
        apiGetProduct.mockResolvedValue(null)

        renderEdit('missing')

        expect(await screen.findByText('Продукт не найден')).toBeInTheDocument()
    })

    it('битый тип продажи показывает предупреждение в форме', async () => {
        apiGetProduct.mockResolvedValue(
            baseProduct({ orderTypeDangling: true, orderTypeId: 'missing' }),
        )

        renderEdit('prod-dangling')

        expect(
            await screen.findByText(/Текущий тип продажи битый — выберите действующий/),
        ).toBeInTheDocument()
    })

    it('403 MODULE_DISABLED → «Модуль «Продукты» выключен»', async () => {
        apiGetProduct.mockRejectedValue(
            Object.assign(new Error('module disabled'), {
                response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
            }),
        )

        renderEdit()

        expect(await screen.findByText('Модуль «Продукты» выключен')).toBeInTheDocument()
    })

    it('loading — спиннер до ответа API', () => {
        apiGetProduct.mockReturnValue(new Promise(() => {}))

        renderEdit()

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Редактирование продукта')).not.toBeInTheDocument()
    })

    it('тип продажи отсутствует в справочнике — предупреждение в форме', async () => {
        apiGetProduct.mockResolvedValue(baseProduct({ orderTypeId: 'ot-1' }))
        apiGetOrderTypes.mockResolvedValue([{ id: 'ot-2', name: 'Разовая' } as OrderType])

        renderEdit()
        await screen.findByDisplayValue('Тариф')

        expect(
            screen.getByText(/Выбранный тип продажи не найден в справочнике/),
        ).toBeInTheDocument()
    })

    it('справочник типов продаж недоступен — read-only предупреждение', async () => {
        apiGetOrderTypes.mockReturnValue(new Promise(() => {}))

        renderEdit()
        await screen.findByDisplayValue('Тариф')

        expect(
            screen.getByText(/Справочник типов продаж недоступен/),
        ).toBeInTheDocument()
    })

    it('добавление и удаление предзаполняемых полей попадает в payload сохранения', async () => {
        apiGetProduct.mockResolvedValue(baseProduct({ prefill: {} }))

        renderEdit()
        await screen.findByDisplayValue('Тариф')

        fireEvent.click(screen.getByRole('button', { name: 'Добавить поле' }))
        fireEvent.change(screen.getByPlaceholderText('Название поля'), {
            target: { value: 'region' },
        })
        fireEvent.change(screen.getByPlaceholderText('Значение'), {
            target: { value: 'RU' },
        })

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() =>
            expect(apiUpdateProduct).toHaveBeenCalledWith(
                'prod-1',
                expect.objectContaining({ prefill: { region: 'RU' } }),
                { projectId: 'p1' },
            ),
        )

        fireEvent.click(screen.getByTitle('Удалить'))
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() =>
            expect(apiUpdateProduct).toHaveBeenLastCalledWith(
                'prod-1',
                expect.objectContaining({ prefill: {} }),
                { projectId: 'p1' },
            ),
        )
    })
})
