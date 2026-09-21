import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { automationRule } from '../testFixtures'

const apiListRules = vi.fn()
const apiSetRuleEnabled = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'

vi.mock('react-router', () => ({
    useNavigate: () => navigateMock,
    Link: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListRules: (...a: unknown[]) => apiListRules(...a),
    apiSetRuleEnabled: (...a: unknown[]) => apiSetRuleEnabled(...a),
    ruleStateView: (r: { enabled: boolean }) => ({
        label: r.enabled ? 'Включено' : 'Выключено',
        color: 'bg-green-100',
    }),
}))

import AutomationV2List from './AutomationV2List'

const render = () =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}><AutomationV2List /></SWRConfig>)

describe('AutomationV2List', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set(['automation:read', 'automation:write', 'automation:manage'])
        apiListRules.mockReset()
        apiSetRuleEnabled.mockReset()
        apiListRules.mockResolvedValue({
            list: [automationRule({ engineVersion: 2, name: 'Граф v2' })],
            total: 1,
        })
    })

    it('без проекта показывает NoProjectState', () => {
        projectId = null
        render()
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('рендерит v2-сценарий и кнопку создания', async () => {
        render()
        expect(await screen.findByText('Автоматизация v2')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Граф v2' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Создать сценарий' }))
        expect(navigateMock).toHaveBeenCalledWith('/automation/v2/new')
    })

    it('переключает enabled через optimistic toggle', async () => {
        apiSetRuleEnabled.mockResolvedValue({})
        render()
        await screen.findByRole('heading', { name: 'Граф v2' })
        await userEvent.click(screen.getAllByRole('checkbox')[0])
        await waitFor(() =>
            expect(apiSetRuleEnabled).toHaveBeenCalledWith('rule-1', false, {
                projectId: 'p1',
            }),
        )
    })

    it('без read показывает NoPermissionState', () => {
        permissions = new Set(['automation:write'])
        render()
        expect(screen.getByText('Нет права automation:read.')).toBeInTheDocument()
    })

    it('пустой список предлагает создать сценарий', async () => {
        apiListRules.mockResolvedValue({ list: [], total: 0 })
        render()
        expect(
            await screen.findByText('Ещё нет сценариев автоматизации.'),
        ).toBeInTheDocument()
    })

    it('ошибка загрузки показывает ErrorState', async () => {
        apiListRules.mockRejectedValue(new Error('network'))
        render()
        expect(
            await screen.findByText('Не удалось загрузить сценарии'),
        ).toBeInTheDocument()
    })

    it('пустой результат фильтра предлагает сброс', async () => {
        apiListRules.mockResolvedValue({ list: [], total: 0 })
        render()
        await screen.findByText('Ещё нет сценариев автоматизации.')
        await userEvent.type(
            screen.getByPlaceholderText('Поиск по имени сценария…'),
            'missing',
        )
        expect(await screen.findByText('Ничего не найдено.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        expect(screen.getByPlaceholderText('Поиск по имени сценария…')).toHaveValue('')
    })
})
