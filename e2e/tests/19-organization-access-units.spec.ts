import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { ApiClient } from '../fixtures/api'
import { uniqueName } from '../support/env'
import { signInViaApi } from '../support/login'
import {
    acceptNativeConfirm,
    accessUnitCard,
    openProjectSettingsTab,
    pickLabeledSelect,
    pickMembersDrawerMemberType,
    pickMembersDrawerSelect,
    seedOrgEmployee,
} from '../support/organization'

const MODULES = ['deals', 'contacts'] as const

const KIND_LABELS: Record<string, string> = {
    department: 'Отдел',
    team: 'Команда',
    territory: 'Территория',
    custom: 'Группа',
}

async function seedProject(
    api: ApiClient,
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>,
    label: string,
): Promise<string> {
    const pid = await api.createProject(uniqueName(label), [...MODULES])
    await useProject(pid, [...MODULES])
    return pid
}

async function scopeId(api: ApiClient): Promise<string> {
    return api.resolveOrganizationId()
}

async function openAccessTeamsTab(page: Page, projectId: string): Promise<void> {
    await openProjectSettingsTab(page, projectId, 'access')
    await page.getByRole('tab', { name: 'Команды', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Группы доступа' })).toBeVisible({
        timeout: 30_000,
    })
}

test('#105: open Доступ → Команды → list AccessUnits', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-list')
    const sid = await scopeId(api)
    const unitName = uniqueName('unit-list')
    let unitId: string | undefined

    try {
        const created = await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitName,
            kind: 'department',
        })
        unitId = created.id

        await openAccessTeamsTab(page, pid)
        await expect(page.getByRole('tab', { name: 'Команды', exact: true })).toBeVisible()
        await expect(page.getByText(unitName)).toBeVisible()
        await expect(page.getByText('Отдел', { exact: true }).first()).toBeVisible()
    } finally {
        if (unitId) await api.archiveAccessUnit(unitId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#106: create group kinds department/team/territory/custom', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-kinds')
    const createdIds: string[] = []

    try {
        await openAccessTeamsTab(page, pid)

        for (const [kind, label] of Object.entries(KIND_LABELS)) {
            const name = uniqueName(`unit-${kind}`)
            await page.getByRole('button', { name: 'Создать группу' }).click()
            await expect(page.getByRole('heading', { name: 'Создать группу' })).toBeVisible()
            await page.getByPlaceholder('Название группы').fill(name)
            await pickLabeledSelect(page, 'Тип', label)
            await page.getByRole('button', { name: 'Создать', exact: true }).click()
            await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 })
            await expect(page.getByText(label).first()).toBeVisible()

            const sid = await scopeId(api)
            const units = await api.listAccessUnits(sid)
            const row = units.find((u) => u.name === name)
            if (row?.id) createdIds.push(String(row.id))
        }
    } finally {
        for (const id of createdIds) await api.archiveAccessUnit(id).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#107: edit group name/kind/parent/leader', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-edit')
    const sid = await scopeId(api)
    const parentName = uniqueName('unit-parent')
    const childName = uniqueName('unit-child')
    const editedName = uniqueName('unit-edited')
    let parentId: string | undefined
    let childId: string | undefined

    try {
        parentId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: parentName,
            kind: 'department',
        })).id
        childId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: childName,
            kind: 'team',
        })).id

        const employees = await api.listEmployees()
        const leader = employees.find((e) => e.name || e.userId)
        const leaderLabel = String(leader?.name ?? leader?.userId ?? '')

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, childName).getByRole('button', { name: 'Изм.' }).click()
        await expect(page.getByRole('heading', { name: 'Изменить группу' })).toBeVisible()

        await page.getByPlaceholder('Название группы').fill(editedName)
        await pickLabeledSelect(page, 'Тип', 'Территория')
        await pickLabeledSelect(page, 'Родительская группа (иерархия)', parentName)
        if (leaderLabel) {
            await pickLabeledSelect(page, 'Руководитель', leaderLabel)
        }
        await page.getByRole('button', { name: 'Сохранить' }).click()

        await expect(page.getByText(editedName)).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('Территория', { exact: true }).first()).toBeVisible()
        if (leaderLabel) {
            await expect(page.getByText(leaderLabel)).toBeVisible()
        }
    } finally {
        if (childId) await api.archiveAccessUnit(childId).catch(() => undefined)
        if (parentId) await api.archiveAccessUnit(parentId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#108: add user to group members drawer', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-member')
    const sid = await scopeId(api)
    const unitName = uniqueName('unit-members')
    let unitId: string | undefined

    try {
        unitId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitName,
            kind: 'department',
        })).id

        const employees = await api.listEmployees()
        const member = employees.find((e) => e.name || e.userId)
        const memberLabel = String(member?.name ?? member?.userId ?? '')
        if (!memberLabel) throw new Error('No employees available for member picker')

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, unitName).getByRole('button', { name: 'Состав' }).click()
        await expect(page.getByRole('heading', { name: `Состав: ${unitName}` })).toBeVisible()

        await pickMembersDrawerSelect(page, memberLabel)
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()
        await expect(page.getByText(memberLabel)).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('участник', { exact: true }).first()).toBeVisible()
    } finally {
        if (unitId) await api.archiveAccessUnit(unitId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#109: nest group memberType=group with composition preview', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'access-units-nest')
    const sid = await scopeId(api)
    const hostName = uniqueName('unit-host')
    const nestedName = uniqueName('unit-nested')
    let hostId: string | undefined
    let nestedId: string | undefined

    try {
        hostId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: hostName,
            kind: 'department',
        })).id
        nestedId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: nestedName,
            kind: 'team',
        })).id

        const employees = await api.listEmployees()
        const member = employees.find((e) => e.name || e.userId)
        const memberLabel = String(member?.name ?? member?.userId ?? '')
        if (!memberLabel || !member?.userId) throw new Error('No employees for nested unit seed')

        await api.addAccessUnitMember(nestedId, {
            memberType: 'user',
            memberId: String(member.userId),
        })

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, hostName).getByRole('button', { name: 'Состав' }).click()
        await pickMembersDrawerMemberType(page, 'Вложенная группа (композиция)')
        await pickMembersDrawerSelect(page, nestedName)

        await expect(
            page.getByText(/Состав вырастет|Новых пользователей не добавит/),
        ).toBeVisible({ timeout: 15_000 })

        await page.getByRole('button', { name: 'Добавить', exact: true }).click()
        await expect(page.getByText(nestedName)).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('группа', { exact: true }).first()).toBeVisible()
    } finally {
        if (nestedId) await api.archiveAccessUnit(nestedId).catch(() => undefined)
        if (hostId) await api.archiveAccessUnit(hostId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#110: composition cycle toast 409', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-cycle')
    const sid = await scopeId(api)
    const unitAName = uniqueName('unit-cycle-a')
    const unitBName = uniqueName('unit-cycle-b')
    let unitAId: string | undefined
    let unitBId: string | undefined

    try {
        unitAId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitAName,
            kind: 'team',
        })).id
        unitBId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitBName,
            kind: 'team',
        })).id

        await api.addAccessUnitMember(unitAId, { memberType: 'group', memberId: unitBId })

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, unitBName).getByRole('button', { name: 'Состав' }).click()
        await pickMembersDrawerMemberType(page, 'Вложенная группа (композиция)')
        await pickMembersDrawerSelect(page, unitAName)
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()

        await expect(page.getByText('Циклическая вложенность недопустима.')).toBeVisible({
            timeout: 15_000,
        })
    } finally {
        if (unitBId) await api.archiveAccessUnit(unitBId).catch(() => undefined)
        if (unitAId) await api.archiveAccessUnit(unitAId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#111: parentId cycle toast', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-parent-cycle')
    const sid = await scopeId(api)
    const parentName = uniqueName('unit-parent-cycle')
    const childName = uniqueName('unit-child-cycle')
    let parentId: string | undefined
    let childId: string | undefined

    try {
        parentId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: parentName,
            kind: 'department',
        })).id
        childId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: childName,
            kind: 'team',
            parentId,
        })).id

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, parentName).getByRole('button', { name: 'Изм.' }).click()
        await pickLabeledSelect(page, 'Родительская группа (иерархия)', childName)
        await page.getByRole('button', { name: 'Сохранить' }).click()

        await expect(
            page.getByText('Недопустимая структура (цикл или конфликт уровней).'),
        ).toBeVisible({ timeout: 15_000 })
    } finally {
        if (childId) await api.archiveAccessUnit(childId).catch(() => undefined)
        if (parentId) await api.archiveAccessUnit(parentId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#112: 403 composition-add without rights on both groups', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'access-units-403')
    const sid = await scopeId(api)
    const hostName = uniqueName('unit-403-host')
    const nestedName = uniqueName('unit-403-nested')
    let hostId: string | undefined
    let nestedId: string | undefined

    try {
        hostId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: hostName,
            kind: 'custom',
        })).id
        nestedId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: nestedName,
            kind: 'custom',
        })).id

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, hostName).getByRole('button', { name: 'Состав' }).click()
        await pickMembersDrawerMemberType(page, 'Вложенная группа (композиция)')
        await pickMembersDrawerSelect(page, nestedName)

        await page.route(`**/v1/access-units/${hostId}/members`, (route) => {
            if (route.request().method() !== 'POST') return route.continue()
            return route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: '{"code":"FORBIDDEN"}',
            })
        })
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()

        await expect(
            page.getByText('Для вложения группы нужны права управления на обе группы.'),
        ).toBeVisible({ timeout: 15_000 })
    } finally {
        if (nestedId) await api.archiveAccessUnit(nestedId).catch(() => undefined)
        if (hostId) await api.archiveAccessUnit(hostId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#113: archive group confirm', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-archive')
    const sid = await scopeId(api)
    const unitName = uniqueName('unit-archive')
    let unitId: string | undefined

    try {
        unitId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitName,
            kind: 'custom',
        })).id

        await openAccessTeamsTab(page, pid)
        await expect(page.getByText(unitName)).toBeVisible()

        acceptNativeConfirm(page)
        await accessUnitCard(page, unitName).getByTitle('Архивировать').click()

        await expect(page.getByText(unitName)).toHaveCount(0, { timeout: 15_000 })
        unitId = undefined
    } finally {
        if (unitId) await api.archiveAccessUnit(unitId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#114: remove member from composition', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-remove-member')
    const sid = await scopeId(api)
    const unitName = uniqueName('unit-remove-member')
    let unitId: string | undefined

    try {
        unitId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitName,
            kind: 'team',
        })).id

        const employees = await api.listEmployees()
        const member = employees.find((e) => e.name || e.userId)
        const memberLabel = String(member?.name ?? member?.userId ?? '')
        if (!memberLabel) throw new Error('No employees available for member picker')

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, unitName).getByRole('button', { name: 'Состав' }).click()
        await pickMembersDrawerSelect(page, memberLabel)
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()
        await expect(page.getByText(memberLabel)).toBeVisible()

        await page.getByTitle('Убрать').click()
        await expect(page.getByText('В группе пока нет участников.')).toBeVisible({
            timeout: 15_000,
        })
    } finally {
        if (unitId) await api.archiveAccessUnit(unitId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#115: load error 5xx access-units', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'access-units-5xx')

    try {
        await page.route('**/v1/access-units**', (route) =>
            route.fulfill({ status: 500, body: '{"error":"fail"}' }),
        )
        await openAccessTeamsTab(page, pid)
        await expect(page.getByText('Не удалось загрузить группы доступа.')).toBeVisible()
        await expect(page.getByRole('button', { name: 'повторить' })).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test.describe('employee read-only access units', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#116: read-only without units:manage — no create button', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedProject(api, useProject, 'access-units-readonly')
        const emp = await seedOrgEmployee(api, 'access-units-readonly')

        try {
            await signInViaApi(page, emp.email, emp.password)
            await useProject(pid, [...MODULES])
            await openAccessTeamsTab(page, pid)

            await expect(page.getByRole('heading', { name: 'Группы доступа' })).toBeVisible()
            await expect(page.getByRole('button', { name: 'Создать группу' })).toHaveCount(0)
            await expect(page.getByRole('button', { name: 'Изм.' })).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })
})

test('#117: self-grant API refusal when actor adds themselves', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'access-units-self-grant')
    const sid = await scopeId(api)
    const unitName = uniqueName('unit-self-grant')
    let unitId: string | undefined

    try {
        unitId = (await api.createAccessUnit({
            scopeType: 'ORGANIZATION',
            scopeId: sid,
            name: unitName,
            kind: 'team',
        })).id

        const me = await api.getMe()
        if (!me?.userId) throw new Error('Cannot resolve admin user for self-grant test')
        const selfLabel = String(me.name ?? me.email ?? me.userId)

        await openAccessTeamsTab(page, pid)
        await accessUnitCard(page, unitName).getByRole('button', { name: 'Состав' }).click()
        await pickMembersDrawerSelect(page, selfLabel)

        await page.route(`**/v1/access-units/${unitId}/members`, (route) => {
            if (route.request().method() !== 'POST') return route.continue()
            return route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: '{"code":"FORBIDDEN","message":"self-grant denied"}',
            })
        })
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()

        await expect(page.getByText('Ошибка добавления участника.')).toBeVisible({
            timeout: 15_000,
        })
    } finally {
        if (unitId) await api.archiveAccessUnit(unitId).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test.fixme('#118: archived group visibility', async () => {
    /* Archived units filtered server-side; visibility rules need dedicated seed. */
})
