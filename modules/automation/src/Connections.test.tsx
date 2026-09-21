import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { connection } from './testFixtures'

const apiListConnections = vi.fn()
const apiUpdateConnection = vi.fn()
const apiDeleteConnection = vi.fn()
const navigateMock = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'

vi.mock('react-router', () => ({
    useNavigate: () => navigateMock,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListConnections: (...a: unknown[]) => apiListConnections(...a),
    apiUpdateConnection: (...a: unknown[]) => apiUpdateConnection(...a),
    apiDeleteConnection: (...a: unknown[]) => apiDeleteConnection(...a),
    BREAKER_LABEL: { closed: 'Закрыт', open: 'Открыт', half_open: 'Half-open' },
    BREAKER_COLOR: { closed: 'bg-green-100', open: 'bg-red-100', half_open: 'bg-yellow-100' },
}))

import Connections from './Connections'

const render = () =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}><Connections /></SWRConfig>)

describe('Connections', () => {
    beforeEach(() => {
        projectId = 'p1'
        permissions = new Set(['automation:manage'])
        apiListConnections.mockReset()
        apiUpdateConnection.mockReset()
        apiDeleteConnection.mockReset()
        apiListConnections.mockResolvedValue({ list: [connection()], total: 1 })
    })

    it('требует automation:manage', () => {
        permissions = new Set(['automation:read'])
        render()
        expect(
            screen.getByText('Каталог connections доступен только с правом automation:manage.'),
        ).toBeInTheDocument()
    })

    it('пустой каталог предлагает создать connection', async () => {
        apiListConnections.mockResolvedValue({ list: [], total: 0 })
        render()
        expect(await screen.findByText('Нет одобренных connections.')).toBeInTheDocument()
        await userEvent.click(screen.getAllByRole('button', { name: 'Добавить connection' })[0])
        expect(navigateMock).toHaveBeenCalledWith('/automation/connections/new')
    })

    it('рендерит connection и переключает enabled', async () => {
        apiUpdateConnection.mockResolvedValue(connection({ enabled: false }))
        render()
        expect(await screen.findByText('Webhook CRM')).toBeInTheDocument()
        const toggle = screen.getAllByRole('checkbox')[0]
        await userEvent.click(toggle)
        await waitFor(() =>
            expect(apiUpdateConnection).toHaveBeenCalledWith(
                'conn-1',
                { enabled: false },
                { projectId: 'p1' },
            ),
        )
    })

    it('ошибка загрузки показывает ErrorState', async () => {
        apiListConnections.mockRejectedValue(new Error('network'))
        render()
        expect(
            await screen.findByText('Не удалось загрузить connections'),
        ).toBeInTheDocument()
    })
})
