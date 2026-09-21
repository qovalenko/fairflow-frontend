import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

/**
 * TODO-279 — «Доступ к записи».
 *
 * FR-ACCESS-400/420: панель видна manager+/владельцу записи, не только
 * `project:manage`. 403 по-прежнему не маскируется под «грантов нет».
 */
const apiListRecordShares = vi.fn()
const apiGetMembers = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiListRecordShares: (...a: unknown[]) => apiListRecordShares(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    apiShareRecord: vi.fn(),
    apiUnshareRecord: vi.fn(),
}))

let canManage = true
let projectRole: 'owner' | 'admin' | 'manager' | 'member' | 'viewer' = 'owner'
let sessionUserId = 'u-me'
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (s?: string, a?: string) =>
        typeof s === 'string' && typeof a === 'string' ? canManage : () => canManage,
    useRequiresPermission: () => canManage,
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({ projects: [{ id: 'p1', role: projectRole }] }),
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string } }) => unknown) =>
        sel({ user: { userId: sessionUserId } }),
}))

const { default: RecordShareControl } = await import('./RecordShareControl')

const renderControl = (ownerId?: string) =>
    render(
        <RecordShareControl
            projectId="p1"
            resource="deals"
            recordId="d1"
            recordOwnerUserId={ownerId}
        />,
    )

const forbidden = Object.assign(new Error('Request failed with status code 403'), {
    response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
})

beforeEach(() => {
    canManage = true
    projectRole = 'owner'
    sessionUserId = 'u-me'
    apiListRecordShares.mockReset().mockResolvedValue([])
    apiGetMembers.mockReset().mockResolvedValue([])
})

afterEach(cleanup)

describe('RecordShareControl — гейт manager+/владелец (FR-ACCESS-400)', () => {
    it('без права и без роли manager не рендерит панель и не дёргает ручку', async () => {
        canManage = false
        projectRole = 'member'
        const { container } = renderControl()

        await waitFor(() => expect(container).toBeEmptyDOMElement())
        expect(apiListRecordShares).not.toHaveBeenCalled()
    })

    it('manager без project:manage видит панель', async () => {
        canManage = false
        projectRole = 'manager'
        apiGetMembers.mockResolvedValue([{ id: 'u2', name: 'Пётр' }])
        renderControl()

        expect(await screen.findByText('Поделиться')).toBeInTheDocument()
        expect(apiListRecordShares).toHaveBeenCalledWith('p1', 'deals', 'd1')
    })

    it('владелец записи без project:manage видит панель', async () => {
        canManage = false
        projectRole = 'member'
        sessionUserId = 'u-owner'
        apiGetMembers.mockResolvedValue([])
        renderControl('u-owner')

        expect(await screen.findByText('Поделиться')).toBeInTheDocument()
        expect(apiListRecordShares).toHaveBeenCalled()
    })

    it('с правом показывает панель и читает список грантов', async () => {
        apiGetMembers.mockResolvedValue([{ id: 'u2', name: 'Пётр' }])
        apiListRecordShares.mockResolvedValue([
            { id: 's1', grantee_type: 'user', grantee_id: 'u2' },
        ])
        renderControl()

        expect(await screen.findByText('Пётр')).toBeInTheDocument()
        expect(apiListRecordShares).toHaveBeenCalledWith('p1', 'deals', 'd1')
    })
})

describe('RecordShareControl — отказ не выдаётся за «грантов нет» (TODO-279)', () => {
    it('403 показывает причину вместо «Запись ни с кем не расшарена»', async () => {
        apiListRecordShares.mockRejectedValue(forbidden)
        renderControl()

        expect(
            await screen.findByText(/Недостаточно прав/),
        ).toBeInTheDocument()
        expect(screen.queryByText('Запись ни с кем не расшарена.')).toBeNull()
        // Форма выдачи доступа не показывается — она бы всё равно получила 403.
        expect(screen.queryByText('Поделиться')).toBeNull()
    })

    it('прочая ошибка загрузки тоже видна пользователю', async () => {
        apiListRecordShares.mockRejectedValue(
            Object.assign(new Error('boom'), {
                response: { status: 500, data: { message: 'internal' } },
            }),
        )
        renderControl()

        expect(
            await screen.findByText(/Не удалось загрузить доступы к записи/),
        ).toBeInTheDocument()
    })
})
