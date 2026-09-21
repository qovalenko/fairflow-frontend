import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiGetProjectInvitation = vi.fn()
const apiAcceptProjectInvitation = vi.fn()
const navigate = vi.fn()
const useAuthMock = vi.fn(() => ({ authenticated: false }))

vi.mock('@/services/CrmService', () => ({
    apiGetProjectInvitation: (...a: unknown[]) => apiGetProjectInvitation(...a),
    apiAcceptProjectInvitation: (...a: unknown[]) => apiAcceptProjectInvitation(...a),
}))
vi.mock('@/auth', () => ({
    useAuth: () => useAuthMock(),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

import ProjectInviteAccept from './ProjectInviteAccept'

const renderProjectInvite = (token: string) =>
    render(
        <MemoryRouter initialEntries={[`/auth/project-invite/${token}`]}>
            <Routes>
                <Route path="/auth/project-invite/:token" element={<ProjectInviteAccept />} />
            </Routes>
        </MemoryRouter>,
    )

describe('ProjectInviteAccept (SCR-AUTH-PROJECT-INVITE-ACCEPT)', () => {
    beforeEach(() => {
        apiGetProjectInvitation.mockReset()
        apiAcceptProjectInvitation.mockReset()
        navigate.mockReset()
        useAuthMock.mockReturnValue({ authenticated: false })
    })

    it('shows loading state while invitation details load', () => {
        apiGetProjectInvitation.mockImplementation(() => new Promise(() => {}))
        renderProjectInvite('pending-token')

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Приглашение не найдено')).not.toBeInTheDocument()
    })

    it('shows not-found state when invitation load fails', async () => {
        apiGetProjectInvitation.mockRejectedValue(new Error('404'))
        renderProjectInvite('missing-token')

        expect(await screen.findByText('Приглашение не найдено')).toBeInTheDocument()
    })

    it('shows registration form for new invitee', async () => {
        apiGetProjectInvitation.mockResolvedValue({
            email: 'new@test.local',
            projectName: 'Alpha Project',
            role: 'member',
            status: 'pending',
            expired: false,
            userExists: false,
        })
        renderProjectInvite('new-user-token')

        expect(
            await screen.findByText('Вас пригласили в проект «Alpha Project»'),
        ).toBeInTheDocument()
        expect(screen.getByText('new@test.local · роль: Участник')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Принять и зарегистрироваться' }),
        ).toBeInTheDocument()
    })

    it('shows sign-in prompt for existing user who is not authenticated', async () => {
        apiGetProjectInvitation.mockResolvedValue({
            email: 'existing@test.local',
            projectName: 'Alpha Project',
            role: 'admin',
            status: 'pending',
            expired: false,
            userExists: true,
        })
        renderProjectInvite('existing-user-token')

        await userEvent.click(await screen.findByRole('button', { name: 'Войти и принять' }))
        expect(navigate).toHaveBeenCalledWith(
            '/auth/signin?redirectUrl=%2Fauth%2Fproject-invite%2Fexisting-user-token',
        )
    })

    it('shows invalid state for revoked invitation', async () => {
        apiGetProjectInvitation.mockResolvedValue({
            email: 'old@test.local',
            projectName: 'Alpha Project',
            role: 'member',
            status: 'revoked',
            expired: true,
            userExists: false,
        })
        renderProjectInvite('revoked-token')

        expect(await screen.findByText('Приглашение недействительно')).toBeInTheDocument()
    })

    it('shows success after new user accepts invitation', async () => {
        apiGetProjectInvitation.mockResolvedValue({
            email: 'new@test.local',
            projectName: 'Alpha Project',
            role: 'member',
            status: 'pending',
            expired: false,
            userExists: false,
        })
        apiAcceptProjectInvitation.mockResolvedValue({
            landingProjectId: 'p-1',
            projectId: 'p-1',
        })
        renderProjectInvite('accept-token')

        await screen.findByPlaceholderText('Введите ваше имя')
        await userEvent.type(screen.getByPlaceholderText('Введите ваше имя'), 'New User')
        await userEvent.type(screen.getByPlaceholderText('Создайте пароль'), 'secret123')
        await userEvent.click(
            screen.getByRole('button', { name: 'Принять и зарегистрироваться' }),
        )

        expect(await screen.findByText('Приглашение принято')).toBeInTheDocument()
        await waitFor(() =>
            expect(apiAcceptProjectInvitation).toHaveBeenCalledWith({
                token: 'accept-token',
                name: 'New User',
                password: 'secret123',
            }),
        )
    })

    it('shows error when accept fails for authenticated user', async () => {
        useAuthMock.mockReturnValue({ authenticated: true })
        apiGetProjectInvitation.mockResolvedValue({
            email: 'existing@test.local',
            projectName: 'Alpha Project',
            role: 'member',
            status: 'pending',
            expired: false,
            userExists: true,
        })
        apiAcceptProjectInvitation.mockRejectedValue({
            isAxiosError: true,
            response: { status: 500 },
        })
        renderProjectInvite('auth-token')

        await userEvent.click(
            await screen.findByRole('button', { name: 'Принять приглашение' }),
        )
        expect(
            await screen.findByText('Не удалось принять приглашение. Попробуйте ещё раз.'),
        ).toBeInTheDocument()
    })
})
