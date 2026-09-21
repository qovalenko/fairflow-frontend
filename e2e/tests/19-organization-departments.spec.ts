import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { ApiClient } from '../fixtures/api'
import { DATA_PREFIX, uniqueName } from '../support/env'
import { signInViaApi } from '../support/login'
import {
    acceptNativeConfirm,
    openSettingsPage,
    pickLabeledSelect,
    seedOrgEmployee,
} from '../support/organization'

async function openDepartments(page: Page) {
    await openSettingsPage(page, '/settings/departments', 'Подразделения')
}

/** Delete test departments (children before parents). */
async function cleanupPrefixedDepartments(api: ApiClient, labelFragment = 'dept-') {
    const all = await api.listDepartments()
    const targets = all.filter(
        (d) => d.name.startsWith(DATA_PREFIX) && d.name.includes(labelFragment),
    )
    const byId = new Map(all.map((d) => [d.id, d]))
    const depth = (id: string): number => {
        let d = 0
        let cur = byId.get(id)
        while (cur?.parentId) {
            d++
            cur = byId.get(cur.parentId)
        }
        return d
    }
    targets.sort((a, b) => depth(b.id) - depth(a.id))
    for (const d of targets) {
        try {
            await api.deleteDepartment(d.id)
        } catch {
            /* 409 — still has employees/children */
        }
    }
}

async function openDeptDrawer(page: Page, deptName: string) {
    const row = page.locator('div').filter({ hasText: deptName }).first()
    await row.getByTitle('Редактировать').click()
    await expect(page.getByText('Редактировать отдел')).toBeVisible()
}

test('#20: empty tree message when no departments remain', async ({ page, api }) => {
    await cleanupPrefixedDepartments(api)
    const remaining = await api.listDepartments()
    const nonTest = remaining.filter((d) => !d.name.startsWith(DATA_PREFIX))
    test.skip(nonTest.length > 0, 'Stand has non-test departments — empty state not reachable')

    await openDepartments(page)
    await expect(page.getByText('Подразделений пока нет.')).toBeVisible()
})

test('#21: create root department via drawer', async ({ page, api }) => {
    const name = uniqueName('dept-root')
    let deptId: string | undefined

    try {
        await openDepartments(page)
        await page.getByRole('button', { name: 'Создать отдел' }).click()
        await expect(page.getByRole('heading', { name: 'Создать отдел' })).toBeVisible()
        await page.getByPlaceholder('Введите название отдела').fill(name)
        await page.getByRole('button', { name: 'Создать', exact: true }).click()
        await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 })

        const created = (await api.listDepartments()).find((d) => d.name === name)
        deptId = created?.id
    } finally {
        if (deptId) await api.deleteDepartment(deptId).catch(() => undefined)
    }
})

test('#22: create child department with parent', async ({ page, api }) => {
    const parentName = uniqueName('dept-parent')
    const childName = uniqueName('dept-child')
    let parentId: string | undefined
    let childId: string | undefined

    try {
        const parent = await api.createDepartment({ name: parentName })
        parentId = parent.id

        await openDepartments(page)
        await page.getByRole('button', { name: 'Создать отдел' }).click()
        await page.getByPlaceholder('Введите название отдела').fill(childName)
        await pickLabeledSelect(page, 'Родительский отдел', parentName)
        await page.getByRole('button', { name: 'Создать', exact: true }).click()
        await expect(page.getByText(childName)).toBeVisible({ timeout: 15_000 })

        const child = (await api.listDepartments()).find((d) => d.name === childName)
        childId = child?.id
        expect(child?.parentId).toBe(parentId)
    } finally {
        if (childId) await api.deleteDepartment(childId).catch(() => undefined)
        if (parentId) await api.deleteDepartment(parentId).catch(() => undefined)
    }
})

test('#23: edit department — rename, change parent, assign leader', async ({ page, api }) => {
    const emp = await seedOrgEmployee(api, 'dept-emp', 'employee', 'E2eDeptPass1!')
    const rootName = uniqueName('dept-edit-root')
    const leafName = uniqueName('dept-edit-leaf')
    const renamed = uniqueName('dept-edit-renamed')
    let rootId: string | undefined
    let leafId: string | undefined

    try {
        const root = await api.createDepartment({ name: rootName })
        rootId = root.id
        const leaf = await api.createDepartment({ name: leafName, parentId: rootId })
        leafId = leaf.id

        await openDepartments(page)
        await openDeptDrawer(page, leafName)
        await page.getByPlaceholder('Введите название отдела').fill(renamed)
        await pickLabeledSelect(page, 'Родительский отдел', 'Без родительского отдела')
        await pickLabeledSelect(page, 'Руководитель', emp.name)
        await page.getByRole('button', { name: 'Сохранить' }).click()

        await expect(page.getByText(renamed)).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(/Руководитель:/)).toBeVisible()
        await expect(page.getByText(emp.name)).toBeVisible()
    } finally {
        if (leafId) await api.deleteDepartment(leafId).catch(() => undefined)
        if (rootId) await api.deleteDepartment(rootId).catch(() => undefined)
    }
})

test('#24: expand and collapse tree node', async ({ page, api }) => {
    const parentName = uniqueName('dept-expand-parent')
    const childName = uniqueName('dept-expand-child')
    let parentId: string | undefined
    let childId: string | undefined

    try {
        const parent = await api.createDepartment({ name: parentName })
        parentId = parent.id
        const child = await api.createDepartment({ name: childName, parentId: parentId })
        childId = child.id

        await openDepartments(page)
        const parentRow = page.locator('div.font-medium', { hasText: parentName })
        const expandBtn = parentRow.locator('xpath=ancestor::div[contains(@class,"flex")][1]').locator('button').first()

        await expandBtn.click()
        await expect(page.getByText(childName)).toBeVisible()
        await expandBtn.click()
        await expect(page.getByText(childName)).toHaveCount(0)
    } finally {
        if (childId) await api.deleteDepartment(childId).catch(() => undefined)
        if (parentId) await api.deleteDepartment(parentId).catch(() => undefined)
    }
})

test('#25: summary aggregates visible on row — employee count text', async ({ page, api }) => {
    const name = uniqueName('dept-summary')
    let deptId: string | undefined

    try {
        const dept = await api.createDepartment({ name })
        deptId = dept.id
        await openDepartments(page)
        const row = page.locator('div').filter({ has: page.locator('.font-medium', { hasText: name }) })
        await expect(row.getByText(/сотрудников/)).toBeVisible()
    } finally {
        if (deptId) await api.deleteDepartment(deptId).catch(() => undefined)
    }
})

test('#26: delete empty leaf department — confirm dialog and success toast', async ({ page, api }) => {
    const name = uniqueName('dept-del-leaf')
    let deptId: string | undefined

    try {
        const dept = await api.createDepartment({ name })
        deptId = dept.id
        await openDepartments(page)

        acceptNativeConfirm(page)
        const row = page.locator('div').filter({ has: page.locator('.font-medium', { hasText: name }) })
        await row.getByTitle('Удалить').click()

        await expect(page.getByText('Отдел удалён')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText(name)).toHaveCount(0)
        deptId = undefined
    } finally {
        if (deptId) await api.deleteDepartment(deptId).catch(() => undefined)
    }
})

test('#27: delete non-empty department — toast shows 409 message about employees', async ({
    page,
    api,
}) => {
    const emp = await seedOrgEmployee(api, 'dept-emp', 'employee', 'E2eDeptPass1!')
    const name = uniqueName('dept-del-full')
    let deptId: string | undefined

    try {
        const dept = await api.createDepartment({ name })
        deptId = dept.id
        await api.updateEmployee(emp.userId, { departmentId: deptId })

        await openDepartments(page)
        acceptNativeConfirm(page)
        const row = page.locator('div').filter({ has: page.locator('.font-medium', { hasText: name }) })
        await row.getByTitle('Удалить').click()

        await expect(page.getByText(/В отделе есть сотрудники/)).toBeVisible({ timeout: 15_000 })
    } finally {
        if (deptId) {
            await api.updateEmployee(emp.userId, { departmentId: null }).catch(() => undefined)
            await api.deleteDepartment(deptId).catch(() => undefined)
        }
    }
})

test('#28: reparent to descendant — save error on invalid hierarchy', async ({ page, api }) => {
    const parentName = uniqueName('dept-cycle-parent')
    const childName = uniqueName('dept-cycle-child')
    let parentId: string | undefined
    let childId: string | undefined

    try {
        const parent = await api.createDepartment({ name: parentName })
        parentId = parent.id
        const child = await api.createDepartment({ name: childName, parentId: parentId })
        childId = child.id

        await openDepartments(page)
        await openDeptDrawer(page, parentName)
        await pickLabeledSelect(page, 'Родительский отдел', childName)
        await page.getByRole('button', { name: 'Сохранить' }).click()

        await expect(page.getByText('Не удалось сохранить отдел.')).toBeVisible()
    } finally {
        if (childId) await api.deleteDepartment(childId).catch(() => undefined)
        if (parentId) await api.deleteDepartment(parentId).catch(() => undefined)
    }
})

test('#29: load error — departments GET 500 shows error message', async ({ page }) => {
    await page.route('**/v1/system/departments', (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({ status: 500, body: '{"error":"fail"}' })
        }
        return route.continue()
    })
    await openDepartments(page)
    await expect(page.getByText(/Не удалось загрузить/)).toBeVisible()
})

test.describe('employee session', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#30: employee read-only — no CRUD buttons', async ({ page, api }) => {
        const emp = await seedOrgEmployee(api, 'dept-emp', 'employee', 'E2eDeptPass1!')
        await signInViaApi(page, emp.email, emp.password)
        await openDepartments(page)

        await expect(page.getByRole('button', { name: 'Создать отдел' })).toHaveCount(0)
        await expect(page.getByTitle('Редактировать')).toHaveCount(0)
        await expect(page.getByTitle('Удалить')).toHaveCount(0)
    })
})

test('#31: assign leader visible in tree row', async ({ page, api }) => {
    const emp = await seedOrgEmployee(api, 'dept-emp', 'employee', 'E2eDeptPass1!')
    const name = uniqueName('dept-leader')
    let deptId: string | undefined

    try {
        const dept = await api.createDepartment({ name, leaderUserId: emp.userId })
        deptId = dept.id
        await openDepartments(page)
        const row = page.locator('div').filter({ has: page.locator('.font-medium', { hasText: name }) })
        await expect(row.getByText('Руководитель:')).toBeVisible()
        await expect(row.getByText(emp.name)).toBeVisible()
    } finally {
        if (deptId) await api.deleteDepartment(deptId).catch(() => undefined)
    }
})
