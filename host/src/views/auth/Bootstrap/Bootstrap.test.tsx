import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiBootstrap = vi.fn()
const bootstrapSignIn = vi.fn()

vi.mock('@/auth', () => ({
    useAuth: () => ({ bootstrapSignIn }),
}))
vi.mock('@/services/BootstrapService', () => ({
    apiBootstrap: (...a: unknown[]) => apiBootstrap(...a),
}))
vi.mock('@/utils/hooks/usePublicConfig', () => ({
    default: () => ({ appName: 'Fairflow Test', loaded: true }),
}))

import Bootstrap from './Bootstrap'

describe('Bootstrap (SCR-BOX-BOOTSTRAP)', () => {
    beforeEach(() => {
        apiBootstrap.mockReset()
        bootstrapSignIn.mockReset()
    })

    it('shows onboarding stage 1 and welcome copy', () => {
        render(
            <MemoryRouter>
                <Bootstrap />
            </MemoryRouter>,
        )

        expect(screen.getByText('Аккаунт')).toBeInTheDocument()
        expect(screen.getByText('Добро пожаловать в Fairflow Test')).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Создать администратора' }),
        ).toBeInTheDocument()
    })

    it('shows validation errors on empty submit', async () => {
        render(
            <MemoryRouter>
                <Bootstrap />
            </MemoryRouter>,
        )

        await userEvent.click(
            screen.getByRole('button', { name: 'Создать администратора' }),
        )

        expect(await screen.findByText('Введите название организации')).toBeInTheDocument()
        expect(screen.getByText('Введите ФИО')).toBeInTheDocument()
        expect(apiBootstrap).not.toHaveBeenCalled()
    })

    it('shows error when bootstrap is disabled on server', async () => {
        apiBootstrap.mockRejectedValue({
            isAxiosError: true,
            response: { status: 403, data: { code: 'BOOTSTRAP_DISABLED' } },
        })

        render(
            <MemoryRouter>
                <Bootstrap />
            </MemoryRouter>,
        )

        await userEvent.type(
            screen.getByPlaceholderText('Название организации'),
            'Acme',
        )
        await userEvent.type(screen.getByPlaceholderText('Иванов Иван'), 'Admin User')
        await userEvent.type(
            screen.getByPlaceholderText('admin@example.com'),
            'admin@test.local',
        )
        await userEvent.type(
            screen.getByPlaceholderText('Пароль — не короче 8 символов'),
            'password123',
        )
        await userEvent.type(
            screen.getByPlaceholderText('Повторите пароль'),
            'password123',
        )
        await userEvent.click(
            screen.getByRole('button', { name: 'Создать администратора' }),
        )

        expect(
            await screen.findByText('Первичная настройка недоступна в этом окружении.'),
        ).toBeInTheDocument()
    })

    it('shows loading label while bootstrap request is in flight', async () => {
        let resolveBootstrap: (value: unknown) => void = () => {}
        apiBootstrap.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveBootstrap = resolve
                }),
        )

        render(
            <MemoryRouter>
                <Bootstrap />
            </MemoryRouter>,
        )

        await userEvent.type(
            screen.getByPlaceholderText('Название организации'),
            'Acme',
        )
        await userEvent.type(screen.getByPlaceholderText('Иванов Иван'), 'Admin User')
        await userEvent.type(
            screen.getByPlaceholderText('admin@example.com'),
            'admin@test.local',
        )
        await userEvent.type(
            screen.getByPlaceholderText('Пароль — не короче 8 символов'),
            'password123',
        )
        await userEvent.type(
            screen.getByPlaceholderText('Повторите пароль'),
            'password123',
        )
        await userEvent.click(
            screen.getByRole('button', { name: 'Создать администратора' }),
        )

        expect(await screen.findByRole('button', { name: 'Создание...' })).toBeInTheDocument()
        resolveBootstrap({})
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Создать администратора' }),
            ).toBeInTheDocument(),
        )
    })
})
