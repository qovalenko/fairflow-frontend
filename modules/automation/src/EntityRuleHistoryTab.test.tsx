import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { ruleExecution } from './testFixtures'

const apiListProjectExecutions = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'

vi.mock('react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListProjectExecutions: (...a: unknown[]) => apiListProjectExecutions(...a),
    EXECUTION_STATUS_LABEL: { success: 'Успешно' },
    EXECUTION_STATUS_COLOR: { success: 'bg-green-100' },
    SKIP_REASON_LABEL: {},
}))

import EntityRuleHistoryTab from './EntityRuleHistoryTab'

const render = (props = { dealId: 'deal-9' }) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <EntityRuleHistoryTab {...props} />
        </SWRConfig>,
    )

describe('EntityRuleHistoryTab', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set(['automation:read'])
        apiListProjectExecutions.mockReset()
        apiListProjectExecutions.mockResolvedValue({ list: [], total: 0 })
    })

    it('без read показывает сообщение о правах', () => {
        permissions = new Set()
        render()
        expect(screen.getByText('Нет права automation:read')).toBeInTheDocument()
    })

    it('пустая история', async () => {
        render()
        expect(await screen.findByText('История правил')).toBeInTheDocument()
        expect(
            screen.getByText('Правила по этой записи ещё не срабатывали'),
        ).toBeInTheDocument()
    })

    it('рендерит строки истории', async () => {
        apiListProjectExecutions.mockResolvedValue({
            list: [ruleExecution({ ruleId: 'rule-abc12345' })],
            total: 1,
        })
        render()
        expect(await screen.findByText(/Правило rule-abc/)).toBeInTheDocument()
    })
})
