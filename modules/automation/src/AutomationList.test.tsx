import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import { automationRule } from './testFixtures'

const apiListRules = vi.fn()
const apiSetRuleEnabled = vi.fn()
const apiDeleteRule = vi.fn()
const apiManualRun = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'

vi.mock('react-router', () => ({
    useNavigate: () => navigateMock,
    Link: ({ children, to }: { children?: unknown; to?: string }) => (
        <a href={to}>{children as never}</a>
    ),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListRules: (...a: unknown[]) => apiListRules(...a),
    apiSetRuleEnabled: (...a: unknown[]) => apiSetRuleEnabled(...a),
    apiDeleteRule: (...a: unknown[]) => apiDeleteRule(...a),
    apiManualRun: (...a: unknown[]) => apiManualRun(...a),
    ruleStateView: (r: { enabled: boolean; state?: string }) => ({
        label: r.enabled ? 'Включено' : 'Выключено',
        color: r.enabled ? 'bg-green-100' : 'bg-gray-100',
    }),
    SKIP_REASON_LABEL: {},
}))

import AutomationList from './AutomationList'

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('AutomationList', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set([
            'automation:read',
            'automation:write',
            'automation:manage',
            'automation:execute',
        ])
        navigateMock.mockReset()
        apiListRules.mockReset()
        apiSetRuleEnabled.mockReset()
        apiDeleteRule.mockReset()
        apiManualRun.mockReset()
        apiListRules.mockResolvedValue({ list: [automationRule()], total: 1 })
    })

    it('без проекта показывает NoProjectState', () => {
        projectId = null
        render(<AutomationList />)
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('без automation:read показывает NoPermissionState', () => {
        permissions = new Set()
        render(<AutomationList />)
        expect(screen.getByText('Нет права automation:read.')).toBeInTheDocument()
    })

    it('при загрузке показывает скелетоны', () => {
        apiListRules.mockReturnValue(new Promise(() => {}))
        render(<AutomationList />)
        expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('при ошибке API показывает ErrorState с повтором', async () => {
        apiListRules.mockRejectedValueOnce({ response: { data: { error: { message: 'boom' } } } })
        render(<AutomationList />)
        expect(await screen.findByText('boom')).toBeInTheDocument()
        apiListRules.mockResolvedValueOnce({ list: [automationRule()], total: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(await screen.findByText('Уведомление о сделке')).toBeInTheDocument()
    })

    it('пустой список показывает onboarding и кнопку создания', async () => {
        apiListRules.mockResolvedValue({ list: [], total: 0 })
        render(<AutomationList />)
        expect(await screen.findByText('Автоматизируйте рутинные действия.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /Создать первое правило/i }))
        expect(navigateMock).toHaveBeenCalledWith('/automation/new')
    })

    it('рендерит правило и переключает enabled', async () => {
        apiSetRuleEnabled.mockResolvedValue({})
        render(<AutomationList />)
        expect(await screen.findByText('Уведомление о сделке')).toBeInTheDocument()
        expect(screen.getByText('1 включено')).toBeInTheDocument()
        const toggle = screen.getByRole('checkbox')
        await userEvent.click(toggle)
        await waitFor(() =>
            expect(apiSetRuleEnabled).toHaveBeenCalledWith('rule-1', false, {
                projectId: 'p1',
            }),
        )
    })

    it('фильтр по поиску с пустым результатом предлагает сброс', async () => {
        apiListRules.mockResolvedValueOnce({ list: [automationRule()], total: 1 })
        render(<AutomationList />)
        await screen.findByText('Уведомление о сделке')
        apiListRules.mockResolvedValue({ list: [], total: 0 })
        fireEvent.change(screen.getByPlaceholderText('Поиск по имени правила…'), {
            target: { value: 'missing' },
        })
        expect(await screen.findByText('Ничего не найдено.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        await waitFor(() =>
            expect(screen.getByPlaceholderText('Поиск по имени правила…')).toHaveValue(''),
        )
    })

    it('удаление правила открывает confirm и вызывает API', async () => {
        apiDeleteRule.mockResolvedValue({})
        render(<AutomationList />)
        await screen.findByText('Уведомление о сделке')
        await userEvent.click(screen.getByRole('button', { name: 'Удалить правило' }))
        expect(screen.getByText(/Правило «Уведомление о сделке» будет удалено/)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
        await waitFor(() =>
            expect(apiDeleteRule).toHaveBeenCalledWith('rule-1', { projectId: 'p1' }),
        )
    })

    it('ручной запуск требует entityId и вызывает apiManualRun', async () => {
        apiManualRun.mockResolvedValue({ status: 'executed' })
        render(<AutomationList />)
        await screen.findByText('Уведомление о сделке')
        await userEvent.click(screen.getByRole('button', { name: 'Запустить вручную' }))
        const runBtn = screen.getByRole('button', { name: 'Запустить' })
        await userEvent.click(runBtn)
        expect(apiManualRun).not.toHaveBeenCalled()
        await userEvent.type(screen.getByPlaceholderText('ID записи (например, deal_9)'), 'deal-9')
        await userEvent.click(runBtn)
        await waitFor(() =>
            expect(apiManualRun).toHaveBeenCalledWith(
                'rule-1',
                { entityId: 'deal-9' },
                { projectId: 'p1' },
            ),
        )
    })
})
