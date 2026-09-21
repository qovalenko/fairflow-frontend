import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter, Route, Routes } from 'react-router'
import { automationRule } from './testFixtures'

const apiGetRule = vi.fn()
const apiCreateRule = vi.fn()
const apiUpdateRule = vi.fn()
const apiGetRegistry = vi.fn()
const apiListConnections = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'
let routeId: string | undefined

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useParams: () => ({ id: routeId }),
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('./RuleLog', () => ({ default: () => <div>RuleLog</div> }))
vi.mock('./DryRunOverlay', () => ({
    default: ({
        isOpen,
        onClose,
    }: {
        isOpen: boolean
        onClose: () => void
    }) =>
        isOpen ? (
            <div>
                <span>DryRun overlay</span>
                <button type="button" onClick={onClose}>
                    Закрыть dry-run
                </button>
            </div>
        ) : null,
}))
vi.mock('@/services/AutomationService', () => ({
    apiGetRule: (...a: unknown[]) => apiGetRule(...a),
    apiCreateRule: (...a: unknown[]) => apiCreateRule(...a),
    apiUpdateRule: (...a: unknown[]) => apiUpdateRule(...a),
    apiGetRegistry: (...a: unknown[]) => apiGetRegistry(...a),
    apiListConnections: (...a: unknown[]) => apiListConnections(...a),
    ruleStateView: () => ({ label: 'Включено', color: 'bg-green-100' }),
}))

import AutomationForm from './AutomationForm'
import toast from '@/components/ui/toast'

const renderAt = (path: string) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/automation/new" element={<AutomationForm />} />
                    <Route path="/automation/:id/edit" element={<AutomationForm />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('AutomationForm', () => {
    beforeEach(() => {
        routeId = undefined
        projectId = 'p1'
        permissions = new Set([
            'automation:read',
            'automation:write',
            'automation:manage',
            'automation:execute',
        ])
        navigateMock.mockReset()
        apiGetRegistry.mockResolvedValue({
            triggers: [{ id: 'crm.deal.created', eventName: 'Сделка создана' }],
            actions: [{ id: 'create_activity', externalEffect: false }],
        })
        apiListConnections.mockResolvedValue({ list: [] })
        apiCreateRule.mockResolvedValue(automationRule())
        apiGetRule.mockResolvedValue(
            automationRule({
                name: 'Существующее',
                conditionsJson: JSON.stringify({ and: [] }),
                actionsJson: JSON.stringify([{ type: 'create_activity', config: {} }]),
            }),
        )
    })

    it('без write на создании показывает NoPermissionState', () => {
        permissions = new Set(['automation:read'])
        renderAt('/automation/new')
        expect(
            screen.getByText('Нет права automation:write для создания правила.'),
        ).toBeInTheDocument()
    })

    it('форма создания валидирует обязательные поля', async () => {
        renderAt('/automation/new')
        expect(screen.getByText('Новое правило автоматизации')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Создать и включить' }))
        expect(toast.push).toHaveBeenCalledWith('Укажите название правила')
    })

    it('сохраняет новое правило и уходит в список', async () => {
        renderAt('/automation/new')
        await userEvent.type(screen.getByPlaceholderText('Введите название'), 'Новое правило')
        await waitFor(() =>
            expect(screen.getByRole('option', { name: 'Сделка создана' })).toBeInTheDocument(),
        )
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Выберите событие' }),
            'crm.deal.created',
        )
        await userEvent.click(screen.getByRole('button', { name: 'Создать выключенным' }))
        await waitFor(() => expect(apiCreateRule).toHaveBeenCalled())
        expect(navigateMock).toHaveBeenCalledWith('/automation')
    }, 10000)

    it('при edit и 404 показывает NotFoundState', async () => {
        routeId = 'missing'
        apiGetRule.mockRejectedValueOnce({ response: { status: 404 } })
        renderAt('/automation/missing/edit')
        expect(
            await screen.findByText('Правило не найдено или удалено.'),
        ).toBeInTheDocument()
    })

    it('при edit загружает правило и показывает журнал', async () => {
        routeId = 'rule-1'
        renderAt('/automation/rule-1/edit')
        expect(await screen.findByText('Редактирование правила')).toBeInTheDocument()
        expect(screen.getByText('RuleLog')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Существующее')).toBeInTheDocument()
    })

    it('без проекта показывает NoProjectState', () => {
        projectId = null
        renderAt('/automation/new')
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('edit loading показывает скелетоны', async () => {
        routeId = 'rule-1'
        apiGetRule.mockImplementation(() => new Promise(() => {}))
        renderAt('/automation/rule-1/edit')
        expect(screen.queryByText('Редактирование правила')).not.toBeInTheDocument()
        expect(document.querySelectorAll('.skeleton')).toHaveLength(3)
    })

    it('edit ошибка загрузки показывает ErrorState', async () => {
        routeId = 'rule-1'
        apiGetRule.mockRejectedValueOnce(new Error('network'))
        renderAt('/automation/rule-1/edit')
        expect(
            await screen.findByText('Не удалось загрузить правило'),
        ).toBeInTheDocument()
    })

    it('сохраняет изменения существующего правила', async () => {
        routeId = 'rule-1'
        apiUpdateRule.mockResolvedValue(automationRule({ name: 'Обновлённое' }))
        renderAt('/automation/rule-1/edit')
        const nameInput = await screen.findByDisplayValue('Существующее')
        await userEvent.clear(nameInput)
        await userEvent.type(nameInput, 'Обновлённое')
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(apiUpdateRule).toHaveBeenCalled())
        expect(navigateMock).toHaveBeenCalledWith('/automation')
    })

    it('ошибка сохранения показывает toast', async () => {
        routeId = 'rule-1'
        apiUpdateRule.mockRejectedValueOnce(new Error('save failed'))
        renderAt('/automation/rule-1/edit')
        await screen.findByDisplayValue('Существующее')
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() =>
            expect(toast.push).toHaveBeenCalledWith('Не удалось сохранить правило'),
        )
    })

    it('добавляет и удаляет условие', async () => {
        renderAt('/automation/new')
        await userEvent.click(screen.getByRole('button', { name: 'Условие' }))
        const fieldInput = screen.getByPlaceholderText('поле')
        await userEvent.type(fieldInput, 'amount')
        expect(fieldInput).toHaveValue('amount')
        await userEvent.click(screen.getByRole('button', { name: 'Удалить условие' }))
        expect(screen.queryByPlaceholderText('поле')).not.toBeInTheDocument()
    })

    it('добавляет вложенную группу условий', async () => {
        renderAt('/automation/new')
        await userEvent.click(screen.getByRole('button', { name: 'Вложенная группа' }))
        expect(screen.getByText('Вложенная группа', { selector: 'span.text-xs' })).toBeInTheDocument()
        expect(screen.getAllByPlaceholderText('поле')).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: 'В группу' }))
        expect(screen.getAllByPlaceholderText('поле')).toHaveLength(2)
    })

    it('добавляет действие и настраивает create_activity', async () => {
        renderAt('/automation/new')
        await userEvent.click(screen.getByRole('button', { name: 'Добавить действие' }))
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Тип действия' }),
            'create_activity',
        )
        const titleInput = screen.getByPlaceholderText('Название задачи')
        await userEvent.type(titleInput, 'Позвонить клиенту')
        expect(titleInput).toHaveValue('Позвонить клиенту')
    })

    it('external действие без manage показывает предупреждение', async () => {
        routeId = 'rule-1'
        permissions = new Set(['automation:read', 'automation:write'])
        apiGetRegistry.mockResolvedValue({
            triggers: [{ id: 'crm.deal.created', eventName: 'Сделка создана' }],
            actions: [
                { id: 'create_activity', externalEffect: false },
                { id: 'send_webhook', externalEffect: true },
            ],
        })
        apiGetRule.mockResolvedValue(
            automationRule({
                actionsJson: JSON.stringify([{ type: 'send_webhook', config: {} }]),
            }),
        )
        renderAt('/automation/rule-1/edit')
        expect(
            await screen.findByText(/нужно право automation:manage/i),
        ).toBeInTheDocument()
    })

    it('send_webhook с manage показывает выбор connection', async () => {
        routeId = 'rule-1'
        apiListConnections.mockResolvedValue({
            list: [{ id: 'conn-1', name: 'Webhook CRM', projectId: 'p1' }],
        })
        apiGetRegistry.mockResolvedValue({
            triggers: [{ id: 'crm.deal.created', eventName: 'Сделка создана' }],
            actions: [
                { id: 'create_activity', externalEffect: false },
                { id: 'send_webhook', externalEffect: true },
            ],
        })
        apiGetRule.mockResolvedValue(
            automationRule({
                actionsJson: JSON.stringify([
                    { type: 'send_webhook', connectionId: 'conn-1', config: {} },
                ]),
            }),
        )
        renderAt('/automation/rule-1/edit')
        expect(
            await screen.findByRole('combobox', { name: 'Выберите connection' }),
        ).toHaveValue('conn-1')
    })

    it('показывает статистику правила в edit', async () => {
        routeId = 'rule-1'
        apiGetRule.mockResolvedValue(
            automationRule({
                stats: { executed30d: 7, matched30d: 12, lastError: 'timeout' },
            }),
        )
        renderAt('/automation/rule-1/edit')
        expect(await screen.findByText('Статистика')).toBeInTheDocument()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('12')).toBeInTheDocument()
        expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('frozen правило показывает баннер только чтения', async () => {
        routeId = 'rule-1'
        apiGetRule.mockResolvedValue(automationRule({ state: 'frozen' }))
        renderAt('/automation/rule-1/edit')
        expect(
            await screen.findByText(/доступно только для чтения/i),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })

    it('кнопка dry-run открывает overlay', async () => {
        routeId = 'rule-1'
        renderAt('/automation/rule-1/edit')
        await screen.findByDisplayValue('Существующее')
        await userEvent.click(screen.getByRole('button', { name: 'Тест (dry-run)' }))
        expect(screen.getByText('DryRun overlay')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Закрыть dry-run' }))
        expect(screen.queryByText('DryRun overlay')).not.toBeInTheDocument()
    })

    it('отмена с несохранёнными изменениями спрашивает подтверждение', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
        renderAt('/automation/new')
        await userEvent.type(screen.getByPlaceholderText('Введите название'), 'Черновик')
        await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
        expect(confirmSpy).toHaveBeenCalledWith(
            'Несохранённые изменения будут потеряны. Выйти?',
        )
        expect(navigateMock).not.toHaveBeenCalled()
        confirmSpy.mockRestore()
    })

    it('редактирует приоритет и ответственного за ошибки', async () => {
        routeId = 'rule-1'
        renderAt('/automation/rule-1/edit')
        const priorityInput = await screen.findByDisplayValue('100')
        await userEvent.clear(priorityInput)
        await userEvent.type(priorityInput, '50')
        const notifyInput = screen.getByPlaceholderText('ID пользователя (по умолчанию — автор)')
        await userEvent.type(notifyInput, 'user-42')
        expect(priorityInput).toHaveValue(50)
        expect(notifyInput).toHaveValue('user-42')
    })

    it('загружает условия из JSON правила', async () => {
        routeId = 'rule-1'
        apiGetRule.mockResolvedValue(
            automationRule({
                conditionsJson: JSON.stringify({
                    and: [{ field: 'amount', op: 'gt', value: '1000' }],
                }),
            }),
        )
        renderAt('/automation/rule-1/edit')
        expect(await screen.findByDisplayValue('amount')).toBeInTheDocument()
        expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
    })
})
