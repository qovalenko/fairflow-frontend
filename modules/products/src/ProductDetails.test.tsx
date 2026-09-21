import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import type { Product } from '@/@types/crm'

const apiGetProduct = vi.fn()
const apiGetProductUsage = vi.fn()
const apiArchiveProduct = vi.fn()
const apiRestoreProduct = vi.fn()
const apiDeleteProduct = vi.fn()
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
        departmentName: (id?: string | null) => (id ? `Отдел ${id}` : 'Без отдела'),
    }),
}))
vi.mock('./productsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetProduct: (...a: unknown[]) => apiGetProduct(...a),
    apiGetProductUsage: (...a: unknown[]) => apiGetProductUsage(...a),
    apiArchiveProduct: (...a: unknown[]) => apiArchiveProduct(...a),
    apiRestoreProduct: (...a: unknown[]) => apiRestoreProduct(...a),
    apiDeleteProduct: (...a: unknown[]) => apiDeleteProduct(...a),
}))

import ProductDetails from './ProductDetails'

const baseProduct = (over: Partial<Product> = {}): Product => ({
    id: 'prod-1',
    name: 'Тариф',
    price: 1000,
    unit: 'ONE_TIME',
    orderTypeId: 'ot-1',
    orderTypeName: 'Подписка',
    orderTypeDangling: false,
    dealsCount: 2,
    ordersCount: 1,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...over,
})

const moduleDisabled = () =>
    Object.assign(new Error('module products disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const renderDetails = (id = 'prod-1') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[`/products/${id}`]}>
                <Routes>
                    <Route path="/products/:id" element={<ProductDetails />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ProductDetails', () => {
    beforeEach(() => {
        permissions = new Set([
            'products:read',
            'products:write',
            'products:delete',
            'orders:write',
        ])
        pidRef.value = 'p1'
        apiGetProduct.mockResolvedValue(baseProduct())
        apiGetProductUsage.mockResolvedValue({ dealsCount: 2, ordersCount: 1 })
        apiArchiveProduct.mockResolvedValue({ affected: { deals: 2, orders: 1 } })
        apiRestoreProduct.mockResolvedValue(baseProduct({ status: 'active' }))
        apiDeleteProduct.mockResolvedValue(undefined)
        navigateMock.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
    })

    it('без products:read рисует «Раздел недоступен» и не ходит в API', async () => {
        permissions = new Set(['products:write'])

        renderDetails()

        expect(await screen.findByText('Раздел недоступен')).toBeInTheDocument()
        expect(apiGetProduct).not.toHaveBeenCalled()
    })

    it('403 MODULE_DISABLED → «Модуль «Продукты» выключен»', async () => {
        apiGetProduct.mockRejectedValue(moduleDisabled())

        renderDetails()

        expect(await screen.findByText('Модуль «Продукты» выключен')).toBeInTheDocument()
    })

    it('loading — спиннер до ответа API', () => {
        apiGetProduct.mockReturnValue(new Promise(() => {}))

        renderDetails()

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Тариф' })).not.toBeInTheDocument()
    })

    it('ошибка загрузки — «Повторить» и «К списку»', async () => {
        apiGetProduct.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )

        renderDetails()

        expect(await screen.findByText('Не удалось загрузить продукт')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К списку' })).toBeInTheDocument()
    })

    it('404 → «Продукт не найден»', async () => {
        apiGetProduct.mockResolvedValue(undefined)

        renderDetails('missing')

        expect(await screen.findByText('Продукт не найден')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Вернуться к списку' })).toBeInTheDocument()
    })

    it('рендерит карточку с ценой и статистикой', async () => {
        renderDetails()

        expect(await screen.findByRole('heading', { name: 'Тариф' })).toBeInTheDocument()
        expect(screen.getByText(/1\s*000/)).toBeInTheDocument()
        expect(screen.getByText('Сделок с продуктом')).toBeInTheDocument()
        expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('«Создать продажу» ведёт на /orders?productId=…', async () => {
        renderDetails()

        fireEvent.click(await screen.findByRole('button', { name: 'Создать продажу' }))
        expect(navigateMock).toHaveBeenCalledWith('/orders?productId=prod-1')
    })

    it('архивный продукт показывает баннер и кнопку «Восстановить»', async () => {
        apiGetProduct.mockResolvedValue(baseProduct({ status: 'archived' }))

        renderDetails()

        expect(await screen.findByText(/Продукт в архиве/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
    })

    it('битая привязка типа продажи — предупреждение и «Переназначить тип»', async () => {
        apiGetProduct.mockResolvedValue(
            baseProduct({ orderTypeDangling: true, orderTypeName: undefined, orderTypeId: '' }),
        )

        renderDetails()

        expect(
            await screen.findByText(/Тип продажи не назначен — продажи по этому продукту недоступны/),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Переназначить тип' })).toBeInTheDocument()
    })

    it('архивация открывает диалог с превью затронутых ссылок', async () => {
        renderDetails()
        await screen.findByRole('heading', { name: 'Тариф' })

        fireEvent.click(screen.getByRole('button', { name: 'В архив' }))

        expect(await screen.findByText('Архивировать продукт')).toBeInTheDocument()
        await waitFor(() =>
            expect(apiGetProductUsage).toHaveBeenCalledWith('prod-1', { projectId: 'p1' }),
        )

        const confirmButtons = screen.getAllByRole('button', { name: 'В архив' })
        fireEvent.click(confirmButtons[confirmButtons.length - 1])
        await waitFor(() =>
            expect(apiArchiveProduct).toHaveBeenCalledWith('prod-1', { projectId: 'p1' }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Продукт перемещён в архив')
        expect(navigateMock).toHaveBeenCalledWith('/products')
    })

    it('диалог архивации показывает загрузку превью затронутых ссылок', async () => {
        apiGetProductUsage.mockReturnValue(new Promise(() => {}))

        renderDetails()
        await screen.findByRole('heading', { name: 'Тариф' })

        fireEvent.click(screen.getByRole('button', { name: 'В архив' }))

        expect(await screen.findByText('Архивировать продукт')).toBeInTheDocument()
        expect(screen.getByText('Считаем, кого затронет архив…')).toBeInTheDocument()
    })

    it('диалог архивации показывает разбивку по отделам и пользователям', async () => {
        apiGetProductUsage.mockResolvedValue({
            dealsCount: 5,
            ordersCount: 3,
            byDepartment: [{ departmentId: 'dep-1', deals: 2, orders: 1 }],
            byUser: [{ userId: 'user-42', deals: 1, orders: 1 }],
        })

        renderDetails()
        await screen.findByRole('heading', { name: 'Тариф' })

        fireEvent.click(screen.getByRole('button', { name: 'В архив' }))

        expect(await screen.findByText('Затронуто: 5 сделок, 3 продаж.')).toBeInTheDocument()
        expect(screen.getByText(/Отдел dep-1: 2 сделок, 1 продаж/)).toBeInTheDocument()
        expect(screen.getByText(/user-42: 1 сделок, 1 продаж/)).toBeInTheDocument()
    })

    it('жёсткое удаление при связях предлагает архив (422 FAILED_PRECONDITION)', async () => {
        apiDeleteProduct.mockRejectedValue({
            response: {
                status: 422,
                data: { error: { code: 'FAILED_PRECONDITION', details: { deals: 2, orders: 1 } } },
            },
        })

        renderDetails()
        await screen.findByRole('heading', { name: 'Тариф' })

        fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
        const deleteButtons = screen.getAllByRole('button', { name: 'Удалить' })
        fireEvent.click(deleteButtons[deleteButtons.length - 1])

        expect(await screen.findByText('Архивировать продукт')).toBeInTheDocument()
        expect(notifyError).toHaveBeenCalledWith('Есть связанные сделки/продажи — архивируйте продукт')
    })

    it('восстановление из архива вызывает API и показывает успех', async () => {
        apiGetProduct.mockResolvedValue(baseProduct({ status: 'archived' }))

        renderDetails()
        await screen.findByText(/Продукт в архиве/)

        fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Восстановить' }).pop()!)

        await waitFor(() =>
            expect(apiRestoreProduct).toHaveBeenCalledWith('prod-1', { projectId: 'p1' }),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Продукт восстановлен')
    })
})
