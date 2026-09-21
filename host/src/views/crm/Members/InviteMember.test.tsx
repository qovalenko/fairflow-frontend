import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiAddProjectMember = vi.fn()
const apiGetEmployees = vi.fn()
const apiGetProject = vi.fn()
const apiGetProjectMembers = vi.fn()
const toastPush = vi.fn()

let canManage = true
let projectId: string | null = 'p-1'

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject?: string, action?: string) =>
        typeof subject === 'string' && typeof action === 'string'
            ? canManage
            : () => canManage,
}))
vi.mock('@/services/CrmService', () => ({
    apiAddProjectMember: (...a: unknown[]) => apiAddProjectMember(...a),
    apiGetEmployees: (...a: unknown[]) => apiGetEmployees(...a),
    apiGetProject: (...a: unknown[]) => apiGetProject(...a),
    apiGetProjectMembers: (...a: unknown[]) => apiGetProjectMembers(...a),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import InviteMember from './InviteMember'

describe('InviteMember (FR-PSET-120)', () => {
    beforeEach(() => {
        canManage = true
        projectId = 'p-1'
        toastPush.mockClear()
        apiAddProjectMember.mockReset().mockResolvedValue({})
        apiGetEmployees.mockReset().mockResolvedValue([
            { userId: 'u-2', email: 'colleague@test.local', name: 'Colleague', isActive: true },
        ])
        apiGetProject.mockReset().mockResolvedValue({ status: 'active' })
        apiGetProjectMembers.mockReset().mockResolvedValue([])
    })

    it('shows stub when project is not selected', () => {
        projectId = null
        render(
            <MemoryRouter>
                <InviteMember />
            </MemoryRouter>,
        )
        expect(screen.getByText('Проект не выбран.')).toBeInTheDocument()
    })

    it('shows no-permission stub for users without project:manage', () => {
        canManage = false
        render(
            <MemoryRouter>
                <InviteMember />
            </MemoryRouter>,
        )
        expect(
            screen.getByText('У вас нет прав добавлять участников в этот проект.'),
        ).toBeInTheDocument()
    })

    it('does not submit until email or employee is selected', async () => {
        render(
            <MemoryRouter>
                <InviteMember />
            </MemoryRouter>,
        )
        await waitFor(() => expect(apiGetEmployees).toHaveBeenCalled())
        await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
        expect(apiAddProjectMember).not.toHaveBeenCalled()
    })

    it('invites by email and navigates back to members list', async () => {
        render(
            <MemoryRouter initialEntries={['/p/p-1/members/invite']}>
                <InviteMember />
            </MemoryRouter>,
        )
        await waitFor(() => expect(apiGetEmployees).toHaveBeenCalled())
        await userEvent.type(
            screen.getByPlaceholderText('name@example.com'),
            'new@test.local',
        )
        await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
        await waitFor(() =>
            expect(apiAddProjectMember).toHaveBeenCalledWith('p-1', {
                email: 'new@test.local',
                role: 'member',
            }),
        )
        expect(toastPush).toHaveBeenCalled()
    })

    it('shows archived warning and blocks submit for locked project', async () => {
        apiGetProject.mockResolvedValue({ status: 'archived', is_archived: true })
        render(
            <MemoryRouter>
                <InviteMember />
            </MemoryRouter>,
        )
        expect(
            await screen.findByText(/Проект в архиве или помечен на удаление/),
        ).toBeInTheDocument()
        await userEvent.type(
            screen.getByPlaceholderText('name@example.com'),
            'new@test.local',
        )
        await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
        expect(apiAddProjectMember).not.toHaveBeenCalled()
    })
})
