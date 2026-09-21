import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { useSessionUser } from '@/store/authStore'
import * as AuthService from '@/services/AuthService'

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/utils/notify', () => ({
    notify: vi.fn(),
}))

import Profile from './Profile'
import { notify } from '@/utils/notify'

const sampleUser = {
    userId: 'u-1',
    userName: 'Иван Петров',
    name: 'Иван Петров',
    email: 'ivan@test.local',
    phone: '+7 999 123-45-67',
    position: 'Менеджер',
    language: 'ru',
    timezone: 'Europe/Moscow',
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    thousandsSeparator: 'space',
    defaultDealsView: 'kanban',
    defaultActivitiesView: 'list',
}

describe('Profile (SCR-MPROF-PROFILE)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Иван Петров',
                email: 'ivan@test.local',
                authority: [],
                system: null,
                projects: [],
            },
        })
    })

    it('shows loading state while profile loads', () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockImplementation(() => new Promise(() => {}))
        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>,
        )

        expect(screen.getAllByText('Загрузка профиля...').length).toBeGreaterThan(0)
        expect(screen.getByRole('heading', { name: 'Персональные данные' })).toBeInTheDocument()
    })

    it('shows retryable error when profile load fails', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockRejectedValue(new Error('network'))
        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось загрузить профиль.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('shows profile data after successful load', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({ user: sampleUser })
        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Иван')).toBeInTheDocument()
        expect(screen.getByText('Петров')).toBeInTheDocument()
        expect(screen.getByText('ivan@test.local')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Редактировать профиль' })).toBeInTheDocument()
    })

    it('saves edited profile fields', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({ user: sampleUser })
        vi.spyOn(AuthService, 'apiUpdateMyProfile').mockResolvedValue({
            user: { ...sampleUser, name: 'Пётр Петров', phone: '+7 999 000-00-00' },
        })
        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Редактировать профиль' }))
        const firstName = screen.getByPlaceholderText('Имя')
        await userEvent.clear(firstName)
        await userEvent.type(firstName, 'Пётр')
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))

        await waitFor(() =>
            expect(AuthService.apiUpdateMyProfile).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Пётр Петров' }),
            ),
        )
        expect(notify).toHaveBeenCalledWith('Изменения сохранены', 'success')
        expect(await screen.findByText('Пётр')).toBeInTheDocument()
    })

    it('shows error notification when save fails', async () => {
        vi.spyOn(AuthService, 'apiGetMyProfile').mockResolvedValue({ user: sampleUser })
        vi.spyOn(AuthService, 'apiUpdateMyProfile').mockRejectedValue({
            isAxiosError: true,
            response: { status: 500, data: { message: 'save failed' } },
        })
        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Редактировать профиль' }))
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))

        await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), 'danger'))
        expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toBeInTheDocument()
    })
})
