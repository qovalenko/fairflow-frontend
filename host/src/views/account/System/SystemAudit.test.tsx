import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as CrmService from '@/services/CrmService'

const orgPermission = vi.fn((_subject: string, _action: string) => true)

vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => orgPermission,
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({
        systemId: 'org-1',
    }),
}))
vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))

import SystemAudit from './SystemAudit'

const sampleEntry: CrmService.OrgAuditEntry = {
    id: 'audit-1',
    organizationId: 'org-1',
    userId: 'u-1',
    action: 'invitation.created',
    entityType: 'invitation',
    entityId: 'inv-1',
    metadata: { email: 'new@acme.local' },
    createdAt: '2026-01-15T10:30:00.000Z',
    name: 'Админ Орг',
    email: 'admin@acme.local',
    avatarUrl: '',
}

describe('SystemAudit (SCR-MORG-AUDIT)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        orgPermission.mockImplementation(() => true)
    })

    it('shows no-permission message without orgAudit:read', () => {
        orgPermission.mockImplementation((subject, action) => {
            if (subject === 'orgAudit' && action === 'read') return false
            return true
        })

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Журнал аудита' })).toBeInTheDocument()
        expect(
            screen.getByText('У вас нет доступа к журналу аудита организации.'),
        ).toBeInTheDocument()
    })

    it('shows loading spinner while audit log loads', () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockImplementation(() => new Promise(() => {}))

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Журнал аудита' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when audit log load fails', async () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockRejectedValue(new Error('network'))

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Не удалось загрузить журнал аудита.'),
        ).toBeInTheDocument()
    })

    it('shows empty state when audit log has no entries', async () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockResolvedValue({ list: [], nextCursor: '' })

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Записей в журнале пока нет.')).toBeInTheDocument()
    })

    it('shows audit row with action label and metadata summary', async () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockResolvedValue({
            list: [sampleEntry],
            nextCursor: '',
        })

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Админ Орг')).toBeInTheDocument()
        expect(screen.getByText('Создано приглашение')).toBeInTheDocument()
        expect(screen.getByText('new@acme.local')).toBeInTheDocument()
    })

    it('shows empty-filter state and clears filters on reset', async () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockResolvedValue({
            list: [sampleEntry],
            nextCursor: '',
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Админ Орг')).toBeInTheDocument()

        const [dateFrom] = document.querySelectorAll('input[type="date"]')
        await user.clear(dateFrom)
        await user.type(dateFrom, '2099-01-01')

        expect(
            await screen.findByText('По заданным фильтрам записей не найдено.'),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))

        expect(await screen.findByText('Админ Орг')).toBeInTheDocument()
    })

    it('expands audit row to show full metadata JSON', async () => {
        vi.spyOn(CrmService, 'apiGetOrgAudit').mockResolvedValue({
            list: [sampleEntry],
            nextCursor: '',
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        await screen.findByText('Админ Орг')
        const expandButton = document.querySelector('button.p-1.hover\\:bg-gray-100')
        expect(expandButton).toBeTruthy()
        await user.click(expandButton!)

        expect(await screen.findByText(/"email": "new@acme.local"/)).toBeInTheDocument()
    })

    it('loads more audit entries when pagination cursor is present', async () => {
        const secondEntry: CrmService.OrgAuditEntry = {
            ...sampleEntry,
            id: 'audit-2',
            action: 'employee.added',
            metadata: { role: 'employee' },
        }
        const auditSpy = vi
            .spyOn(CrmService, 'apiGetOrgAudit')
            .mockResolvedValueOnce({ list: [sampleEntry], nextCursor: 'cursor-2' })
            .mockResolvedValueOnce({ list: [secondEntry], nextCursor: '' })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <SystemAudit />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Админ Орг')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Загрузить ещё' }))

        expect(await screen.findByText('Добавлен сотрудник')).toBeInTheDocument()
        expect(auditSpy).toHaveBeenCalledTimes(2)
        expect(auditSpy.mock.calls[1][0]).toEqual(
            expect.objectContaining({ cursor: 'cursor-2' }),
        )
    })
})
