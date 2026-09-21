import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { useSessionUser } from '@/store/authStore'

const apiGetMyProjects = vi.fn()
const apiGetSystem = vi.fn()
const toastPush = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetMyProjects: (...a: unknown[]) => apiGetMyProjects(...a),
    apiGetSystem: (...a: unknown[]) => apiGetSystem(...a),
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({
        system: { id: 'sys-1', name: 'Acme Corp', role: 'employee' },
    }),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import NoProjects from './NoProjects'

describe('NoProjects (FR-ONB-13)', () => {
    beforeEach(() => {
        toastPush.mockClear()
        apiGetMyProjects.mockReset()
        apiGetSystem.mockReset()
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Employee',
                email: 'emp@test.local',
                userId: 'u-1',
                authority: [],
                system: { id: 'sys-1', name: 'Acme Corp', role: 'employee' },
                projects: [],
            },
        })
    })

    it('renders informative empty-state with org name and profile links', () => {
        render(
            <MemoryRouter>
                <NoProjects />
            </MemoryRouter>,
        )
        expect(
            screen.getByRole('heading', {
                name: 'Вы ещё не добавлены ни в один проект',
            }),
        ).toBeInTheDocument()
        expect(screen.getByText('Acme Corp')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /Профиль/ })).toHaveAttribute(
            'href',
            '/account/profile',
        )
        expect(screen.getByRole('link', { name: /Безопасность/ })).toHaveAttribute(
            'href',
            '/account/security',
        )
        expect(screen.queryByRole('button', { name: /Создать проект/i })).toBeNull()
    })

    it('shows info toast when refresh still finds no projects', async () => {
        apiGetMyProjects.mockResolvedValue([])
        apiGetSystem.mockResolvedValue({
            id: 'sys-1',
            name: 'Acme Corp',
            role: 'employee',
        })
        render(
            <MemoryRouter>
                <NoProjects />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
        await waitFor(() => expect(apiGetMyProjects).toHaveBeenCalledWith({ userId: 'u-1' }))
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
    })

    it('navigates home when refresh discovers assigned projects', async () => {
        apiGetMyProjects.mockResolvedValue([
            { id: 'p-1', name: 'Demo', color: '#6366f1' },
        ])
        apiGetSystem.mockResolvedValue({
            id: 'sys-1',
            name: 'Acme Corp',
            role: 'employee',
        })
        render(
            <MemoryRouter initialEntries={['/onboarding/no-projects']}>
                <NoProjects />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Обновить' }))
        await waitFor(() => expect(apiGetMyProjects).toHaveBeenCalled())
    })
})
