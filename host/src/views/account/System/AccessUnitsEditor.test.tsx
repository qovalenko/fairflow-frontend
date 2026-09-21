import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as CrmService from '@/services/CrmService'
import { pickReactSelectOption } from '../../../../testing/reactSelectHelpers'

const orgPermission = vi.fn((_subject: string, _action: string) => true)
const toastPush = vi.fn()

vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => orgPermission,
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import AccessUnitsEditor from './AccessUnitsEditor'

const sampleUnit: CrmService.AccessUnit = {
    id: 'unit-1',
    scopeType: 'ORGANIZATION',
    scopeId: 'org-1',
    name: 'Продажи',
    kind: 'department',
    parentId: null,
    leaderUserId: 'u-1',
}

const sampleEmployee: CrmService.OrgEmployee = {
    id: 'emp-1',
    userId: 'u-1',
    role: 'employee',
    departmentId: null,
    name: 'Иван Петров',
    email: 'ivan@acme.local',
    avatarUrl: '',
}

const nestedUnit: CrmService.AccessUnit = {
    id: 'unit-2',
    scopeType: 'ORGANIZATION',
    scopeId: 'org-1',
    name: 'Маркетинг',
    kind: 'team',
    parentId: null,
    leaderUserId: null,
}

const sampleMember: CrmService.AccessUnitMember = {
    groupId: 'unit-1',
    memberType: 'user',
    memberId: 'u-1',
    memberName: 'Иван Петров',
}

function mockLoad(
    units: CrmService.AccessUnit[] = [sampleUnit],
    employees: CrmService.OrgEmployee[] = [sampleEmployee],
) {
    vi.spyOn(CrmService, 'apiGetAccessUnits').mockResolvedValue(units)
    vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue(employees)
}

describe('AccessUnitsEditor (SCR-MORG-ACCESS-UNITS)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
        orgPermission.mockImplementation(() => true)
    })

    it('shows loading spinner while access units load', () => {
        vi.spyOn(CrmService, 'apiGetAccessUnits').mockImplementation(() => new Promise(() => {}))
        vi.spyOn(CrmService, 'apiGetEmployees').mockImplementation(() => new Promise(() => {}))

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        expect(screen.getByRole('heading', { name: 'Группы доступа' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error with retry when access units load fails', async () => {
        const loadSpy = vi
            .spyOn(CrmService, 'apiGetAccessUnits')
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce([sampleUnit])
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([sampleEmployee])
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        expect(
            await screen.findByText(/Не удалось загрузить группы доступа\./),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'повторить' }))

        expect(await screen.findByText('Продажи')).toBeInTheDocument()
        expect(loadSpy).toHaveBeenCalledTimes(2)
    })

    it('shows empty state when there are no access units', async () => {
        mockLoad([], [])

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        expect(await screen.findByText('Групп пока нет.')).toBeInTheDocument()
    })

    it('shows access unit row with kind tag and leader', async () => {
        mockLoad()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        expect(await screen.findByText('Продажи')).toBeInTheDocument()
        expect(screen.getByText('Отдел')).toBeInTheDocument()
        expect(screen.getByText('Иван Петров')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Состав' })).toBeInTheDocument()
    })

    it('hides management actions without units:manage permission', async () => {
        orgPermission.mockImplementation((subject, action) => {
            if (subject === 'units' && action === 'manage') return false
            return true
        })
        mockLoad()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        expect(await screen.findByText('Продажи')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Создать группу' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Изм.' })).not.toBeInTheDocument()
    })

    it('creates a new access unit from the drawer', async () => {
        mockLoad()
        const createSpy = vi.spyOn(CrmService, 'apiCreateAccessUnit').mockResolvedValue({
            ...sampleUnit,
            id: 'unit-3',
            name: 'Поддержка',
        })
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Создать группу' }))
        expect(screen.getByRole('heading', { name: 'Создать группу' })).toBeInTheDocument()

        await user.type(screen.getByPlaceholderText('Название группы'), 'Поддержка')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => {
            expect(createSpy).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Поддержка', scopeId: 'org-1' }),
            )
            expect(
                screen.queryByRole('heading', { name: 'Создать группу' }),
            ).not.toBeInTheDocument()
        })
    })

    it('saves edited access unit from the drawer', async () => {
        mockLoad()
        const updateSpy = vi
            .spyOn(CrmService, 'apiUpdateAccessUnit')
            .mockResolvedValue({ ...sampleUnit, name: 'Продажи B2B' })
        vi.spyOn(CrmService, 'apiSetAccessUnitParent').mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Изм.' }))
        expect(screen.getByRole('heading', { name: 'Изменить группу' })).toBeInTheDocument()

        const nameInput = screen.getByPlaceholderText('Название группы')
        await user.clear(nameInput)
        await user.type(nameInput, 'Продажи B2B')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith(
                'unit-1',
                expect.objectContaining({ name: 'Продажи B2B' }),
            )
            expect(
                screen.queryByRole('heading', { name: 'Изменить группу' }),
            ).not.toBeInTheDocument()
        })
    })

    it('archives access unit after confirmation', async () => {
        vi.spyOn(CrmService, 'apiGetAccessUnits')
            .mockResolvedValueOnce([sampleUnit])
            .mockResolvedValueOnce([])
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([sampleEmployee])
        const archiveSpy = vi.spyOn(CrmService, 'apiArchiveAccessUnit').mockResolvedValue(undefined as never)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Архивировать'))

        await waitFor(() => {
            expect(archiveSpy).toHaveBeenCalledWith('unit-1')
            expect(screen.queryByText('Продажи')).not.toBeInTheDocument()
            expect(screen.getByText('Групп пока нет.')).toBeInTheDocument()
        })
    })

    it('shows danger toast when save fails with conflict', async () => {
        mockLoad()
        vi.spyOn(CrmService, 'apiCreateAccessUnit').mockRejectedValue({
            response: { status: 409 },
        })
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Создать группу' }))
        await user.type(screen.getByPlaceholderText('Название группы'), 'Конфликт')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string; children: string }
            }
            expect(notification.props.title).toBe('Не удалось сохранить')
            expect(notification.props.children).toBe(
                'Недопустимая структура (цикл или конфликт уровней).',
            )
        })
    })

    it('shows members drawer with existing members and removes one', async () => {
        mockLoad()
        vi.spyOn(CrmService, 'apiGetAccessUnitMembers')
            .mockResolvedValueOnce([sampleMember])
            .mockResolvedValueOnce([])
        const removeSpy = vi
            .spyOn(CrmService, 'apiRemoveAccessUnitMember')
            .mockResolvedValue(undefined as never)
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Состав' }))

        const drawer = await screen.findByRole('dialog')
        expect(within(drawer).getByText('Состав: Продажи')).toBeInTheDocument()
        expect(within(drawer).getByText('Иван Петров')).toBeInTheDocument()

        await user.click(within(drawer).getByTitle('Убрать'))

        await waitFor(() => {
            expect(removeSpy).toHaveBeenCalledWith('unit-1', {
                memberType: 'user',
                memberId: 'u-1',
            })
            expect(within(drawer).queryByText('Иван Петров')).not.toBeInTheDocument()
        })
    })

    it('shows empty members state in the drawer', async () => {
        mockLoad()
        vi.spyOn(CrmService, 'apiGetAccessUnitMembers').mockResolvedValue([])
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Состав' }))

        expect(
            await screen.findByText('В группе пока нет участников.'),
        ).toBeInTheDocument()
    })

    it('shows danger toast when adding nested group fails with cyclic nesting', async () => {
        mockLoad([sampleUnit, nestedUnit])
        vi.spyOn(CrmService, 'apiGetAccessUnitMembers').mockResolvedValue([])
        const addSpy = vi.spyOn(CrmService, 'apiAddAccessUnitMember').mockRejectedValue({
            response: { status: 409 },
        })
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getAllByRole('button', { name: 'Состав' })[0]!)
        const drawer = await screen.findByRole('dialog')
        await pickReactSelectOption(user, 0, 'Вложенная группа (композиция)', drawer)
        await pickReactSelectOption(user, 1, 'Маркетинг', drawer)
        await user.click(within(drawer).getByRole('button', { name: 'Добавить' }))

        await waitFor(() => {
            expect(addSpy).toHaveBeenCalledWith('unit-1', {
                memberType: 'group',
                memberId: 'unit-2',
            })
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string; children: string }
            }
            expect(notification.props.title).toBe('Не удалось добавить')
            expect(notification.props.children).toBe('Циклическая вложенность недопустима.')
        })
    })

    it('shows composition preview before nesting a group', async () => {
        mockLoad([sampleUnit, nestedUnit])
        vi.spyOn(CrmService, 'apiGetAccessUnitMembers').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiPreviewUnitComposition').mockResolvedValue({
            currentUserCount: 1,
            projectedUserCount: 4,
            addedUserCount: 3,
            crossScopeDropped: 0,
        })
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getAllByRole('button', { name: 'Состав' })[0]!)
        await screen.findByText('Добавить участника')

        const drawer = screen.getByRole('dialog')
        await pickReactSelectOption(user, 0, 'Вложенная группа (композиция)', drawer)
        await pickReactSelectOption(user, 1, 'Маркетинг', drawer)

        expect(
            await screen.findByText(/Состав вырастет:/),
        ).toBeInTheDocument()
        expect(screen.getByText(/\+3 польз\./)).toBeInTheDocument()
    })

    it('shows danger toast when archive fails', async () => {
        mockLoad()
        vi.spyOn(CrmService, 'apiArchiveAccessUnit').mockRejectedValue(new Error('fail'))
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByTitle('Архивировать'))

        await waitFor(() => {
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string }
            }
            expect(notification.props.title).toBe('Не удалось архивировать')
        })
    })

    it('shows danger toast when members load fails', async () => {
        mockLoad()
        vi.spyOn(CrmService, 'apiGetAccessUnitMembers').mockRejectedValue(new Error('fail'))
        const user = userEvent.setup()

        render(<AccessUnitsEditor scopeType="ORGANIZATION" scopeId="org-1" />)

        await screen.findByText('Продажи')
        await user.click(screen.getByRole('button', { name: 'Состав' }))

        await waitFor(() => {
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string }
            }
            expect(notification.props.title).toBe('Не удалось загрузить состав')
        })
    })
})
