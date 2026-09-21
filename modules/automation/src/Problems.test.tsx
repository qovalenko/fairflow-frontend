import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { ruleExecution } from './testFixtures'

const apiListProjectExecutions = vi.fn()
const apiRetryDlq = vi.fn()
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
    apiRetryDlq: (...a: unknown[]) => apiRetryDlq(...a),
    EXECUTION_STATUS_LABEL: { dlq: 'DLQ', fail: 'Ошибка' },
    EXECUTION_STATUS_COLOR: { dlq: 'bg-red-100', fail: 'bg-red-100' },
}))

import Problems from './Problems'

const render = () =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}><Problems /></SWRConfig>)

describe('Problems', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set(['automation:read', 'automation:manage'])
        apiListProjectExecutions.mockReset()
        apiRetryDlq.mockReset()
        apiListProjectExecutions.mockResolvedValue({ list: [], total: 0 })
    })

    it('без read показывает NoPermissionState', () => {
        permissions = new Set()
        render()
        expect(screen.getByText('Нет права automation:read.')).toBeInTheDocument()
    })

    it('пустой журнал показывает успешное состояние', async () => {
        render()
        expect(await screen.findByText('Проблем за выбранный период нет.')).toBeInTheDocument()
    })

    it('повторяет DLQ-строку при manage', async () => {
        apiListProjectExecutions.mockResolvedValue({
            list: [
                ruleExecution({
                    status: 'dlq',
                    actionResults: [{ index: 0, type: 'send_webhook', status: 'fail', attempts: 1, dlqId: 'dlq-9' }],
                }),
            ],
            total: 1,
        })
        apiRetryDlq.mockResolvedValue({})
        render()
        await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        await waitFor(() =>
            expect(apiRetryDlq).toHaveBeenCalledWith('dlq-9', { projectId: 'p1' }),
        )
    })
})
