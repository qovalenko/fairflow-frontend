import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { dryRunResult } from './testFixtures'

const apiDryRun = vi.fn()

vi.mock('@/services/AutomationService', () => ({
    apiDryRun: (...a: unknown[]) => apiDryRun(...a),
}))

import DryRunOverlay from './DryRunOverlay'

describe('DryRunOverlay', () => {
    beforeEach(() => {
        apiDryRun.mockReset()
    })

    it('не рендерится когда закрыт', () => {
        render(
            <DryRunOverlay
                isOpen={false}
                onClose={() => {}}
                ruleId="rule-1"
                projectId="p1"
                hasExternalEffect={false}
            />,
        )
        expect(screen.queryByText('Тест правила (dry-run)')).not.toBeInTheDocument()
    })

    it('запускает dry-run и показывает результаты', async () => {
        apiDryRun.mockResolvedValue({ results: [dryRunResult()] })
        const onClose = vi.fn()
        render(
            <DryRunOverlay
                isOpen
                onClose={onClose}
                ruleId="rule-1"
                projectId="p1"
                hasExternalEffect
            />,
        )
        expect(screen.getByText(/внешним эффектом будут показаны/i)).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Прогнать' }))
        await waitFor(() =>
            expect(apiDryRun).toHaveBeenCalledWith(
                'rule-1',
                { lastN: 10 },
                { projectId: 'p1' },
            ),
        )
        expect(await screen.findByText('Сматчилось')).toBeInTheDocument()
    })

    it('пустой результат показывает сообщение об отсутствии образцов', async () => {
        apiDryRun.mockResolvedValue({ results: [] })
        render(
            <DryRunOverlay
                isOpen
                onClose={() => {}}
                ruleId="rule-1"
                projectId="p1"
                hasExternalEffect={false}
            />,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Прогнать' }))
        expect(
            await screen.findByText('Нет образцов событий для прогона.'),
        ).toBeInTheDocument()
    })
})
