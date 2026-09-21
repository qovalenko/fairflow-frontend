import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as CrmService from '@/services/CrmService'

const toastPush = vi.fn()

const permissions: Record<string, boolean> = {
    'departments:write': true,
    'departments:delete': true,
}

vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions[`${subject}:${action}`] ?? false,
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({
        systemId: 'org-1',
    }),
}))
vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import Departments from './Departments'

const sampleDepartment: CrmService.OrgDepartment = {
    id: 'dept-1',
    organizationId: 'org-1',
    name: 'Продажи',
    parentId: null,
    leaderUserId: 'u-1',
}

const sampleEmployee: CrmService.OrgEmployee = {
    id: 'emp-1',
    userId: 'u-1',
    role: 'employee',
    departmentId: 'dept-1',
    name: 'Иван Петров',
    email: 'ivan@acme.local',
    avatarUrl: '',
}

const sampleSummary: CrmService.DepartmentSummary = {
    employeeCount: 1,
    activeSeats: 3,
    pendingInvitations: 1,
    unassignedRecordsCount: 0,
}

function mockDepartmentLoad(
    departments: CrmService.OrgDepartment[] = [sampleDepartment],
    employees: CrmService.OrgEmployee[] = [sampleEmployee],
) {
    vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue(departments)
    vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue(employees)
    vi.spyOn(CrmService, 'apiGetDepartmentSummary').mockResolvedValue(sampleSummary)
}

describe('Departments (SCR-MORG-DEPARTMENTS)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
        Object.assign(permissions, {
            'departments:write': true,
            'departments:delete': true,
        })
    })

    it('shows loading spinner while departments load', () => {
        vi.spyOn(CrmService, 'apiGetDepartments').mockImplementation(() => new Promise(() => {}))
        vi.spyOn(CrmService, 'apiGetEmployees').mockImplementation(() => new Promise(() => {}))

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Подразделения' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when departments load fails', async () => {
        vi.spyOn(CrmService, 'apiGetDepartments').mockRejectedValue(new Error('network'))
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Не удалось загрузить подразделения.'),
        ).toBeInTheDocument()
    })

    it('shows empty state when there are no departments', async () => {
        mockDepartmentLoad([], [])

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Подразделений пока нет.')).toBeInTheDocument()
    })

    it('shows department row with leader and summary after load', async () => {
        mockDepartmentLoad()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Продажи')).toBeInTheDocument()
        const summary = screen.getByText('Продажи').closest('.flex-1')
        expect(summary?.textContent).toMatch(/1 сотрудников/)
        expect(summary?.textContent).toMatch(/1 приглашений/)
        expect(summary?.textContent).toMatch(/3 мест/)
        expect(summary?.textContent).toMatch(/Руководитель:/)
        expect(summary?.textContent).toMatch(/Иван Петров/)
    })

    it('hides management actions without write and delete permissions', async () => {
        permissions['departments:write'] = false
        permissions['departments:delete'] = false
        mockDepartmentLoad()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Продажи')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Создать отдел' })).not.toBeInTheDocument()
        expect(screen.queryByTitle('Редактировать')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Удалить')).not.toBeInTheDocument()
    })

    it('creates a new department from the drawer', async () => {
        mockDepartmentLoad()
        const createSpy = vi.spyOn(CrmService, 'apiCreateDepartment').mockResolvedValue({
            ...sampleDepartment,
            id: 'dept-2',
            name: 'Маркетинг',
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Создать отдел' }))
        expect(screen.getByRole('heading', { name: 'Создать отдел' })).toBeInTheDocument()

        await user.type(screen.getByPlaceholderText('Введите название отдела'), 'Маркетинг')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => {
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Маркетинг' }),
            )
            expect(
                screen.queryByRole('heading', { name: 'Создать отдел' }),
            ).not.toBeInTheDocument()
        })
    })

    it('saves edited department name from the drawer', async () => {
        mockDepartmentLoad()
        const updateSpy = vi
            .spyOn(CrmService, 'apiUpdateDepartment')
            .mockResolvedValue({ ...sampleDepartment, name: 'Продажи B2B' })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Редактировать'))
        expect(screen.getByText('Редактировать отдел')).toBeInTheDocument()

        const nameInput = screen.getByPlaceholderText('Введите название отдела')
        await user.clear(nameInput)
        await user.type(nameInput, 'Продажи B2B')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith(
                'dept-1',
                expect.objectContaining({ name: 'Продажи B2B' }),
            )
            expect(screen.queryByText('Редактировать отдел')).not.toBeInTheDocument()
        })
    })

    it('shows danger toast when delete fails with department_not_empty', async () => {
        mockDepartmentLoad()
        vi.spyOn(CrmService, 'apiDeleteDepartment').mockRejectedValue({
            response: { status: 409 },
        })
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Удалить'))

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string; children: string }
            }
            expect(notification.props.title).toBe('Не удалось удалить')
            expect(notification.props.children).toBe(
                'В отделе есть сотрудники или вложенные отделы — сначала переведите их.',
            )
        })
    })

    it('shows inline save error when department update fails', async () => {
        mockDepartmentLoad()
        vi.spyOn(CrmService, 'apiUpdateDepartment').mockRejectedValue(new Error('network'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Редактировать'))
        const nameInput = screen.getByPlaceholderText('Введите название отдела')
        await user.clear(nameInput)
        await user.type(nameInput, 'Сбой')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        expect(
            await screen.findByText('Не удалось сохранить отдел.'),
        ).toBeInTheDocument()
    })

    it('shows success toast when department is deleted', async () => {
        mockDepartmentLoad()
        vi.spyOn(CrmService, 'apiDeleteDepartment').mockResolvedValue(undefined as never)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Departments />
            </MemoryRouter>,
        )

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Удалить'))

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string; children: string | string[] }
            }
            expect(notification.props.title).toBe('Отдел удалён')
            const body = notification.props.children
            expect(Array.isArray(body) ? body.join('') : body).toContain('Продажи')
        })
    })
})
