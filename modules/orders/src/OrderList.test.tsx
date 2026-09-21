import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import OrderList from './OrderList'
import { apiGetOrders, apiGetOrderTypes, apiExportOrders } from '@/services/CrmService'

/**
 * Список продаж:
 *  - TODO-409: экспорт идёт на серверную ручку `/v1/orders/export` с текущими
 *    фильтрами (раньше CSV собирался из уже загруженной страницы таблицы);
 *  - TODO-416: 403 MODULE_DISABLED показывает «Раздел выключен», а не
 *    бессмысленное «Повторить».
 */
vi.mock('@/services/CrmService', () => ({
    apiGetOrders: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiExportOrders: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))
vi.mock('@/utils/hooks/useCompanyNames', () => ({
    default: () => ({ companyName: () => '' }),
}))
// Свой projectId на кейс: ключ SWR завязан на него, иначе кэш списка протекает
// между тестами и следующий кейс видит ответ предыдущего.
const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

const getOrdersMock = vi.mocked(apiGetOrders)
const getTypesMock = vi.mocked(apiGetOrderTypes)
const exportMock = vi.mocked(apiExportOrders)

/** 403 c кодом гварда — ровно тот конверт, что отдаёт AppErrorFilter. */
const moduleDisabled = () =>
    Object.assign(new Error('module orders disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const order = (id: string) => ({
    id,
    number: `SO-${id}`,
    typeId: 't1',
    typeName: 'Договор',
    stageId: 's1',
    stageName: 'Подготовка',
    status: 'ACTIVE',
    fields: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
})

const renderList = (route = '/orders') =>
    render(
        <MemoryRouter initialEntries={[route]}>
            <OrderList />
        </MemoryRouter>,
    )

describe('OrderList', () => {
    beforeEach(() => {
        getTypesMock.mockResolvedValue([{ id: 't1', name: 'Договор' }] as never)
        exportMock.mockResolvedValue({
            blob: new Blob(['number\n'], { type: 'text/csv' }),
            truncated: false,
            rowCount: 1,
            total: 1,
        })
        // jsdom не реализует object-URL — экспорт скачивает файл через него.
        URL.createObjectURL = vi.fn(() => 'blob:orders')
        URL.revokeObjectURL = vi.fn()
    })

    it('403 MODULE_DISABLED → «Раздел выключен» вместо «Повторить» (TODO-416)', async () => {
        getOrdersMock.mockRejectedValue(moduleDisabled())

        pidRef.value = 'p-disabled'
        renderList()

        expect(await screen.findByText('Раздел выключен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('обычная ошибка загрузки по-прежнему даёт ручной «Повторить»', async () => {
        getOrdersMock.mockRejectedValue(
            Object.assign(new Error('boom'), { response: { status: 500, data: {} } }),
        )

        pidRef.value = 'p-error'
        renderList()

        expect(await screen.findByText('Не удалось загрузить продажи')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
        expect(screen.queryByText('Раздел выключен')).not.toBeInTheDocument()
    })

    it('фильтр типа продажи приходит из URL: /orders?typeId= (drill из статистики, TODO-272)', async () => {
        // Пусто по срезу — так проверяется и ST-4 («отфильтровано»), а не ST-3.
        getOrdersMock.mockResolvedValue({ list: [], total: 0 } as never)

        pidRef.value = 'p-drill'
        renderList('/orders?typeId=t1')

        // Первый же запрос уходит с typeId — не «полный список под видом среза».
        await waitFor(() => expect(getOrdersMock).toHaveBeenCalled())
        expect(getOrdersMock.mock.calls[0][0]).toMatchObject({
            typeId: 't1',
            projectId: 'p-drill',
        })
        expect(getOrdersMock.mock.calls.every((c) => c[0].typeId === 't1')).toBe(true)
        // Фильтр виден пользователю как активный, а не «молча применён».
        expect(
            await screen.findByText('По заданным фильтрам ничего не найдено'),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })

    it('без typeId в URL список не фильтруется по типу', async () => {
        getOrdersMock.mockResolvedValue({ list: [order('o1')], total: 1 } as never)

        pidRef.value = 'p-nodrill'
        renderList()

        await waitFor(() => expect(getOrdersMock).toHaveBeenCalled())
        expect(getOrdersMock.mock.calls[0][0].typeId).toBeFalsy()
    })

    it('экспорт зовёт серверную ручку с текущими фильтрами, а не текущую страницу (TODO-409)', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order('o1')], total: 1 } as never)

        pidRef.value = 'p-export'
        renderList()

        // Фильтр таблицы обязан доехать до серверной выгрузки.
        await user.type(
            await screen.findByPlaceholderText('Поиск по номеру, контакту, компании...'),
            'акт',
        )

        // Меню экспорта — кнопка с иконкой загрузки в панели инструментов.
        await user.click(await screen.findByRole('button', { name: 'Экспорт продаж' }))
        await user.click(await screen.findByText(/По текущим фильтрам \(весь список/))

        await waitFor(() => expect(exportMock).toHaveBeenCalled())
        expect(exportMock.mock.calls[0][0]).toMatchObject({ format: 'csv', query: 'акт' })
        expect(URL.createObjectURL).toHaveBeenCalled()
    })

    /**
     * Ревью волны: сервер режет выгрузку по потолку (ORDERS_EXPORT_MAX_ROWS), а меню
     * обещало «весь список». Обрезанный файл, скачанный молча, — это деловое решение
     * по неполным данным, поэтому признак усечения обязан долетать до пользователя.
     */
    it('усечённая выгрузка предупреждает пользователя, а не скачивается молча', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order('o1')], total: 25000 } as never)
        exportMock.mockResolvedValue({
            blob: new Blob(['number\n'], { type: 'text/csv' }),
            truncated: true,
            rowCount: 10000,
            total: 25000,
        })

        pidRef.value = 'p-export-truncated'
        renderList()

        await user.click(await screen.findByRole('button', { name: 'Экспорт продаж' }))
        await user.click(await screen.findByText(/По текущим фильтрам \(весь список/))

        await waitFor(() => expect(exportMock).toHaveBeenCalled())
        expect(
            await screen.findByText(/первые 10000 строк из 25000/),
        ).toBeInTheDocument()
        // Файл всё равно отдаём — предупреждение, а не отказ.
        expect(URL.createObjectURL).toHaveBeenCalled()
    })

    it('в меню экспорта потолок выгрузки назван явно', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order('o1')], total: 1 } as never)

        pidRef.value = 'p-export-label'
        renderList()

        await user.click(await screen.findByRole('button', { name: 'Экспорт продаж' }))
        expect(
            await screen.findByText(/По текущим фильтрам \(весь список, до 10\s?000 строк\)/),
        ).toBeInTheDocument()
    })

    it('без проекта — «Проект не выбран»', async () => {
        pidRef.value = ''
        renderList()
        expect(await screen.findByText('Проект не выбран')).toBeInTheDocument()
        pidRef.value = 'p1'
    })

    it('пустой список — онбординг «Продаж пока нет»', async () => {
        getOrdersMock.mockResolvedValue({ list: [], total: 0 } as never)
        pidRef.value = 'p-empty'
        renderList()
        expect(await screen.findByText('Продаж пока нет')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать продажу' })).toBeInTheDocument()
    })

    it('с данными — строка таблицы со стадией продажи', async () => {
        getOrdersMock.mockResolvedValue({ list: [order('42')], total: 1 } as never)
        pidRef.value = 'p-data'
        renderList()
        expect(await screen.findByText('Подготовка')).toBeInTheDocument()
    })
})
