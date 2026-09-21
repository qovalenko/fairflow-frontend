import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiGetProjectMembers = vi.fn()
const apiGetProject = vi.fn()
const apiUpdateProjectMemberRole = vi.fn()
const apiRemoveProjectMember = vi.fn()
const apiPreviewRemoveProjectMember = vi.fn()
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
    apiGetProjectMembers: (...a: unknown[]) => apiGetProjectMembers(...a),
    apiGetProject: (...a: unknown[]) => apiGetProject(...a),
    apiUpdateProjectMemberRole: (...a: unknown[]) => apiUpdateProjectMemberRole(...a),
    apiRemoveProjectMember: (...a: unknown[]) => apiRemoveProjectMember(...a),
    apiPreviewRemoveProjectMember: (...a: unknown[]) =>
        apiPreviewRemoveProjectMember(...a),
    apiTransferProjectOwnership: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import ProjectMembers from './ProjectMembers'

const sampleMembers = [
    {
        id: 'u-owner',
        name: 'Owner User',
        email: 'owner@test.local',
        role: 'owner' as const,
        source: 'personal' as const,
    },
    {
        id: 'u-member',
        name: 'Member User',
        email: 'member@test.local',
        role: 'member' as const,
        source: 'invited' as const,
    },
]

describe('ProjectMembers (FR-PSET-120)', () => {
    beforeEach(() => {
        canManage = true
        projectId = 'p-1'
        toastPush.mockClear()
        apiGetProjectMembers.mockReset().mockResolvedValue(sampleMembers)
        apiGetProject.mockReset().mockResolvedValue({ status: 'active' })
        apiUpdateProjectMemberRole.mockReset().mockResolvedValue({})
        apiRemoveProjectMember.mockReset().mockResolvedValue({})
        apiPreviewRemoveProjectMember.mockReset().mockResolvedValue({ ownedCount: 0 })
    })

    it('shows stub when project is not selected', () => {
        projectId = null
        render(
            <MemoryRouter>
                <ProjectMembers />
            </MemoryRouter>,
        )
        expect(
            screen.getByText(/Проект не выбран. Выберите проект в шапке/),
        ).toBeInTheDocument()
    })

    it('renders member table after successful load', async () => {
        render(
            <MemoryRouter>
                <ProjectMembers />
            </MemoryRouter>,
        )
        expect(await screen.findByText('Owner User')).toBeInTheDocument()
        expect(screen.getByText('Member User')).toBeInTheDocument()
        expect(screen.getByText('Приглашён')).toBeInTheDocument()
    })

    it('shows read-only info banner without manage permission', async () => {
        canManage = false
        render(
            <MemoryRouter>
                <ProjectMembers />
            </MemoryRouter>,
        )
        expect(
            await screen.findByText(/нет прав на управление участниками/),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Пригласить' })).toBeNull()
    })

    it('shows load error with retry action', async () => {
        apiGetProjectMembers.mockRejectedValue(new Error('network'))
        render(
            <MemoryRouter>
                <ProjectMembers />
            </MemoryRouter>,
        )
        expect(
            await screen.findByText('Не удалось загрузить список участников'),
        ).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetProjectMembers).toHaveBeenCalledTimes(2))
    })

    it('shows archived banner and hides invite button', async () => {
        apiGetProject.mockResolvedValue({ status: 'archived', is_archived: true })
        render(
            <MemoryRouter>
                <ProjectMembers />
            </MemoryRouter>,
        )
        expect(
            await screen.findByText(/Проект в архиве — управление участниками недоступно/),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Пригласить' })).toBeNull()
    })
})
