import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

const apiListDlq = vi.fn()
let projectId: string | null = 'p1'

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/services/AutomationService', () => ({
    apiListDlq: (...a: unknown[]) => apiListDlq(...a),
    dlqNavBadgeCount: (counts?: Partial<Record<string, number>>) =>
        (counts?.failed ?? 0) + (counts?.retrying ?? 0),
}))

import NavDlqBadge from './NavDlqBadge'

const render = (moduleId?: string) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <NavDlqBadge moduleId={moduleId} />
        </SWRConfig>,
    )

describe('NavDlqBadge', () => {
    beforeEach(() => {
        projectId = 'p1'
        apiListDlq.mockReset()
        apiListDlq.mockResolvedValue({ list: [], total: 0, counts: { failed: 2, retrying: 1 } })
    })

    it('не рендерится для чужого moduleId', () => {
        const { container } = render('contacts')
        expect(container).toBeEmptyDOMElement()
        expect(apiListDlq).not.toHaveBeenCalled()
    })

    it('не рендерится при нулевом счётчике', async () => {
        apiListDlq.mockResolvedValue({ list: [], total: 0, counts: {} })
        const { container } = render('automation')
        await waitFor(() => expect(apiListDlq).toHaveBeenCalled())
        expect(container.textContent).toBe('')
    })

    it('показывает badge с суммой failed+retrying', async () => {
        render('automation')
        expect(await screen.findByText('3')).toBeInTheDocument()
        expect(apiListDlq).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'p1', pageSize: 1 }),
        )
    })
})
