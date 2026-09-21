import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as CrmService from '@/services/CrmService'

const toastPush = vi.fn()

const permissions: Record<string, boolean> = {
    'employees:write': true,
    'employees:delete': true,
    'invitations:write': true,
    'invitations:revoke': true,
    'invitations:resend': true,
}

vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions[`${subject}:${action}`] ?? false,
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({
        system: { name: 'Acme Corp', role: 'platform_owner' },
        systemId: 'org-1',
        isSystemOwner: true,
    }),
}))
vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('./OffboardDrawer', () => ({
    default: ({
        isOpen,
        employee,
    }: {
        isOpen: boolean
        employee: { name: string } | null
    }) => (isOpen && employee ? <div>Offboard: {employee.name}</div> : null),
}))

import { pickReactSelectOption } from '../../../../testing/reactSelectHelpers'
import Employees from './Employees'

const sampleEmployee: CrmService.OrgEmployee = {
    id: 'emp-1',
    userId: 'u-1',
    role: 'platform_admin',
    departmentId: null,
    name: 'Иван Петров',
    email: 'ivan@acme.local',
    avatarUrl: '',
}

const sampleDepartment: CrmService.OrgDepartment = {
    id: 'dept-1',
    organizationId: 'org-1',
    name: 'Продажи',
    parentId: null,
    leaderUserId: null,
}

const manageableEmployee: CrmService.OrgEmployee = {
    ...sampleEmployee,
    id: 'emp-2',
    userId: 'u-2',
    role: 'employee',
    name: 'Мария Сидорова',
    email: 'maria@acme.local',
}

const sampleInvitation: CrmService.OrgInvitation = {
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'pending@acme.local',
    role: 'employee',
    departmentId: null,
    status: 'pending',
    inviteUrl: 'https://app.test/invite/abc',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-12-31T00:00:00.000Z',
}

const expiredInvitation: CrmService.OrgInvitation = {
    ...sampleInvitation,
    id: 'inv-2',
    email: 'expired@acme.local',
    status: 'pending',
    expiresAt: '2020-01-01T00:00:00.000Z',
}

describe('Employees (SCR-MORG-EMPLOYEES)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        toastPush.mockReset()
        Object.assign(permissions, {
            'employees:write': true,
            'employees:delete': true,
            'invitations:write': true,
            'invitations:revoke': true,
            'invitations:resend': true,
        })
    })

    it('shows loading spinner while employees load', () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockImplementation(() => new Promise(() => {}))
        vi.spyOn(CrmService, 'apiGetInvitations').mockImplementation(() => new Promise(() => {}))
        vi.spyOn(CrmService, 'apiGetDepartments').mockImplementation(() => new Promise(() => {}))

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Сотрудники' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when employees load fails', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockRejectedValue(new Error('network'))
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось загрузить сотрудников.')).toBeInTheDocument()
    })

    it('shows empty state when there are no employees or invitations', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Сотрудников и приглашений пока нет.'),
        ).toBeInTheDocument()
    })

    it('shows employee row with management actions when permitted', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([sampleEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Пригласить' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument()
        expect(screen.getByText('Активен')).toBeInTheDocument()
    })

    it('hides management actions without write permissions', async () => {
        permissions['employees:write'] = false
        permissions['invitations:write'] = false
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([sampleEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Иван Петров')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Пригласить' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Добавить' })).not.toBeInTheDocument()
        expect(screen.getByText('Администратор')).toBeInTheDocument()
    })

    it('shows empty-filter state and clears search', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([sampleEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Иван Петров')
        await userEvent.type(
            screen.getByPlaceholderText('Поиск по имени или email...'),
            'missing-person',
        )

        expect(screen.getByText('По запросу «missing-person» ничего не найдено.')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Сбросить поиск' }))
        expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    })

    it('invites a new employee by email', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiCreateInvitation').mockResolvedValue({
            id: 'inv-1',
            organizationId: 'org-1',
            email: 'new@acme.local',
            role: 'employee',
            departmentId: null,
            status: 'pending',
            inviteUrl: 'https://app.test/invite/abc',
            emailSent: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            expiresAt: '2026-02-01T00:00:00.000Z',
        })
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await user.click(await screen.findByRole('button', { name: 'Пригласить' }))
        await user.type(screen.getByPlaceholderText('name@company.ru'), 'new@acme.local')
        await user.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

        await waitFor(() => {
            expect(CrmService.apiCreateInvitation).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'new@acme.local' }),
            )
            const successToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string } }
                return notification.props.title === 'Приглашение создано'
            })
            expect(successToast).toBeTruthy()
        })
    })

    it('shows add-employee error when user id is invalid', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiAddEmployee').mockRejectedValue(new Error('not found'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        const addButtons = await screen.findAllByRole('button', { name: 'Добавить' })
        await user.click(addButtons[0])
        await user.type(screen.getByPlaceholderText('ID пользователя'), 'bad-user-id')
        const submitButtons = screen.getAllByRole('button', { name: 'Добавить' })
        await user.click(submitButtons[submitButtons.length - 1])

        expect(
            await screen.findByText(
                'Не удалось добавить сотрудника. Проверьте ID пользователя.',
            ),
        ).toBeInTheDocument()
    })

    it('changes employee role from the row select', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees')
            .mockResolvedValueOnce([manageableEmployee])
            .mockResolvedValueOnce([{ ...manageableEmployee, role: 'platform_admin' }])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([sampleDepartment])
        const updateSpy = vi.spyOn(CrmService, 'apiUpdateEmployee').mockResolvedValue({
            ...manageableEmployee,
            role: 'platform_admin',
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await pickReactSelectOption(user, 1, 'Администратор')

        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith('u-2', { role: 'platform_admin' })
            expect(screen.getByText('Администратор')).toBeInTheDocument()
        })
    })

    it('revokes pending invitation', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([sampleInvitation])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        const revokeSpy = vi.spyOn(CrmService, 'apiRevokeInvitation').mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('pending@acme.local')
        await user.click(screen.getByTitle('Отозвать приглашение'))

        await waitFor(() => {
            expect(revokeSpy).toHaveBeenCalledWith('inv-1')
            const successToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string } }
                return notification.props.title === 'Приглашение отозвано'
            })
            expect(successToast).toBeTruthy()
        })
    })

    it('resends expired invitation', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([expiredInvitation])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiResendInvitation').mockResolvedValue({
            ...expiredInvitation,
            inviteUrl: 'https://app.test/invite/new',
        })
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('expired@acme.local')
        await user.click(screen.getByTitle('Отправить повторно'))

        await waitFor(() => {
            expect(CrmService.apiResendInvitation).toHaveBeenCalledWith('inv-2')
            const successToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string } }
                return notification.props.title === 'Приглашение отправлено'
            })
            expect(successToast).toBeTruthy()
        })
    })

    it('transfers organization ownership after confirmation', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([manageableEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        const transferSpy = vi
            .spyOn(CrmService, 'apiTransferOrgOwnership')
            .mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await user.click(screen.getByTitle('Передать владельца'))
        expect(screen.getByText('Передать владельца?')).toBeInTheDocument()

        await user.type(screen.getByPlaceholderText('Acme Corp'), 'Acme Corp')
        await user.click(screen.getByRole('button', { name: 'Передать' }))

        await waitFor(() => {
            expect(transferSpy).toHaveBeenCalledWith('u-2')
            const successToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string } }
                return notification.props.title === 'Владелец передан'
            })
            expect(successToast).toBeTruthy()
        })
    })

    it('opens offboard drawer from employee row', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([manageableEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await user.click(screen.getByTitle('Уволить (мастер)'))

        expect(await screen.findByText('Offboard: Мария Сидорова')).toBeInTheDocument()
    })

    it('changes employee department from the row select', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees')
            .mockResolvedValueOnce([manageableEmployee])
            .mockResolvedValueOnce([{ ...manageableEmployee, departmentId: 'dept-1' }])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([sampleDepartment])
        const updateSpy = vi.spyOn(CrmService, 'apiUpdateEmployee').mockResolvedValue({
            ...manageableEmployee,
            departmentId: 'dept-1',
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await pickReactSelectOption(user, 0, 'Продажи')

        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith('u-2', { departmentId: 'dept-1' })
            expect(screen.getByText('Продажи')).toBeInTheDocument()
        })
    })

    it('shows seat limit toast when role change returns 402', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([manageableEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([sampleDepartment])
        vi.spyOn(CrmService, 'apiUpdateEmployee').mockRejectedValue({
            response: { status: 402 },
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await pickReactSelectOption(user, 1, 'Администратор')

        await waitFor(() => {
            const dangerToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string; children: string } }
                return notification.props.title === 'Не удалось выполнить'
            })
            expect(dangerToast).toBeTruthy()
            expect(
                (dangerToast![0] as { props: { children: string } }).props.children,
            ).toBe('Достигнут лимит лицензий (seats) — освободите место или докупите.')
        })
    })

    it('shows conflict toast when department change returns 409', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([manageableEmployee])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([sampleDepartment])
        vi.spyOn(CrmService, 'apiUpdateEmployee').mockRejectedValue({
            response: { status: 409 },
        })
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('Мария Сидорова')
        await pickReactSelectOption(user, 0, 'Продажи')

        await waitFor(() => {
            const dangerToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string; children: string } }
                return notification.props.title === 'Не удалось выполнить'
            })
            expect(dangerToast).toBeTruthy()
            expect(
                (dangerToast![0] as { props: { children: string } }).props.children,
            ).toBe(
                'Конфликт: владельца нельзя удалить/изменить, либо сотрудник уже состоит в организации.',
            )
        })
    })

    it('shows danger toast when revoke invitation fails', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([sampleInvitation])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiRevokeInvitation').mockRejectedValue(new Error('network'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('pending@acme.local')
        await user.click(screen.getByTitle('Отозвать приглашение'))

        await waitFor(() => {
            const dangerToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string; children: string } }
                return notification.props.title === 'Не удалось отозвать'
            })
            expect(dangerToast).toBeTruthy()
            expect(
                (dangerToast![0] as { props: { children: string } }).props.children,
            ).toBe('Попробуйте обновить страницу и повторить.')
        })
    })

    it('shows danger toast when resend invitation fails', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([expiredInvitation])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiResendInvitation').mockRejectedValue(new Error('network'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await screen.findByText('expired@acme.local')
        await user.click(screen.getByTitle('Отправить повторно'))

        await waitFor(() => {
            const dangerToast = toastPush.mock.calls.find((call) => {
                const notification = call[0] as { props: { title: string; children: string } }
                return notification.props.title === 'Не удалось отправить'
            })
            expect(dangerToast).toBeTruthy()
            expect(
                (dangerToast![0] as { props: { children: string } }).props.children,
            ).toBe('Попробуйте позже.')
        })
    })

    it('shows inline error when invite API fails', async () => {
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetInvitations').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiGetDepartments').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiCreateInvitation').mockRejectedValue(new Error('bad email'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Employees />
            </MemoryRouter>,
        )

        await user.click(await screen.findByRole('button', { name: 'Пригласить' }))
        await user.type(screen.getByPlaceholderText('name@company.ru'), 'bad@acme.local')
        await user.click(screen.getByRole('button', { name: 'Отправить приглашение' }))

        expect(
            await screen.findByText('Не удалось отправить приглашение. Проверьте email.'),
        ).toBeInTheDocument()
    })
})
