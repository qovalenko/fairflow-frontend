import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const apiGetProjectTemplates = vi.fn()
const apiCreateProject = vi.fn()
const apiCreateInvitation = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()
const setUser = vi.fn()

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})

vi.mock('@/services/CrmService', () => ({
    apiGetProjectTemplates: (...args: unknown[]) => apiGetProjectTemplates(...args),
    apiCreateProject: (...args: unknown[]) => apiCreateProject(...args),
    apiCreateInvitation: (...args: unknown[]) => apiCreateInvitation(...args),
}))

vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: unknown) => unknown) =>
        sel({
            user: { userId: 'u1', projects: [] },
            setUser,
        }),
}))

vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({ systemId: 'sys1' }),
}))

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...args: unknown[]) => toastPush(...args) },
}))

import CreateProject from './CreateProject'

const templates = [
    {
        id: 'b2b-sales',
        name: 'B2B продажи',
        modules: ['deals', 'contacts', 'orders'],
    },
    {
        id: 'call-center',
        name: 'Колл-центр',
        modules: ['deals', 'contacts'],
    },
]

const moduleToggle = (moduleId: string) => {
    const card = document.querySelector(`[data-qa-module="${moduleId}"]`)
    const input = card?.querySelector('input[type="checkbox"]')
    expect(input).toBeTruthy()
    return input as HTMLInputElement
}

beforeEach(() => {
    vi.clearAllMocks()
    apiGetProjectTemplates.mockResolvedValue(templates)
    localStorage.clear()
    sessionStorage.clear()
})

describe('CreateProject — template reset warning (FR-PSET-410)', () => {
    it(
        'asks before overwriting manual module tweaks when changing template',
        async () => {
        render(
            <MemoryRouter>
                <CreateProject />
            </MemoryRouter>,
        )
        await waitFor(() => expect(apiGetProjectTemplates).toHaveBeenCalled())

        await userEvent.click(screen.getByText('B2B продажи'))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))

        await userEvent.click(moduleToggle('orders'))

        await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
        await userEvent.click(screen.getByRole('button', { name: 'Назад' }))

        await userEvent.click(screen.getByText('Колл-центр'))

        expect(
            await screen.findByText(/Сменить шаблон\?/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/перезапишет ваши правки/i),
        ).toBeInTheDocument()
    },
    15000,
    )
})

describe('CreateProject — partial invite summary (FR-PSET-460)', () => {
    it(
        'shows toast with sent/failed counts when invites partially fail',
        async () => {
        apiCreateProject.mockResolvedValue({
            id: 'p-new',
            name: 'Новый',
            owner_id: 'sys1',
            effective_modules: ['deals', 'contacts'],
        })
        apiCreateInvitation
            .mockRejectedValueOnce(new Error('smtp down'))
            .mockResolvedValueOnce({ id: 'inv-1' })

        render(
            <MemoryRouter>
                <CreateProject />
            </MemoryRouter>,
        )
        await waitFor(() => expect(apiGetProjectTemplates).toHaveBeenCalled())

        await userEvent.click(screen.getByText('Колл-центр'))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await userEvent.click(screen.getByRole('button', { name: 'Далее' }))

        const emailInputs = screen.getAllByPlaceholderText('email@example.com')
        await userEvent.type(emailInputs[0]!, 'a@example.com')
        await userEvent.click(screen.getByRole('button', { name: 'Добавить ещё' }))
        const emailInputsAfter = screen.getAllByPlaceholderText('email@example.com')
        await userEvent.type(emailInputsAfter[1]!, 'b@example.com')

        await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))

        await waitFor(() => expect(apiCreateProject).toHaveBeenCalled())
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(apiCreateInvitation).toHaveBeenCalledTimes(2)
    },
    15000,
    )
})
