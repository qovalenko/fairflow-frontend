import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Activity } from '@/@types/crm'

const apiGetActivities = vi.fn()
const apiGetOverdueCount = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetActivities: (...a: unknown[]) => apiGetActivities(...a),
    apiGetOverdueCount: (...a: unknown[]) => apiGetOverdueCount(...a),
}))

import ActivityOverdueWidget from './ActivityOverdueWidget'

const overdueActivity = (): Activity => ({
    id: 'a1',
    type: 'task',
    title: 'Просроченный звонок',
    status: 'planned',
    priority: 'high',
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    dueDate: Math.floor(Date.now() / 1000) - 86400,
    overdue: true,
    createdAt: 0,
    updatedAt: 0,
})

describe('ActivityOverdueWidget', () => {
    beforeEach(() => {
        permissions = new Set(['activities:read'])
        apiGetOverdueCount.mockResolvedValue({ count: 2 })
        apiGetActivities.mockResolvedValue({
            list: [overdueActivity()],
            total: 1,
        })
    })

    it('без activities:read не рендерится', () => {
        permissions = new Set()
        const { container } = render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityOverdueWidget />
            </SWRConfig>,
        )

        expect(container.firstChild).toBeNull()
    })

    it('показывает счётчик и просроченные активности', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityOverdueWidget />
            </SWRConfig>,
        )

        expect(await screen.findByText('Просроченные')).toBeInTheDocument()
        expect(await screen.findByText('2')).toBeInTheDocument()
        expect(await screen.findByText('Просроченный звонок')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    })

    it('пустой список — позитивная формулировка ST-3', async () => {
        apiGetOverdueCount.mockResolvedValue({ count: 0 })
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityOverdueWidget />
            </SWRConfig>,
        )

        expect(await screen.findByText('Просроченных нет')).toBeInTheDocument()
    })

    it('ошибка — ST-6 с «Повторить»', async () => {
        apiGetOverdueCount.mockRejectedValue(new Error('fail'))
        apiGetActivities.mockRejectedValue(new Error('fail'))

        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityOverdueWidget />
            </SWRConfig>,
        )

        expect(await screen.findByText('Не удалось загрузить просроченные.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetOverdueCount).toHaveBeenCalledTimes(2))
    })

    it('«Все активности» ведёт на drill ?overdue=1', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityOverdueWidget />
            </SWRConfig>,
        )

        fireEvent.click(await screen.findByRole('button', { name: 'Все активности' }))
        expect(navigate).toHaveBeenCalledWith('/activities?overdue=1')
    })
})
