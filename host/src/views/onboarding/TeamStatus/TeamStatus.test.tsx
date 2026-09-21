import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'

const apiGetInvitations = vi.fn()
const apiResendInvitation = vi.fn()
const toastPush = vi.fn()

let canManage = true

vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject?: string, action?: string) =>
        typeof subject === 'string' && typeof action === 'string'
            ? canManage
            : () => canManage,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetInvitations: (...a: unknown[]) => apiGetInvitations(...a),
    apiResendInvitation: (...a: unknown[]) => apiResendInvitation(...a),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import TeamStatus from './TeamStatus'

const renderTeamStatus = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <TeamStatus />
        </SWRConfig>,
    )

describe('TeamStatus (FR-ONB-21)', () => {
    beforeEach(() => {
        canManage = true
        toastPush.mockClear()
        apiGetInvitations.mockReset()
        apiResendInvitation.mockReset()
    })

    it('shows no-permission stub for users without project:manage', () => {
        canManage = false
        renderTeamStatus()
        expect(screen.getByText('Недостаточно прав')).toBeInTheDocument()
        expect(apiGetInvitations).not.toHaveBeenCalled()
    })

    it('shows skeleton while invitations are loading', () => {
        apiGetInvitations.mockReturnValue(new Promise(() => undefined))
        renderTeamStatus()
        expect(document.querySelector('[class*="skeleton"], .skeleton')).toBeTruthy()
    })

    it('shows empty state when there are no invitations', async () => {
        apiGetInvitations.mockResolvedValue([])
        renderTeamStatus()
        expect(await screen.findByText('Приглашений ещё нет.')).toBeInTheDocument()
    })

    it('renders invitation rows and supports resend', async () => {
        apiGetInvitations.mockResolvedValue([
            {
                id: 'inv-1',
                email: 'new@test.local',
                status: 'pending',
                createdAt: '2026-01-10T12:00:00.000Z',
            },
        ])
        apiResendInvitation.mockResolvedValue({})
        renderTeamStatus()
        expect(await screen.findByText('new@test.local')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Повторно' }))
        await waitFor(() => expect(apiResendInvitation).toHaveBeenCalledWith('inv-1'))
        expect(toastPush).toHaveBeenCalled()
    })

    it('shows retry on load error', async () => {
        apiGetInvitations.mockRejectedValue(new Error('network'))
        renderTeamStatus()
        expect(
            await screen.findByText('Не удалось загрузить статус команды.'),
        ).toBeInTheDocument()
    })
})
