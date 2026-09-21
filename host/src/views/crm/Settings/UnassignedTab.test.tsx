import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as CrmService from '@/services/CrmService'
import { pickReactSelectOption } from '../../../../testing/reactSelectHelpers'

const toastPush = vi.fn()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import UnassignedTab from './UnassignedTab'

const sampleRecord: CrmService.UnassignedRecord = {
    entityType: 'contact',
    entityId: 'c-1',
    title: 'Контакт без владельца',
    updatedAt: '2026-06-15T10:30:00.000Z',
}

const sampleDeal: CrmService.UnassignedRecord = {
    entityType: 'deal',
    entityId: 'd-1',
    title: 'Сделка без владельца',
    updatedAt: '2026-06-16T12:00:00.000Z',
}

const sampleMember: CrmService.ProjectMember = {
    id: 'u-1',
    name: 'Алексей Новиков',
    email: 'alex@proj.local',
    role: 'manager',
}

const listResponse = (
    list: CrmService.UnassignedRecord[],
    extra?: Partial<CrmService.UnassignedListResponse>,
): CrmService.UnassignedListResponse => ({
    list,
    total: list.length,
    nextCursor: '',
    ...extra,
})

describe('UnassignedTab (SCR-MORG-UNASSIGNED)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
    })

    it('shows message when project is not selected', () => {
        render(<UnassignedTab />)

        expect(screen.getByText('Проект не выбран.')).toBeInTheDocument()
    })

    it('shows loading spinner while unassigned records load', () => {
        vi.spyOn(CrmService, 'apiListUnassigned').mockImplementation(() => new Promise(() => {}))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])

        render(<UnassignedTab projectId="proj-1" />)

        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when unassigned list fails to load', async () => {
        vi.spyOn(CrmService, 'apiListUnassigned').mockRejectedValue(new Error('network'))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])

        render(<UnassignedTab projectId="proj-1" />)

        expect(
            await screen.findByText('Не удалось загрузить записи без владельца.'),
        ).toBeInTheDocument()
    })

    it('shows empty state when all records have an owner', async () => {
        vi.spyOn(CrmService, 'apiListUnassigned').mockResolvedValue(listResponse([]))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])

        render(<UnassignedTab projectId="proj-1" />)

        expect(await screen.findByText('Все записи имеют владельца.')).toBeInTheDocument()
        expect(screen.getByText(/Без владельца:/)).toHaveTextContent('0')
    })

    it('shows unassigned rows with entity type labels', async () => {
        vi.spyOn(CrmService, 'apiListUnassigned').mockResolvedValue(
            listResponse([sampleRecord, sampleDeal]),
        )
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])

        render(<UnassignedTab projectId="proj-1" />)

        expect(await screen.findByText('Контакт без владельца')).toBeInTheDocument()
        expect(screen.getByText('Сделка без владельца')).toBeInTheDocument()
        expect(screen.getByText('Контакты')).toBeInTheDocument()
        expect(screen.getByText('Сделки')).toBeInTheDocument()
        expect(screen.getByText(/Без владельца:/)).toHaveTextContent('2')
    })

    it('reloads list when resource filter changes', async () => {
        const listSpy = vi
            .spyOn(CrmService, 'apiListUnassigned')
            .mockResolvedValueOnce(listResponse([sampleRecord]))
            .mockResolvedValueOnce(listResponse([sampleDeal]))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])
        const user = userEvent.setup()

        render(<UnassignedTab projectId="proj-1" />)

        await screen.findByText('Контакт без владельца')
        await pickReactSelectOption(user, 0, 'Сделки')

        await waitFor(() => {
            expect(listSpy).toHaveBeenCalledWith(
                'proj-1',
                expect.objectContaining({ resource: 'deal' }),
            )
            expect(screen.getByText('Сделка без владельца')).toBeInTheDocument()
            expect(screen.queryByText('Контакт без владельца')).not.toBeInTheDocument()
        })
    })

    it('bulk-reassigns selected records to a new owner', async () => {
        vi.spyOn(CrmService, 'apiListUnassigned')
            .mockResolvedValueOnce(listResponse([sampleRecord]))
            .mockResolvedValueOnce(listResponse([]))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([sampleMember])
        const reassignSpy = vi
            .spyOn(CrmService, 'apiBulkReassignUnassigned')
            .mockResolvedValue({ reassigned: 1 })
        const user = userEvent.setup()

        render(<UnassignedTab projectId="proj-1" />)

        await screen.findByText('Контакт без владельца')
        const checkboxes = screen.getAllByRole('checkbox')
        await user.click(checkboxes[1]!)

        expect(screen.getByText('Выбрано: 1')).toBeInTheDocument()
        await pickReactSelectOption(user, 1, 'Алексей Новиков')
        await user.click(screen.getByRole('button', { name: 'Переназначить' }))

        await waitFor(() => {
            expect(reassignSpy).toHaveBeenCalledWith('proj-1', {
                newOwnerUserId: 'u-1',
                items: [{ entityType: 'contact', entityId: 'c-1' }],
            })
            expect(toastPush).toHaveBeenCalled()
            expect(screen.getByText('Все записи имеют владельца.')).toBeInTheDocument()
        })
    })

    it('shows toast when bulk reassign fails', async () => {
        vi.spyOn(CrmService, 'apiListUnassigned').mockResolvedValue(listResponse([sampleRecord]))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([sampleMember])
        vi.spyOn(CrmService, 'apiBulkReassignUnassigned').mockRejectedValue(new Error('fail'))
        const user = userEvent.setup()

        render(<UnassignedTab projectId="proj-1" />)

        await screen.findByText('Контакт без владельца')
        await user.click(screen.getAllByRole('checkbox')[1]!)
        await pickReactSelectOption(user, 1, 'Алексей Новиков')
        await user.click(screen.getByRole('button', { name: 'Переназначить' }))

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const toastContent = toastPush.mock.calls.at(-1)?.[0] as {
                props: { children: string }
            }
            expect(toastContent.props.children).toBe('Не удалось переназначить записи')
        })
    })

    it('loads more rows when next cursor is present', async () => {
        const listSpy = vi
            .spyOn(CrmService, 'apiListUnassigned')
            .mockResolvedValueOnce(
                listResponse([sampleRecord], { nextCursor: 'cursor-2', total: 2 }),
            )
            .mockResolvedValueOnce(listResponse([sampleRecord, sampleDeal], { total: 2 }))
        vi.spyOn(CrmService, 'apiGetProjectMembers').mockResolvedValue([])
        const user = userEvent.setup()

        render(<UnassignedTab projectId="proj-1" />)

        await screen.findByText('Контакт без владельца')
        await user.click(screen.getByRole('button', { name: 'Загрузить ещё' }))

        await waitFor(() => {
            expect(listSpy).toHaveBeenCalledWith(
                'proj-1',
                expect.objectContaining({ cursor: 'cursor-2' }),
            )
            expect(screen.getByText('Сделка без владельца')).toBeInTheDocument()
        })
    })
})
