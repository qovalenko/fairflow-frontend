import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiGetInvitation = vi.fn()
const apiAcceptInvitation = vi.fn()
const navigate = vi.fn()
const useAuthMock = vi.fn(() => ({ authenticated: false }))

vi.mock('@/services/CrmService', () => ({
    apiGetInvitation: (...a: unknown[]) => apiGetInvitation(...a),
    apiAcceptInvitation: (...a: unknown[]) => apiAcceptInvitation(...a),
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

import InviteAccept from './InviteAccept'

const renderInvite = (token: string) =>
    render(
        <MemoryRouter initialEntries={[`/auth/invite/${token}`]}>
            <Routes>
                <Route path="/auth/invite/:token" element={<InviteAccept />} />
            </Routes>
        </MemoryRouter>,
    )

describe('InviteAccept (SCR-AUTH-INVITE-ACCEPT)', () => {
    beforeEach(() => {
        apiGetInvitation.mockReset()
        apiAcceptInvitation.mockReset()
        navigate.mockReset()
        useAuthMock.mockReturnValue({ authenticated: false })
    })

    it('shows loading state while invitation details load', () => {
        apiGetInvitation.mockImplementation(() => new Promise(() => {}))
        renderInvite('pending-token')

        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Приглашение не найдено')).not.toBeInTheDocument()
        expect(screen.queryByText(/Вас пригласили/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows not-found state when invitation load fails', async () => {
        apiGetInvitation.mockRejectedValue(new Error('404'))
        renderInvite('missing-token')

        expect(await screen.findByText('Приглашение не найдено')).toBeInTheDocument()
    })

    it('shows registration form for new invitee', async () => {
        apiGetInvitation.mockResolvedValue({
            email: 'new@test.local',
            organizationName: 'Acme Corp',
            role: 'employee',
            status: 'pending',
            expired: false,
            userExists: false,
        })
        renderInvite('new-user-token')

        expect(
            await screen.findByText('Вас пригласили в «Acme Corp»'),
        ).toBeInTheDocument()
        expect(screen.getByText('new@test.local · роль: Сотрудник')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Принять и зарегистрироваться' }),
        ).toBeInTheDocument()
    })

    it('shows sign-in prompt for existing user who is not authenticated', async () => {
        apiGetInvitation.mockResolvedValue({
            email: 'existing@test.local',
            organizationName: 'Acme Corp',
            role: 'platform_admin',
            status: 'pending',
            expired: false,
            userExists: true,
        })
        renderInvite('existing-user-token')

        expect(await screen.findByRole('button', { name: 'Войти и принять' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Войти и принять' }))
        expect(navigate).toHaveBeenCalledWith(
            '/auth/signin?redirectUrl=%2Fauth%2Finvite%2Fexisting-user-token',
        )
    })

    it('shows already-used state for accepted invitation', async () => {
        apiGetInvitation.mockResolvedValue({
            email: 'used@test.local',
            organizationName: 'Acme Corp',
            role: 'employee',
            status: 'accepted',
            expired: false,
            userExists: true,
        })
        renderInvite('used-token')

        expect(await screen.findByText('Приглашение уже использовано')).toBeInTheDocument()
    })

    it('shows expired state for revoked invitation', async () => {
        apiGetInvitation.mockResolvedValue({
            email: 'old@test.local',
            organizationName: 'Acme Corp',
            role: 'employee',
            status: 'revoked',
            expired: true,
            userExists: false,
        })
        renderInvite('revoked-token')

        expect(await screen.findByText('Приглашение недействительно')).toBeInTheDocument()
    })

    it('shows success after new user accepts invitation', async () => {
        apiGetInvitation.mockResolvedValue({
            email: 'new@test.local',
            organizationName: 'Acme Corp',
            role: 'employee',
            status: 'pending',
            expired: false,
            userExists: false,
        })
        apiAcceptInvitation.mockResolvedValue({
            landingProjectId: 'p-1',
            projectGrants: [{ projectId: 'p-1' }],
        })
        renderInvite('accept-token')

        await screen.findByPlaceholderText('Введите ваше имя')
        await userEvent.type(screen.getByPlaceholderText('Введите ваше имя'), 'New User')
        await userEvent.type(screen.getByPlaceholderText('Создайте пароль'), 'secret123')
        await userEvent.click(
            screen.getByRole('button', { name: 'Принять и зарегистрироваться' }),
        )

        expect(await screen.findByText('Приглашение принято')).toBeInTheDocument()
        await waitFor(() =>
            expect(apiAcceptInvitation).toHaveBeenCalledWith({
                token: 'accept-token',
                name: 'New User',
                password: 'secret123',
            }),
        )
    })

    it('shows error when accept fails for authenticated user', async () => {
        useAuthMock.mockReturnValue({ authenticated: true })
        apiGetInvitation.mockResolvedValue({
            email: 'existing@test.local',
            organizationName: 'Acme Corp',
            role: 'employee',
            status: 'pending',
            expired: false,
            userExists: true,
        })
        apiAcceptInvitation.mockRejectedValue({
            isAxiosError: true,
            response: { status: 500 },
        })
        renderInvite('auth-token')

        await userEvent.click(
            await screen.findByRole('button', { name: 'Принять приглашение' }),
        )
        expect(
            await screen.findByText('Не удалось принять приглашение. Попробуйте ещё раз.'),
        ).toBeInTheDocument()
    })
})
