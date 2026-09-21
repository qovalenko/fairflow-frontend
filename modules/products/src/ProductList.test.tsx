import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactElement } from 'react'
import type { Product } from '@/@types/crm'

const apiGetProducts = vi.fn()
const apiGetProductCategories = vi.fn()
const apiCreateProduct = vi.fn()
const navigateMock = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let permissions = new Set<string>()
const pidRef = vi.hoisted(() => ({ value: 'p1' }))
const departmentsRef = vi.hoisted(() => ({
    options: [{ value: 'dep-1', label: 'Отдел продаж' }],
    unavailable: false,
}))

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
        options: departmentsRef.options,
        unavailable: departmentsRef.unavailable,
        departmentName: (id?: string | null) => (id === 'dep-1' ? 'Отдел продаж' : undefined),
    }),
}))
vi.mock('./productsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetProducts: (...a: unknown[]) => apiGetProducts(...a),
    apiGetProductCategories: (...a: unknown[]) => apiGetProductCategories(...a),
    apiCreateProduct: (...a: unknown[]) => apiCreateProduct(...a),
}))

import ProductList from './ProductList'

const product = (over: Partial<Product> = {}): Product => ({
    id: 'prod-1',
    name: 'CRM Pro',
    category: 'CRM',
    price: 15_000,
    unit: 'MONTHLY',
    orderTypeId: 'ot-1',
    orderTypeName: 'Подписка',
    orderTypeDangling: false,
    dealsCount: 3,
    ordersCount: 1,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...over,
})

const moduleDisabled = () =>
    Object.assign(new Error('module products disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const render = (ui: ReactElement) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/products']}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('ProductList', () => {
    beforeEach(() => {
        permissions = new Set(['products:read', 'products:write'])
        pidRef.value = 'p1'
        departmentsRef.options = [{ value: 'dep-1', label: 'Отдел продаж' }]
        departmentsRef.unavailable = false
        apiGetProducts.mockResolvedValue({ list: [product()], total: 1 })
        apiGetProductCategories.mockResolvedValue(['CRM', 'Поддержка'])
        apiCreateProduct.mockResolvedValue({ id: 'prod-new' })
        navigateMock.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        vi.useRealTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('без products:read рисует «Раздел недоступен» и не ходит в API', async () => {
        permissions = new Set(['products:write'])

        render(<ProductList />)

        expect(await screen.findByText('Раздел недоступен')).toBeInTheDocument()
        expect(screen.getByText(/нет прав на просмотр каталога продуктов/)).toBeInTheDocument()
        expect(apiGetProducts).not.toHaveBeenCalled()
    })

    it('403 MODULE_DISABLED → «Модуль «Продукты» выключен»', async () => {
        apiGetProducts.mockRejectedValue(moduleDisabled())
        pidRef.value = 'p-disabled'

        render(<ProductList />)

        expect(await screen.findByText('Модуль «Продукты» выключен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('loading — спиннер каталога до ответа API', () => {
        apiGetProducts.mockReturnValue(new Promise(() => {}))

        render(<ProductList />)

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Продуктов ещё нет')).not.toBeInTheDocument()
    })

    it('обычная ошибка загрузки показывает «Повторить»', async () => {
        apiGetProducts.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )
        pidRef.value = 'p-error'

        render(<ProductList />)

        expect(await screen.findByText('Не удалось загрузить каталог')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой каталог — ST-3 empty state', async () => {
        apiGetProducts.mockResolvedValue({ list: [], total: 0 })

        render(<ProductList />)

        expect(await screen.findByText('Продуктов ещё нет')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать продукт' })).toBeInTheDocument()
    })

    it('пустой архив — отдельный empty state', async () => {
        apiGetProducts.mockResolvedValue({ list: [], total: 0 })

        render(<ProductList />)
        await screen.findByText('Продуктов ещё нет')

        fireEvent.click(screen.getByText('Архив'))

        expect(await screen.findByText('В архиве нет продуктов')).toBeInTheDocument()
    })

    it('пустой результат фильтра — ST-4 empty-filter с «Сбросить фильтры»', async () => {
        apiGetProducts.mockResolvedValue({ list: [], total: 0 })

        render(<ProductList />)
        await screen.findByText('Продуктов ещё нет')

        fireEvent.change(screen.getByPlaceholderText('Поиск по названию...'), {
            target: { value: 'нет такого' },
        })

        await waitFor(
            () => expect(screen.getByText('Ничего не найдено')).toBeInTheDocument(),
            { timeout: 3000 },
        )
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })

    it('рендерит карточки продуктов с ценой и счётчиками', async () => {
        render(<ProductList />)

        expect(await screen.findByText('CRM Pro')).toBeInTheDocument()
        expect(screen.getByText('CRM')).toBeInTheDocument()
        expect(screen.getByText(/15\s*000/)).toBeInTheDocument()
        expect(screen.getByText('3 сделок')).toBeInTheDocument()
        expect(screen.getByText('1 продаж')).toBeInTheDocument()
    })

    it('показывает бейдж битой привязки на странице', async () => {
        apiGetProducts.mockResolvedValue({
            list: [product({ orderTypeDangling: true, orderTypeName: undefined })],
            total: 1,
        })

        render(<ProductList />)

        expect(await screen.findByText('Тип не назначен')).toBeInTheDocument()
        expect(screen.getByText(/1 с битой привязкой на странице/)).toBeInTheDocument()
    })

    it('создание продукта через drawer вызывает API и ведёт на карточку', async () => {
        render(<ProductList />)
        await screen.findByText('CRM Pro')

        fireEvent.click(screen.getByRole('button', { name: 'Продукт' }))
        expect(await screen.findByText('Создать продукт')).toBeInTheDocument()

        fireEvent.change(screen.getByPlaceholderText('Введите название продукта'), {
            target: { value: 'Новый тариф' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() =>
            expect(apiCreateProduct).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Новый тариф' }),
                { projectId: 'p1' },
            ),
        )
        expect(notifySuccess).toHaveBeenCalledWith('Продукт создан')
        expect(navigateMock).toHaveBeenCalledWith('/products/prod-new')
    })

    it('клик по карточке ведёт на страницу продукта', async () => {
        render(<ProductList />)

        fireEvent.click(await screen.findByText('CRM Pro'))
        expect(navigateMock).toHaveBeenCalledWith('/products/prod-1')
    })

    it('запрашивает каталог с projectId и серверными параметрами фильтра', async () => {
        render(<ProductList />)

        await waitFor(() => expect(apiGetProducts).toHaveBeenCalled())
        expect(apiGetProducts.mock.calls[0][0]).toMatchObject({
            projectId: 'p1',
            pageIndex: 0,
            pageSize: 24,
            status: 'active',
            sort: 'updatedAt',
        })
    })

    it('пагинация каталога при total > pageSize', async () => {
        apiGetProducts.mockResolvedValue({
            list: Array.from({ length: 24 }, (_, i) => product({ id: `p-${i}`, name: `Prod ${i}` })),
            total: 50,
        })

        render(<ProductList />)

        expect(await screen.findByText('1–24 из 50')).toBeInTheDocument()
    })

    it('создание продукта при недоступном справочнике отделов блокирует выбор отдела', async () => {
        departmentsRef.unavailable = true
        departmentsRef.options = []

        render(<ProductList />)
        await screen.findByText('CRM Pro')

        fireEvent.click(screen.getByRole('button', { name: 'Продукт' }))
        expect(await screen.findByText('Создать продукт')).toBeInTheDocument()
        expect(screen.getByText('Справочник отделов недоступен')).toBeInTheDocument()
    })
})
