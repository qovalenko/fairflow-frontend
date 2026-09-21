import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { useSessionUser } from '@/store/authStore'

const apiGetSystem = vi.fn()

let workspace = {
    systemId: null as string | null,
    isSystemOwnerOrAdmin: true,
    projects: [] as { id: string }[],
}

vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => workspace,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetSystem: (...a: unknown[]) => apiGetSystem(...a),
}))

import OrgSetupRecovery from './OrgSetupRecovery'

describe('OrgSetupRecovery (BX-ONB-2)', () => {
    beforeEach(() => {
        workspace = { systemId: null, isSystemOwnerOrAdmin: true, projects: [] }
        apiGetSystem.mockReset()
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Admin',
                email: 'admin@test.local',
                authority: [],
                system: null,
                projects: [],
            },
        })
    })

    it('renders recovery card when system is not resolved', () => {
        render(
            <MemoryRouter>
                <OrgSetupRecovery />
            </MemoryRouter>,
        )
        expect(screen.getByText('Система ещё не готова')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument()
    })

    it('returns null when system is already resolved (gate redirect)', () => {
        workspace.systemId = 'sys-1'
        const { container } = render(
            <MemoryRouter initialEntries={['/onboarding/organization']}>
                <Routes>
                    <Route path="/onboarding/organization" element={<OrgSetupRecovery />} />
                    <Route path="/" element={<div>home</div>} />
                </Routes>
            </MemoryRouter>,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('shows error when refresh returns empty system', async () => {
        apiGetSystem.mockResolvedValue(null)
        render(
            <MemoryRouter>
                <OrgSetupRecovery />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
        expect(
            await screen.findByText('Система ещё не инициализирована. Обратитесь к администратору.'),
        ).toBeInTheDocument()
    })

    it('navigates to project wizard after successful refresh for admin', async () => {
        apiGetSystem.mockResolvedValue({
            id: 'sys-1',
            name: 'Acme',
            role: 'platform_admin',
        })
        render(
            <MemoryRouter initialEntries={['/onboarding/organization']}>
                <Routes>
                    <Route path="/onboarding/organization" element={<OrgSetupRecovery />} />
                    <Route path="/account/projects/new" element={<div>create project</div>} />
                </Routes>
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
        await waitFor(() => expect(screen.getByText('create project')).toBeInTheDocument())
    })
})
