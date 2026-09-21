import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useSessionUser } from '@/store/authStore'

const navigate = vi.fn()
const useWorkspaceRoleMock = vi.fn(() => ({
    system: { id: 'org-1', name: 'Acme Corp' },
    systemId: 'org-1',
}))

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => useWorkspaceRoleMock(),
}))

import BootstrapSuccess from './BootstrapSuccess'

describe('BootstrapSuccess (SCR-BOX-BOOTSTRAP-SUCCESS)', () => {
    beforeEach(() => {
        navigate.mockReset()
        useWorkspaceRoleMock.mockReturnValue({
            system: { id: 'org-1', name: 'Acme Corp' },
            systemId: 'org-1',
        })
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Admin',
                email: 'admin@test.local',
                userId: 'u-1',
                authority: [],
                projects: [],
            },
        })
    })

    it('shows confirmation and onboarding progress on the happy path', () => {
        render(
            <MemoryRouter initialEntries={['/onboarding/bootstrap-success?owner=org-1']}>
                <BootstrapSuccess />
            </MemoryRouter>,
        )

        expect(screen.getByText('Аккаунт')).toBeInTheDocument()
        expect(screen.getByText('Проект')).toBeInTheDocument()
        expect(screen.getByText('Организация «Acme Corp» создана')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Создать первый проект' }),
        ).toBeInTheDocument()
    })

    it('navigates to project wizard with owner query', async () => {
        render(
            <MemoryRouter initialEntries={['/onboarding/bootstrap-success?owner=org-1']}>
                <BootstrapSuccess />
            </MemoryRouter>,
        )

        await userEvent.click(
            screen.getByRole('button', { name: 'Создать первый проект' }),
        )
        expect(navigate).toHaveBeenCalledWith(
            '/account/projects/new?owner=org-1',
            { replace: true },
        )
    })

    it('redirects to organization recovery when org id is missing', () => {
        useWorkspaceRoleMock.mockReturnValue({
            system: undefined,
            systemId: undefined,
        } as unknown as ReturnType<typeof useWorkspaceRoleMock>)
        render(
            <MemoryRouter initialEntries={['/onboarding/bootstrap-success']}>
                <Routes>
                    <Route path="/onboarding/bootstrap-success" element={<BootstrapSuccess />} />
                    <Route path="/onboarding/organization" element={<div>recovery</div>} />
                </Routes>
            </MemoryRouter>,
        )

        expect(navigate).toHaveBeenCalledWith('/onboarding/organization', { replace: true })
    })

    it('redirects home when user already has a project', () => {
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Admin',
                email: 'admin@test.local',
                userId: 'u-1',
                authority: [],
                projects: [{ id: 'p-1', name: 'Demo', color: '#000', role: 'owner' }],
            },
        })

        render(
            <MemoryRouter initialEntries={['/onboarding/bootstrap-success?owner=org-1']}>
                <BootstrapSuccess />
            </MemoryRouter>,
        )

        expect(navigate).toHaveBeenCalledWith('/', { replace: true })
    })
})
