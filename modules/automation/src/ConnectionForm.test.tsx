import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter, Route, Routes } from 'react-router'
import { connection } from './testFixtures'

const apiGetConnection = vi.fn()
const apiCreateConnection = vi.fn()
const apiUpdateConnection = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'
let routeId: string | undefined

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useParams: () => ({ id: routeId }),
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiGetConnection: (...a: unknown[]) => apiGetConnection(...a),
    apiCreateConnection: (...a: unknown[]) => apiCreateConnection(...a),
    apiUpdateConnection: (...a: unknown[]) => apiUpdateConnection(...a),
}))

import ConnectionForm from './ConnectionForm'

const renderAt = (path: string) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/automation/connections/new" element={<ConnectionForm />} />
                    <Route
                        path="/automation/connections/:id/edit"
                        element={<ConnectionForm />}
                    />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ConnectionForm', () => {
    beforeEach(() => {
        routeId = undefined
        projectId = 'p1'
        permissions = new Set(['automation:manage'])
        navigateMock.mockReset()
        apiCreateConnection.mockResolvedValue(connection())
        apiGetConnection.mockResolvedValue(connection())
        apiUpdateConnection.mockResolvedValue(connection())
    })

    it('без manage показывает NoPermissionState', () => {
        permissions = new Set(['automation:read'])
        renderAt('/automation/connections/new')
        expect(screen.getByText('Нужно право automation:manage.')).toBeInTheDocument()
    })

    it('форма создания сохраняет connection', async () => {
        renderAt('/automation/connections/new')
        expect(screen.getByText('Новый connection')).toBeInTheDocument()
        await userEvent.type(screen.getByPlaceholderText('Например, 1С прод'), 'Hook')
        await userEvent.type(
            screen.getByPlaceholderText('https://erp.example.com/hook'),
            'https://example.test/hook',
        )
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(apiCreateConnection).toHaveBeenCalled())
        expect(navigateMock).toHaveBeenCalledWith('/automation/connections')
    }, 10000)

    it('edit loading показывает скелетоны', async () => {
        routeId = 'conn-1'
        apiGetConnection.mockImplementation(() => new Promise(() => {}))
        renderAt('/automation/connections/conn-1/edit')
        expect(screen.queryByText('Редактирование connection')).not.toBeInTheDocument()
        expect(document.querySelectorAll('.skeleton')).toHaveLength(2)
    })

    it('edit загружает connection', async () => {
        routeId = 'conn-1'
        renderAt('/automation/connections/conn-1/edit')
        expect(await screen.findByDisplayValue('Webhook CRM')).toBeInTheDocument()
    })

    it('без проекта показывает NoProjectState', () => {
        projectId = null
        renderAt('/automation/connections/new')
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('edit 404 показывает NotFoundState', async () => {
        routeId = 'missing'
        apiGetConnection.mockRejectedValueOnce({ response: { status: 404 } })
        renderAt('/automation/connections/missing/edit')
        expect(await screen.findByText('Connection не найден.')).toBeInTheDocument()
    })

    it('валидация требует название и URL', async () => {
        renderAt('/automation/connections/new')
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        expect(screen.getByText('Укажите название')).toBeInTheDocument()
    })
})
