import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import type { PermissionProjectionState } from '@/@types/permission'

const apiGetProjectAudit = vi.fn()
vi.mock('@/services/CrmService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/CrmService')>()),
    apiGetProjectAudit: (...a: unknown[]) => apiGetProjectAudit(...a),
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => 'p1',
}))

// The gate is the real `usePermission` / `usePermissionStatus` pair driven by the
// projection — mocking the projection keeps the fail-closed logic under test.
let projectionState: PermissionProjectionState
vi.mock('@/utils/hooks/usePermissionProjection', () => ({
    default: () => projectionState,
}))

const { default: ProjectAudit } = await import('./ProjectAudit')

const withPermissions = (allowed: string[]): PermissionProjectionState =>
    ({
        source: 'projection',
        projection: { allowed },
    }) as unknown as PermissionProjectionState

beforeEach(() => {
    apiGetProjectAudit.mockReset()
    apiGetProjectAudit.mockResolvedValue([])
    projectionState = withPermissions(['project:manage'])
})

afterEach(cleanup)

/**
 * TODO-274 — `GET /v1/projects/:id/audit/events` требует `project:manage`
 * (gateway v1-data-bff.controller). Экран был открыт всем (`authority: []`),
 * поэтому рядовой участник видел журнал и получал 403 вместо заглушки.
 */
describe('ProjectAudit — gated by project:manage (TODO-274)', () => {
    it('renders the journal for a user holding project:manage', async () => {
        render(<ProjectAudit />)
        await waitFor(() => expect(apiGetProjectAudit).toHaveBeenCalledWith('p1', 200))
        expect(screen.getByText('Журнал аудита')).toBeInTheDocument()
        expect(screen.queryByText('Нет доступа')).toBeNull()
    })

    it('renders a no-access placeholder without the permission', async () => {
        projectionState = withPermissions(['deals:read'])
        render(<ProjectAudit />)

        expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
        expect(screen.queryByText('Журнал аудита')).toBeNull()
    })

    it('does NOT call the audit endpoint without the permission (no 403 spam)', async () => {
        projectionState = withPermissions([])
        render(<ProjectAudit />)

        await screen.findByText('Нет доступа')
        expect(apiGetProjectAudit).not.toHaveBeenCalled()
    })

    it('waits for the projection instead of fetching while it is loading (fail-closed)', async () => {
        projectionState = {
            source: 'loading',
            projection: null,
        } as unknown as PermissionProjectionState
        render(<ProjectAudit />)

        await Promise.resolve()
        expect(apiGetProjectAudit).not.toHaveBeenCalled()
        // Пока право не разрешено — это НЕ «нет доступа», а ожидание…
        expect(screen.queryByText('Нет доступа')).toBeNull()
        // …и НЕ «записей в журнале пока нет» (пустой экран вместо загрузки).
        expect(screen.queryByText('Записей в журнале пока нет.')).toBeNull()
    })

    it('is permissive when there is no project context at all (source: absent)', async () => {
        projectionState = {
            source: 'absent',
            projection: null,
        } as unknown as PermissionProjectionState
        render(<ProjectAudit />)

        await waitFor(() => expect(apiGetProjectAudit).toHaveBeenCalled())
        expect(screen.queryByText('Нет доступа')).toBeNull()
    })
})
