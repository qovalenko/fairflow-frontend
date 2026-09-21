import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import EntityCreateDrawer from './EntityCreateDrawer'
import { useProjectStore } from '@/store/projectStore'
import {
    apiCreateOrder,
    apiGetProducts,
    apiGetProduct,
    apiGetOrderType,
    apiGetOrderTypes,
    apiGetDeals,
} from '@/services/CrmService'

/**
 * TODO-208: дровер создания продажи обязан отдавать `productId`.
 * Контракт со стороны сервера уже готов: BFF `createOrder` читает `body.productId`
 * → gRPC `product_id` и подставляет тип продажи из `product.order_type_id`.
 * Регрессия ловит класс «домен умеет, а до пользователя не доходит»: селектор
 * продукта в форме + поле в payload.
 */
vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: vi.fn(),
    apiGetContacts: vi.fn(),
    apiGetPipelines: vi.fn(),
    apiGetMembers: vi.fn(),
    apiGetDealSources: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiGetDeals: vi.fn(),
    apiGetOrders: vi.fn(),
    apiGetProducts: vi.fn(),
    apiGetProduct: vi.fn(),
    apiGetOrderType: vi.fn(),
    apiCreateContact: vi.fn(),
    apiCreateCompany: vi.fn(),
    apiCreateOrder: vi.fn(),
    apiFindContactDuplicates: vi.fn(),
    apiCreateActivity: vi.fn(),
}))

// Права: гейт селектора продукта зеркалит серверный (`products:read`).
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))

const createOrderMock = vi.mocked(apiCreateOrder)
const getProductsMock = vi.mocked(apiGetProducts)
const getProductMock = vi.mocked(apiGetProduct)
const getOrderTypesMock = vi.mocked(apiGetOrderTypes)
const getOrderTypeMock = vi.mocked(apiGetOrderType)
const getDealsMock = vi.mocked(apiGetDeals)

const renderDrawer = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter>
                <EntityCreateDrawer
                    isOpen
                    entityType="order"
                    orderInitialData={{ dealId: 'deal-1' }}
                    onClose={() => undefined}
                />
            </MemoryRouter>
        </SWRConfig>,
    )

/** Подпись поля формы (label), а не placeholder одноимённого react-select. */
const fieldLabel = (text: string) => screen.getByText(text, { selector: 'label' })

/** Выбор значения в react-select поля с подписью `label`. */
const pickOption = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    option: string,
) => {
    const input = fieldLabel(label).parentElement!.querySelector('input')!
    await user.click(input)
    const target = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[id*="option"]')).find(
            (el) => el.textContent === option,
        )
        if (!found) throw new Error(`option "${option}" not rendered`)
        return found
    })
    await user.click(target)
}

describe('EntityCreateDrawer — создание продажи (TODO-208)', () => {
    beforeEach(() => {
        // vitest.shared: restoreMocks=true снимает реализации после каждого теста —
        // проставляем их заново, чтобы порядок тестов ничего не решал.
        getProductsMock.mockResolvedValue({
            list: [{ id: 'prod-1', name: 'Тариф Базовый', orderTypeId: 'ot-from-product' }],
            total: 1,
        } as never)
        getOrderTypesMock.mockResolvedValue([{ id: 'ot-manual', name: 'Ручной тип' }] as never)
        getOrderTypeMock.mockResolvedValue({
            id: 'ot-from-product',
            name: 'Тип из продукта',
            revision: { fields: [{ key: 'inn', label: 'ИНН', type: 'text', required: false }] },
        } as never)
        getProductMock.mockResolvedValue({
            id: 'prod-1',
            name: 'Тариф Базовый',
            orderTypeId: 'ot-from-product',
            prefill: { inn: '7701' },
        } as never)
        getDealsMock.mockResolvedValue({
            list: [{ id: 'deal-1', name: 'Сделка №1' }],
            total: 1,
        } as never)
        createOrderMock.mockResolvedValue({ id: 'o1' } as never)
        useProjectStore.setState({
            currentProjectId: 'p1',
            currentProject: {
                id: 'p1',
                name: 'Проект',
                enabledModules: ['orders', 'products'],
            },
        })
    })

    it('тянет продукты проекта (project-scoped) и показывает селектор продукта', async () => {
        renderDrawer()

        await waitFor(() => expect(getProductsMock).toHaveBeenCalled())
        // Без projectId gateway отдаёт пустой каталог — проверяем явный scope.
        expect(getProductsMock.mock.calls[0][0]).toMatchObject({ projectId: 'p1' })
        expect(fieldLabel('Продукт')).toBeInTheDocument()
    })

    it('передаёт productId в apiCreateOrder и подставляет тип продажи продукта', async () => {
        const user = userEvent.setup()
        renderDrawer()

        await pickOption(user, 'Продукт', 'Тариф Базовый')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createOrderMock).toHaveBeenCalled())
        expect(createOrderMock.mock.calls[0][0]).toMatchObject({
            dealId: 'deal-1',
            productId: 'prod-1',
            // тип продажи подставлен из product.orderTypeId (как это делает BFF)
            orderTypeId: 'ot-from-product',
        })
    })

    it('блокирует создание, если у продукта битая привязка типа продажи (FR-PRODUCTS-150)', async () => {
        getProductsMock.mockResolvedValue({
            list: [
                {
                    id: 'prod-dangling',
                    name: 'Сломанный тариф',
                    orderTypeId: 'ot-old',
                    orderTypeDangling: true,
                },
            ],
            total: 1,
        } as never)
        const user = userEvent.setup()
        renderDrawer()

        await pickOption(user, 'Продукт', 'Сломанный тариф')
        await waitFor(() =>
            expect(
                screen.getByText(/битая или отсутствующая привязка типа продажи/i),
            ).toBeInTheDocument(),
        )
        // orderProductBlocksSale в canSubmit() — независимо от ручного выбора типа продажи.
        // Button (Ecme) стилизует disabled через cursor-not-allowed, без native disabled.
        const submit = screen.getByRole('button', { name: 'Создать' })
        expect(submit).toHaveClass('cursor-not-allowed')
        expect(
            screen.getByText(/битая или отсутствующая привязка типа продажи/i),
        ).toBeInTheDocument()
        await user.click(submit)
        expect(createOrderMock).not.toHaveBeenCalled()
    })

    it('FR-PRODUCTS-170: productId из initial открывает prefill и отправляет customFields', async () => {
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <EntityCreateDrawer
                        isOpen
                        entityType="order"
                        orderInitialData={{ productId: 'prod-1' }}
                        onClose={() => undefined}
                    />
                </MemoryRouter>
            </SWRConfig>,
        )

        await waitFor(() => expect(getProductMock).toHaveBeenCalledWith('prod-1', 'p1'))
        await waitFor(() =>
            expect(screen.getByDisplayValue('7701')).toBeInTheDocument(),
        )
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createOrderMock).toHaveBeenCalled())
        expect(createOrderMock.mock.calls[0][0]).toMatchObject({
            productId: 'prod-1',
            orderTypeId: 'ot-from-product',
            customFields: { inn: '7701' },
        })
    })

    it('без выбранного продукта productId не отправляется (undefined, не пустая строка)', async () => {
        const user = userEvent.setup()
        renderDrawer()

        await pickOption(user, 'Тип продажи *', 'Ручной тип')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createOrderMock).toHaveBeenCalled())
        const payload = createOrderMock.mock.calls[0][0] as Record<string, unknown>
        expect(payload.orderTypeId).toBe('ot-manual')
        expect(payload.productId).toBeUndefined()
    })

    it('модуль products выключен в проекте → селектора нет и каталог не запрашивается', async () => {
        useProjectStore.setState({
            currentProjectId: 'p1',
            currentProject: { id: 'p1', name: 'Проект', enabledModules: ['orders'] },
        })

        renderDrawer()

        expect(fieldLabel('Тип продажи *')).toBeInTheDocument()
        expect(screen.queryByText('Продукт', { selector: 'label' })).not.toBeInTheDocument()
        expect(getProductsMock).not.toHaveBeenCalled()
    })
})
