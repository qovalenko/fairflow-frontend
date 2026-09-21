import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { dlqEntry } from './testFixtures'

const apiListDlq = vi.fn()
const apiRetryDlq = vi.fn()
const apiDismissDlq = vi.fn()
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
    apiListDlq: (...a: unknown[]) => apiListDlq(...a),
    apiRetryDlq: (...a: unknown[]) => apiRetryDlq(...a),
    apiDismissDlq: (...a: unknown[]) => apiDismissDlq(...a),
    DLQ_STATUS_LABEL: { failed: 'Ошибка' },
    DLQ_STATUS_COLOR: { failed: 'bg-red-100' },
}))

import Dlq from './Dlq'

const render = () =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}><Dlq /></SWRConfig>)

describe('Dlq', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set(['automation:manage'])
        apiListDlq.mockReset()
        apiRetryDlq.mockReset()
        apiDismissDlq.mockReset()
        apiListDlq.mockResolvedValue({ list: [dlqEntry()], total: 1, counts: {} })
    })

    it('требует automation:manage', () => {
        permissions = new Set(['automation:read'])
        render()
        expect(
            screen.getByText('Раздел доступен только с правом automation:manage.'),
        ).toBeInTheDocument()
    })

    it('пустая очередь показывает onboarding', async () => {
        apiListDlq.mockResolvedValue({ list: [], total: 0, counts: {} })
        render()
        expect(await screen.findByText('Нет приостановленных действий.')).toBeInTheDocument()
    })

    it('повторяет запись из DLQ', async () => {
        apiRetryDlq.mockResolvedValue({})
        render()
        await screen.findByText('send_webhook')
        await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() =>
            expect(apiRetryDlq).toHaveBeenCalledWith('dlq-1', { projectId: 'p1' }),
        )
    })
})
