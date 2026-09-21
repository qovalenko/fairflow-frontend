import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { toggleSwitcher } from '../support/ui'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

test('#57: seed demo toggle не ломает submit мастера', async ({ page, api }) => {
    const projectName = uniqueName('seed-demo')
    let createdProjectId: string | undefined

    try {
        await page.goto('/account/projects/new')
        const template = byQa(page, 'host.createProject.template').first()
        await expect(template).toBeVisible({ timeout: 30_000 })
        await template.click()
        await byQa(page, 'host.createProject.next').click()
        await byQa(page, 'host.createProject.name').fill(projectName)

        const submit = byQa(page, 'host.createProject.submit')
        const next = byQa(page, 'host.createProject.next')
        for (let i = 0; i < 4 && !(await submit.isVisible()); i++) {
            if (await byQa(page, 'host.createProject.seedDemo').isVisible()) {
                await toggleSwitcher(byQa(page, 'host.createProject.seedDemo'))
            }
            await next.click()
        }

        await expect(submit).toBeVisible()
        await submit.click()
        await expect(page).toHaveURL(/\/p\/[^/]+/, { timeout: 45_000 })
        createdProjectId = page.url().match(/\/p\/([^/?#]+)/)?.[1]
        expect(createdProjectId, 'project id parsed from URL').toBeTruthy()
    } finally {
        if (createdProjectId) await api.archiveProject(createdProjectId)
        else await api.cleanupProjects()
    }
})

test('#80: Logo → authenticated entry path', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('logo-home'), modules)
    await useProject(pid, modules)
    try {
        await page.goto('/account/projects')
        await expect(byQa(page, 'host.chrome.logo')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.chrome.logo').click()
        await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#133: ST-28 пометка свежести индекса в overlay поиска', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search-lag'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.search.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.search.trigger').click()
        await expect(byQa(page, 'host.search.dialog.footer.lag')).toBeVisible({
            timeout: 15_000,
        })
        await expect(byQa(page, 'host.search.dialog.footer.lag')).toContainText(
            'Индекс может обновляться с задержкой',
        )
    } finally {
        await api.archiveProject(pid)
    }
})

test('#136: ST-3 empty «нет уведомлений» в колокольчике', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('notif-empty'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.notifications.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.notifications.trigger').click()
        await expect(page.getByText('Нет уведомлений')).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#139: «Все уведомления» → /account/notifications', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('notif-all'), modules)
    await useProject(pid, modules)
    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.notifications.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.notifications.trigger').click()
        await byQa(page, 'host.notifications.viewAll').click()
        await expect(page).toHaveURL(/\/account\/notifications/, { timeout: 20_000 })
        await expect(page.getByRole('heading', { name: 'Все уведомления' })).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#160: «Обновить» в remote boundary делает reload', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('remote-reload'), modules)
    await useProject(pid, modules)
    try {
        await page.route('**/frontend/deals/**', (route) =>
            route.fulfill({ status: 500, body: 'remote unavailable' }),
        )
        await page.goto(`/p/${pid}/deals`)
        await expect(
            byQa(page, 'host.remoteError.fallback', { module: 'deals' }),
        ).toBeVisible({ timeout: 45_000 })
        await expect(byQa(page, 'host.remoteError.reload')).toBeVisible({ timeout: 15_000 })
        let reloadSeen = false
        page.on('load', () => {
            reloadSeen = true
        })
        await byQa(page, 'host.remoteError.reload').click()
        await expect.poll(() => reloadSeen, { timeout: 15_000 }).toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#169: security — пароли не совпадают → inline ST-7', async ({ page }) => {
    await page.goto('/account/security')
    await expect(page.getByRole('heading', { name: 'Безопасность' })).toBeVisible({
        timeout: 30_000,
    })
    await page.getByPlaceholder('Новый пароль').fill('NewPassword123!')
    await page.getByPlaceholder('Повторите новый пароль').fill('DifferentPassword123!')
    await expect(page.getByText('Пароли не совпадают')).toBeVisible()
    await expect(
        page.getByRole('button', { name: 'Изменить пароль' }),
    ).toBeDisabled()
})

test('#180: SettingsNav подсветка active route', async ({ page }) => {
    await page.goto('/account/security')
    const securityLink = page.getByRole('link', { name: 'Безопасность' })
    await expect(securityLink).toBeVisible({ timeout: 30_000 })
    await expect(securityLink).toHaveAttribute('aria-current', 'page')
})

test('#194: /help hub загружается', async ({ page }) => {
    await page.goto('/help')
    await expect(
        page.getByRole('heading', { level: 2, name: 'Центр поддержки' }),
    ).toBeVisible({
        timeout: 20_000,
    })
})

test('#195: ST-4 help — поиск без статей', async ({ page }) => {
    const q = `zzznohit${Date.now()}`
    await page.goto(`/help?q=${q}`)
    await expect(page.getByText('Ничего не найдено')).toBeVisible({ timeout: 20_000 })
})

test('#196: /terms статическая страница', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Правила использования', level: 1 })).toBeVisible({
        timeout: 20_000,
    })
})

test('#197: /access-denied ST-10 route-level', async ({ page }) => {
    await page.goto('/access-denied')
    await expect(page.getByRole('heading', { name: 'Access Denied!' })).toBeVisible({
        timeout: 20_000,
    })
})

test.fixme(
    '#208: BUG deep-link /p/:pid/settings/modules не редиректит в /account/projects/:pid/settings/modules — URL остаётся portfolio',
    async ({ page, api, useProject }) => {
        const modules = ['deals', 'contacts']
        const pid = await api.createProject(uniqueName('settings-alias'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`/p/${pid}/settings/modules`)
            await expect(page).toHaveURL(
                new RegExp(`/account/projects/${pid}/settings/modules`),
                { timeout: 20_000 },
            )
        } finally {
            await api.archiveProject(pid)
        }
    },
)

test.fixme(
    '#48: BUG onboarding «Справка» → /help — ссылка отсутствует в box UI',
    async ({ page }) => {
        await page.goto('/onboarding')
        await page.getByRole('link', { name: 'Справка' }).click()
        await expect(page).toHaveURL(/\/help/)
    },
)
