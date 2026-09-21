import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { ruleExecution } from './testFixtures'

const apiListExecutions = vi.fn()
const apiRetryDlq = vi.fn()
const navigateMock = vi.fn()

vi.mock('react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('@/services/AutomationService', () => ({
    apiListExecutions: (...a: unknown[]) => apiListExecutions(...a),
    apiRetryDlq: (...a: unknown[]) => apiRetryDlq(...a),
    dispatchErrorSummary: () => undefined,
    EXECUTION_STATUS_LABEL: { success: 'Успешно', fail: 'Ошибка' },
    EXECUTION_STATUS_COLOR: { success: 'bg-green-100', fail: 'bg-red-100' },
    SKIP_REASON_LABEL: {},
}))

import RuleLog from './RuleLog'

const render = (canManage = true) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <RuleLog ruleId="rule-1" projectId="p1" canManage={canManage} />
        </SWRConfig>,
    )

describe('RuleLog', () => {
    beforeEach(() => {
        apiListExecutions.mockReset()
        apiRetryDlq.mockReset()
        apiListExecutions.mockResolvedValue({ list: [], total: 0 })
    })

    it('показывает пустой журнал', async () => {
        render()
        expect(await screen.findByText('Журнал выполнений')).toBeInTheDocument()
        expect(screen.getByText('Правило ещё не выполнялось.')).toBeInTheDocument()
    })

    it('при ошибке загрузки показывает ErrorState', async () => {
        apiListExecutions.mockRejectedValueOnce({ response: { data: { error: { message: 'fail' } } } })
        render()
        expect(await screen.findByText('fail')).toBeInTheDocument()
    })

    it('manage может повторить DLQ из журнала', async () => {
        apiListExecutions.mockResolvedValue({
            list: [
                ruleExecution({
                    status: 'fail',
                    actionResults: [{ index: 0, type: 'send_webhook', status: 'fail', attempts: 2, dlqId: 'dlq-1' }],
                }),
            ],
            total: 1,
        })
        apiRetryDlq.mockResolvedValue({})
        render(true)
        await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }))
        await waitFor(() =>
            expect(apiRetryDlq).toHaveBeenCalledWith('dlq-1', { projectId: 'p1' }),
        )
    })
})
