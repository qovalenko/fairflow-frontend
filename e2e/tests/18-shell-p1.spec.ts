import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { clearProjectContext } from '../support/projectContext'
import {
    blockFeManifest,
    UNKNOWN_PROJECT_ID,
} from '../support/shell'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

test('#12: все бизнес-модули выключены → fallback /account/projects', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('no-biz-mod'), ['deals', 'contacts'])
    await useProject(pid, ['deals', 'contacts'])
    try {
        await api.updateProjectModules(pid, [])
        await page.goto(`/p/${pid}/deals`)
        await expect(page).toHaveURL(/\/account\/projects/, { timeout: 45_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#3: fe-manifest недоступен → экран ошибки и «Обновить»', async ({ page }) => {
    await blockFeManifest(page)
    await page.goto('/account/projects')
    await expect(page.getByRole('heading', { name: 'Не удалось загрузить модули' })).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'Обновить' })).toBeVisible()
})

test('#11: есть проекты, но не выбран активный → /account/projects', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('no-active'), modules)
    await useProject(pid, modules)
    try {
        await page.goto('/account/projects')
        await clearProjectContext(page)
        await page.reload()
        await page.goto('/deals')
        await expect(page).toHaveURL(/\/account\/projects/, { timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#47: пользователь с проектами не видит /onboarding', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('onb-block'), modules)
    await useProject(pid, modules)
    try {
        await page.goto('/onboarding')
        await expect(page).not.toHaveURL(/\/onboarding$/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#59: /p/:unknownPid → NotFound ST-9', async ({ page }) => {
    await page.goto(`/p/${UNKNOWN_PROJECT_ID}`)
    await expect(page.getByText('Страница не найдена')).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByText(UNKNOWN_PROJECT_ID)).toBeVisible()
})

test('#60: пустое меню проекта → fallback /account/projects', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('empty-menu'), ['deals', 'contacts'])
    await useProject(pid, ['deals', 'contacts'])
    try {
        await api.updateProjectModules(pid, [])
        await page.goto(`/p/${pid}`)
        await expect(page).toHaveURL(/\/account\/projects/, { timeout: 45_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#75: /search доступен без включения search-модуля', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search-cross'), modules)
    await useProject(pid, modules)
    try {
        await page.goto('/search')
        await expect(page).toHaveURL(/\/search/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#90: locked/system module (deals) — toggle недоступен', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('locked-deals'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/account/projects/${pid}/settings/modules`)
        const dealsToggle = byQa(page, 'host.projectSettings.moduleToggle', { module: 'deals' })
        await expect(dealsToggle).toBeAttached({ timeout: 30_000 })
        await expect(dealsToggle).toBeDisabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#98: deep-link .../settings/policies открывает вкладку «Доступ»', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('policies-tab'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/account/projects/${pid}/settings/policies`)
        await expect(page.getByRole('tab', { name: 'Доступ' })).toHaveAttribute(
            'aria-selected',
            'true',
            { timeout: 30_000 },
        )
    } finally {
        await api.archiveProject(pid)
    }
})

test('#120: выключенный модуль отсутствует в CreateDropdown', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'companies']
    const pid = await api.createProject(uniqueName('qc-off'), modules)
    await useProject(pid, modules)
    try {
        await api.updateProjectModules(pid, ['deals', 'contacts'])
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.createDropdown.trigger').click()
        await expect(byQa(page, 'host.createDropdown.item', { entity: 'company' })).toHaveCount(0)
        await expect(byQa(page, 'host.createDropdown.item', { entity: 'contact' })).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#148: user-menu «Система» → /settings', async ({ page }) => {
    await page.goto('/account/profile')
    await byQa(page, 'host.userMenu.trigger').click()
    await page.getByRole('link', { name: /Система|Fairflow/i }).click()
    await expect(page).toHaveURL(/\/settings$/, { timeout: 20_000 })
})

test('#74: прямой URL выключенного модуля → guard redirect', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts', 'companies']
    const pid = await api.createProject(uniqueName('guard-off'), modules)
    await useProject(pid, modules)
    try {
        await api.updateProjectModules(pid, ['deals', 'contacts'])
        await page.goto(`/p/${pid}/companies`)
        await expect(page).not.toHaveURL(/\/companies/, { timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#116: нет проекта → CreateDropdown не монтируется', async ({ page }) => {
    await page.goto('/account/projects')
    await clearProjectContext(page)
    await page.reload()
    await expect(byQa(page, 'host.createDropdown.trigger')).toHaveCount(0, {
        timeout: 20_000,
    })
})

test('#155: падение statistics remote → fallback boundary, chrome жив', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('stats-fail'), modules)
    await useProject(pid, modules)
    try {
        await page.route('**/frontend/statistics/**', (route) =>
            route.fulfill({ status: 500, body: 'statistics unavailable' }),
        )
        await page.goto(`/p/${pid}/dashboard`)
        await expect(
            byQa(page, 'host.remoteError.fallback', { module: 'portfolio.dashboard' }),
        ).toBeVisible({ timeout: 45_000 })
        await expect(byQa(page, 'host.userMenu.trigger')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#179: клик карточки проекта → settings проекта', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const name = uniqueName('card-nav')
    const pid = await api.createProject(name, modules)
    await useProject(pid, modules)
    try {
        await page.goto('/account/projects')
        await byQa(page, 'host.projectsList.card', { project: pid }).click()
        await expect(page).toHaveURL(
            new RegExp(`/account/projects/${pid}/settings`),
            { timeout: 20_000 },
        )
    } finally {
        await api.archiveProject(pid)
    }
})

test('#198: неизвестный path → NotFound ST-9', async ({ page }) => {
    const unknown = `/ff-e2e-unknown-${Date.now()}`
    await page.goto(unknown)
    await expect(page.getByText('Страница не найдена')).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByText(unknown)).toBeVisible()
})

test('#134: search module-policy deny → лупа скрыта', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search-deny'), modules)
    await useProject(pid, modules)
    try {
        await api.updateProjectModulePolicies(pid, [
            {
                id: 'e2e-deny-search-read',
                moduleId: 'search',
                effect: 'deny',
                subject: '*',
                action: 'search:read',
                resource: '*',
                condition: {},
            },
        ])
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.search.trigger')).toHaveCount(0, { timeout: 30_000 })
        await page.goto('/search')
        await expect(page).not.toHaveURL(/\/search$/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})
