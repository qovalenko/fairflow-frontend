import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    resolveSystemId,
    seedEmployeeWithoutProjects,
    seedOwnerWithoutProjects,
    stubEmptyProjectsList,
} from '../support/shell'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

test('#9: нет проектов у владельца → /onboarding entry-choice', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedOwnerWithoutProjects(page, systemId)
    await page.goto('/')
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/onboarding\/no-projects/)
})

test('#10: нет проектов у сотрудника → /onboarding/no-projects', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedEmployeeWithoutProjects(page, systemId)
    await page.goto('/')
    await expect(page).toHaveURL(/\/onboarding\/no-projects/, { timeout: 30_000 })
    await expect(
        page.getByRole('heading', { name: 'Вы ещё не добавлены ни в один проект' }),
    ).toBeVisible()
})

test('#43: E1 нет ни одного проекта → onboarding / no-projects', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedEmployeeWithoutProjects(page, systemId)
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/onboarding\/no-projects/, { timeout: 30_000 })
})

test('#68: «Создать проект» (+) в селекторе → /account/projects/new', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('selector-create'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.projectSelector.trigger')).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'host.projectSelector.trigger').click()
        await byQa(page, 'host.projectSelector.create').click()
        await expect(page).toHaveURL(/\/account\/projects\/new/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#70: ST-3 нет проектов → empty item в ProjectSelector', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('selector-empty'), modules)
    await useProject(pid, modules)
    try {
        await stubEmptyProjectsList(page)
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.projectSelector.trigger')).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'host.projectSelector.trigger').click()
        await expect(byQa(page, 'host.projectSelector.empty')).toBeVisible({
            timeout: 15_000,
        })
        await expect(byQa(page, 'host.projectSelector.empty')).toContainText('Нет проектов')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#177: /account/projects ST-3 empty — карточки проектов отсутствуют', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedOwnerWithoutProjects(page, systemId)
    await page.goto('/account/projects')
    await expect(byQa(page, 'host.projectsList.empty')).toBeVisible({ timeout: 30_000 })
    await expect(byQa(page, 'host.projectsList.empty')).toContainText('У вас пока нет проектов')
})
