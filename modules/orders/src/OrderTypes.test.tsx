import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import OrderTypes from './OrderTypes'
import { apiGetOrderTypes } from '@/services/CrmService'

/**
 * TODO-417 (часть про кнопку-заглушку): на экране типов продаж «шестерёнка» была
 * `Button` с `onClick={() => {}}` — кликабельный элемент, который ничего не
 * делает (и «ведёт» на экран, где пользователь уже находится). Теперь это
 * индикатор текущего раздела, а не кнопка.
 */
vi.mock('@/services/CrmService', () => ({ apiGetOrderTypes: vi.fn() }))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))
const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

const getTypesMock = vi.mocked(apiGetOrderTypes)

const moduleDisabled = () =>
    Object.assign(new Error('module orders disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const renderTypes = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/orders/types']}>
                <OrderTypes />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderTypes — тулбар', () => {
    beforeEach(() => {
        vi.mocked(apiGetOrderTypes).mockResolvedValue([
            { id: 't1', name: 'Договор', stages: [] },
        ] as never)
    })

    it('«шестерёнка» текущего раздела — индикатор, а не кнопка-заглушка', async () => {
        render(
            <MemoryRouter initialEntries={['/orders/types']}>
                <OrderTypes />
            </MemoryRouter>,
        )

        const indicator = await screen.findByTitle('Типы продаж')
        expect(indicator).toHaveAttribute('aria-current', 'page')
        expect(indicator.tagName).toBe('SPAN')
        // Ни одной кнопки-заглушки с этим названием не осталось.
        expect(screen.queryByRole('button', { name: 'Типы продаж' })).not.toBeInTheDocument()
    })
})

describe('OrderTypes — состояния экрана', () => {
    beforeEach(() => {
        getTypesMock.mockReset()
        pidRef.value = 'p-types-base'
    })

    it('без проекта — «Проект не выбран»', async () => {
        pidRef.value = ''
        renderTypes()
        expect(await screen.findByText('Проект не выбран')).toBeInTheDocument()
    })

    it('403 MODULE_DISABLED — «Раздел выключен» без «Повторить»', async () => {
        pidRef.value = 'p-types-disabled'
        getTypesMock.mockRejectedValue(moduleDisabled())
        renderTypes()
        expect(await screen.findByText('Раздел выключен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('ошибка загрузки — сообщение и «Повторить»', async () => {
        pidRef.value = 'p-types-error'
        getTypesMock.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )
        renderTypes()
        expect(await screen.findByText('Не удалось загрузить типы продаж')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой каталог — онбординг «Типов продаж пока нет»', async () => {
        pidRef.value = 'p-types-empty'
        getTypesMock.mockResolvedValue([] as never)
        renderTypes()
        expect(await screen.findByText('Типов продаж пока нет')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать тип продажи' })).toBeInTheDocument()
    })

    it('с данными — карточка типа и кнопка «Редактировать»', async () => {
        pidRef.value = 'p-types-data'
        getTypesMock.mockResolvedValue([
            {
                id: 't1',
                name: 'Договор',
                stages: [{ id: 's1', name: 'Новая', order: 0 }],
                fields: [{ key: 'f1' }],
                activeOrders: 3,
                webhookEnabled: true,
            },
        ] as never)
        renderTypes()
        expect(await screen.findByText('Договор')).toBeInTheDocument()
        expect(screen.getByText('3 активных продаж')).toBeInTheDocument()
        expect(screen.getByText('Webhook вкл')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
    })
})
