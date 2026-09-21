import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Activity } from '@/@types/crm'

const apiGetActivities = vi.fn()
const apiRestoreActivity = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetActivities: (...a: unknown[]) => apiGetActivities(...a),
    apiRestoreActivity: (...a: unknown[]) => apiRestoreActivity(...a),
    newIdempotencyKey: () => 'restore-key-1',
}))

import ActivityTrash from './ActivityTrash'

const trashed = (): Activity => ({
    id: 't1',
    type: 'task',
    title: 'Удалённая задача',
    status: 'planned',
    priority: 'medium',
    dueDate: 1_700_000_000_000,
    deletedAt: 1_700_100_000,
    createdAt: 0,
    updatedAt: 0,
})

describe('ActivityTrash', () => {
    beforeEach(() => {
        permissions = new Set(['activities:read', 'activities:delete'])
        apiGetActivities.mockResolvedValue({ list: [trashed()], total: 1 })
        apiRestoreActivity.mockResolvedValue({ ok: true })
    })

    it('без activities:read — ST-10', async () => {
        permissions = new Set(['activities:delete'])
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        expect(await screen.findByText('Недостаточно прав')).toBeInTheDocument()
    })

    it('запрашивает trash-срез с state=trashed и includeDeleted', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        await waitFor(() =>
            expect(apiGetActivities).toHaveBeenCalledWith({
                projectId: 'p1',
                state: 'trashed',
                includeDeleted: true,
                pageIndex: 0,
                pageSize: 100,
            }),
        )
    })

    it('показывает удалённую активность с deletedAt', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        expect(await screen.findByText('Удалённая задача')).toBeInTheDocument()
    })

    it('пустая корзина — ST-3', async () => {
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    })

    it('восстановление после подтверждения вызывает apiRestoreActivity', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Восстановить' }))

        await waitFor(() =>
            expect(apiRestoreActivity).toHaveBeenCalledWith('t1', 'p1', 'restore-key-1'),
        )
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('ошибка загрузки — ST-6 с «Повторить»', async () => {
        apiGetActivities.mockRejectedValue(new Error('boom'))
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('ошибка восстановления оставляет диалог подтверждения', async () => {
        apiRestoreActivity.mockRejectedValue(new Error('fail'))
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }))
        const dialog = await screen.findByRole('dialog')
        fireEvent.click(within(dialog).getByRole('button', { name: 'Восстановить' }))

        await waitFor(() => expect(apiRestoreActivity).toHaveBeenCalled())
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('без activities:delete восстановление не открывает диалог', async () => {
        permissions = new Set(['activities:read'])
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        fireEvent.click(await screen.findByRole('button', { name: 'Восстановить' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('записи без deletedAt не попадают в корзину', async () => {
        apiGetActivities.mockResolvedValue({
            list: [{ ...trashed(), deletedAt: undefined }],
            total: 1,
        })
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ActivityTrash />
            </SWRConfig>,
        )

        expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
        expect(screen.queryByText('Удалённая задача')).not.toBeInTheDocument()
    })
})
