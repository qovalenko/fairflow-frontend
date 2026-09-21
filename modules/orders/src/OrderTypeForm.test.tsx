import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { SWRConfig } from 'swr'
import OrderTypeForm from './OrderTypeForm'
import { apiGetOrderType, apiUpdateOrderType } from '@/services/CrmService'
import { apiListTemplates } from '@/services/DocumentsService'

/**
 * TODO-411: конструктор типа продажи и поле-«Список».
 *
 * Цепочка со стороны сервера готова: proto `repeated string options = 5`,
 * BFF маппит в обе стороны (`fieldSpecFe` наружу, `options: Array.isArray(...)
 * ? ... : []` внутрь), домен валидирует значение продажи по набору
 * (`reason: 'option'`). Форма же не гидрировала и не отправляла `options` —
 * ЛЮБОЕ сохранение существующего типа затирало варианты пустым массивом.
 */
vi.mock('@/services/CrmService', () => ({
    apiGetOrderType: vi.fn(),
    apiCreateOrderType: vi.fn(),
    apiUpdateOrderType: vi.fn(),
    apiGetMembers: vi.fn(),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListConnections: vi.fn(),
}))
vi.mock('@/services/DocumentsService', () => ({
    apiListTemplates: vi.fn(),
}))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))

const getTypeMock = vi.mocked(apiGetOrderType)
const updateTypeMock = vi.mocked(apiUpdateOrderType)
const listTemplatesMock = vi.mocked(apiListTemplates)

type Field = { key: string; label: string; type: string; required: boolean; options?: string[] }

const typeDetail = (id: string, fields: Field[]) => ({
    id,
    name: 'Договор',
    currentVersion: 3,
    revision: {
        version: 3,
        fields,
        stages: [{ id: 's1', name: 'Подготовка', order: 0, requiredFieldKeys: [] }],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
})

const selectField: Field = {
    key: 'plan',
    label: 'Тариф',
    type: 'SELECT',
    required: true,
    options: ['Базовый', 'Премиум'],
}

/**
 * Каждый тест берёт СВОЙ id типа: ключ SWR завязан на него, иначе кэш формы
 * протекал бы между кейсами и следующий тест видел бы ревизию предыдущего.
 */
const renderForm = (id: string) =>
    render(
        <MemoryRouter initialEntries={[`/orders/types/${id}/edit`]}>
            <Routes>
                <Route path="/orders/types/:id/edit" element={<OrderTypeForm />} />
            </Routes>
        </MemoryRouter>,
    )

const savedFields = () =>
    (updateTypeMock.mock.calls[0][1] as { fields: Field[] }).fields

describe('OrderTypeForm — варианты поля-списка (TODO-411)', () => {
    beforeEach(() => {
        updateTypeMock.mockResolvedValue({} as never)
        listTemplatesMock.mockResolvedValue({ items: [] } as never)
    })

    it('гидрирует options из ревизии и НЕ затирает их при сохранении', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(typeDetail('t1', [selectField]) as never)

        renderForm('t1')

        // Варианты видны в редакторе.
        expect(await screen.findByText('Базовый')).toBeInTheDocument()
        expect(screen.getByText('Премиум')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        expect(savedFields()[0]).toMatchObject({
            key: 'plan',
            type: 'SELECT',
            options: ['Базовый', 'Премиум'],
        })
    })

    it('добавленный вариант уходит в payload, удалённый — исчезает', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(typeDetail('t2', [selectField]) as never)

        renderForm('t2')

        const draft = await screen.findByPlaceholderText('Новый вариант')
        await user.type(draft, 'Корпоративный')
        await user.click(screen.getByRole('button', { name: 'Добавить' }))
        await user.click(screen.getByTitle('Удалить вариант «Базовый»'))

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        expect(savedFields()[0].options).toEqual(['Премиум', 'Корпоративный'])
    })

    it('поле-список без вариантов не сохраняется (домен отверг бы любое значение)', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(typeDetail('t3', [{ ...selectField, options: [] }]) as never)

        renderForm('t3')

        await screen.findByText('Вариантов нет — добавьте хотя бы один.')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() =>
            expect(screen.getByText('У поля-списка укажите хотя бы один вариант')).toBeInTheDocument(),
        )
        expect(updateTypeMock).not.toHaveBeenCalled()
    })

    it('у поля НЕ-списка редактора вариантов нет, а в payload уходит пустой набор', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(
            typeDetail('t4', [
                { key: 'note', label: 'Примечание', type: 'TEXT', required: false },
            ]) as never,
        )

        renderForm('t4')

        await screen.findByDisplayValue('Примечание')
        expect(screen.queryByPlaceholderText('Новый вариант')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        expect(savedFields()[0]).toMatchObject({ key: 'note', type: 'TEXT', options: [] })
    })
})


/**
 * Шаблоны документов в конструкторе типа продажи.
 *
 * Было: `templateOptions` — литералы `t1..t4`, и выбранное уходило в ревизию
 * типа (`documentTemplates`) ссылками на несуществующие шаблоны (BFF кладёт их
 * в `document_templates_json` как есть). Стало: каталог тянется из documents
 * (GET /v1/document-templates, contextType=order, только опубликованные) тем же
 * правом `documents:read`, что проверяет сервер.
 */
const templatesTypeDetail = (id: string, templateIds: string[]) => ({
    id,
    name: 'Договор',
    currentVersion: 2,
    revision: {
        version: 2,
        fields: [{ key: 'note', label: 'Примечание', type: 'TEXT', required: false }],
        stages: [{ id: 's1', name: 'Подготовка', order: 0, requiredFieldKeys: [] }],
        documentTemplates: templateIds.map((t) => ({ id: t })),
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
})

const tpl = (id: string, name: string, orderTypeId: string | null = null) => ({
    id,
    name,
    contextType: 'order',
    orderTypeId,
    status: 'published',
    currentRevision: 1,
    draftRevision: null,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createdBy: 'u1',
    createdAt: 0,
    updatedAt: 0,
})

// Свежий кэш SWR на каждый рендер: ключ каталога шаблонов один и тот же во всех
// кейсах, иначе ответ первого теста переиспользовался бы следующими.
const renderTemplatesForm = (typeId: string) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[`/orders/types/${typeId}/edit`]}>
                <Routes>
                    <Route path="/orders/types/:id/edit" element={<OrderTypeForm />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

const templatesCard = () => screen.getByText('Шаблоны документов').parentElement as HTMLElement

const savedTemplates = () =>
    (updateTypeMock.mock.calls[0][1] as { documentTemplates: { id: string }[] }).documentTemplates

describe('OrderTypeForm — шаблоны документов берутся из модуля «Документы»', () => {
    beforeEach(() => {
        updateTypeMock.mockReset()
        listTemplatesMock.mockReset()
        updateTypeMock.mockResolvedValue({} as never)
    })

    it('каталог тянется из documents (contextType=order, published) и фикция t1..t4 исчезла', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(templatesTypeDetail('tt1', ['tpl-1']) as never)
        listTemplatesMock.mockResolvedValue({
            items: [
                tpl('tpl-1', 'Договор оказания услуг'),
                tpl('tpl-2', 'Акт чужого типа', 'other-type'),
                tpl('tpl-3', 'Счёт этого типа', 'tt1'),
            ],
        } as never)

        renderTemplatesForm('tt1')

        // Выбранный шаблон подписан именем из каталога, а не идентификатором.
        expect(await screen.findByText('Договор оказания услуг')).toBeInTheDocument()
        expect(listTemplatesMock).toHaveBeenCalledWith({
            projectId: 'p1',
            contextType: 'order',
            status: 'published',
        })
        // Захардкоженных вариантов больше нет.
        expect(screen.queryByText('Договор на обслуживание')).not.toBeInTheDocument()

        await user.click(within(templatesCard()).getByRole('combobox'))
        // Шаблон, привязанный к ЭТОМУ типу, предлагается; привязанный к другому — нет.
        expect(await screen.findByText('Счёт этого типа')).toBeInTheDocument()
        expect(screen.queryByText('Акт чужого типа')).not.toBeInTheDocument()
    })

    it('в ревизию уходит id выбранного реального шаблона', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(templatesTypeDetail('tt2', []) as never)
        listTemplatesMock.mockResolvedValue({
            items: [tpl('tpl-7', 'Коммерческое предложение')],
        } as never)

        renderTemplatesForm('tt2')

        await screen.findByText('Шаблоны документов')
        await user.click(within(templatesCard()).getByRole('combobox'))
        await user.click(await screen.findByText('Коммерческое предложение'))
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        expect(savedTemplates()).toEqual([{ id: 'tpl-7' }])
    })

    it('модуль «Документы» выключен — честное предупреждение, сохранённые шаблоны не затираются', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue(templatesTypeDetail('tt3', ['tpl-1']) as never)
        listTemplatesMock.mockRejectedValue({
            response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
        } as never)

        renderTemplatesForm('tt3')

        expect(
            await screen.findByText(/модуль «Документы» выключен в проекте/),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        // Каталог не доехал — но ссылки в типе остаются прежними, а не пустыми.
        expect(savedTemplates()).toEqual([{ id: 'tpl-1' }])
    })

    it('в проекте нет опубликованных шаблонов — пустой стейт со ссылкой в «Документы»', async () => {
        getTypeMock.mockResolvedValue(templatesTypeDetail('tt4', []) as never)
        listTemplatesMock.mockResolvedValue({ items: [] } as never)

        renderTemplatesForm('tt4')

        expect(
            await screen.findByText(/В проекте нет опубликованных шаблонов для продаж/),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Настроить шаблоны' })).toBeInTheDocument()
    })
})
