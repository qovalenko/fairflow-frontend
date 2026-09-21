import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { clearProjectContext } from '../support/projectContext'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products', '/v1/auth/forgot-password'] })

test('#44: выбор проекта из minimal → полный chrome восстанавливается', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('chrome-restore'), modules)
    await useProject(pid, modules)

    try {
        await page.goto('/account/projects')
        await clearProjectContext(page)
        await page.reload()
        await expect(byQa(page, 'host.createDropdown.trigger')).toHaveCount(0, {
            timeout: 20_000,
        })

        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.createDropdown.trigger')).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'host.search.trigger')).toBeVisible()
        await expect(byQa(page, 'host.projectSelector.trigger')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#61: выбор другого проекта → URL /p/newId/...', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pidA = await api.createProject(uniqueName('switch-url-a'), modules)
    const pidB = await api.createProject(uniqueName('switch-url-b'), modules)
    await useProject(pidA, modules)

    try {
        await page.goto(`/p/${pidA}/contacts`)
        await byQa(page, 'host.projectSelector.trigger').click()
        await byQa(page, 'host.projectSelector.item', { project: pidB }).click()
        await expect(page).toHaveURL(new RegExp(`/p/${pidB}/`), { timeout: 20_000 })
    } finally {
        await api.archiveProject(pidA)
        await api.archiveProject(pidB)
    }
})

test('#62: после switch запросы несут новый X-Project-Id', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pidA = await api.createProject(uniqueName('switch-hdr-a'), modules)
    const pidB = await api.createProject(uniqueName('switch-hdr-b'), modules)
    await useProject(pidA, modules)

    try {
        await page.goto(`/p/${pidA}`)
        const projectHeaders: string[] = []
        page.on('request', (req) => {
            const hdr = req.headers()['x-project-id']
            if (hdr && req.url().includes('/api/v1/')) projectHeaders.push(hdr)
        })

        await byQa(page, 'host.projectSelector.trigger').click()
        await byQa(page, 'host.projectSelector.item', { project: pidB }).click()
        await page.goto(`/p/${pidB}/contacts`)
        await page.waitForResponse(
            (r) => r.url().includes('/api/v1/contacts') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        expect(
            projectHeaders.some((h) => h === pidB),
            `X-Project-Id should include ${pidB}, saw: ${projectHeaders.join(', ')}`,
        ).toBeTruthy()
    } finally {
        await api.archiveProject(pidA)
        await api.archiveProject(pidB)
    }
})

test('#69: шестерёнка ProjectSelector → /account/projects/:id/settings', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('selector-settings'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.projectSelector.trigger').click()
        await byQa(page, 'host.projectSelector.settings', { project: pid }).click()
        await expect(page).toHaveURL(
            new RegExp(`/account/projects/${pid}/settings`),
            { timeout: 20_000 },
        )
    } finally {
        await api.archiveProject(pid)
    }
})

test('#64: ST-4 поиск проекта без совпадений → «Ничего не найдено»', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pids: string[] = []
    for (let i = 0; i < 6; i++) {
        pids.push(await api.createProject(uniqueName(`search-th-${i}`), modules))
    }
    await useProject(pids[0], modules)

    try {
        await page.goto(`/p/${pids[0]}`)
        await byQa(page, 'host.projectSelector.trigger').click()
        await page.locator('[data-qa="host.projectSelector.search"]').fill('zzznomatch999')
        await expect(page.getByText('Ничего не найдено')).toBeVisible({ timeout: 15_000 })
    } finally {
        for (const id of pids) await api.archiveProject(id)
    }
})

test('#146: клик avatar в user-menu → /account/profile', async ({ page }) => {
    await page.goto('/account/projects')
    await byQa(page, 'host.userMenu.trigger').click()
    await page.getByRole('link', { name: /admin@fairflow\.local/i }).click()
    await expect(page).toHaveURL(/\/account\/profile/, { timeout: 20_000 })
})

test('#167: ссылка «Изменить email» → /account/profile/change-email', async ({ page }) => {
    await page.goto('/account/profile')
    await page.getByRole('button', { name: 'Редактировать профиль' }).click()
    await page.getByRole('link', { name: 'Изменить' }).click()
    await expect(page).toHaveURL(/\/account\/profile\/change-email/, { timeout: 20_000 })
})

test.describe('forgot password (unauthenticated)', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#31: forgot password — email → «письмо отправлено»', async ({ page }) => {
        await page.route('**/v1/auth/forgot-password', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
        )
        await page.goto('/auth/forgot-password')
        await page.getByPlaceholder('Эл. почта').fill('user@fairflow.local')
        await page.getByRole('button', { name: 'Отправить' }).click()
        await expect(page.getByText('Проверьте почту')).toBeVisible({ timeout: 15_000 })
        await expect(
            page.getByText('Мы отправили инструкцию по восстановлению пароля'),
        ).toBeVisible()
    })
})

test('#113: quick-create «Сделка» → real API', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('qc-deal'), modules)
    await useProject(pid, modules)
    const dealName = uniqueName('deal')

    try {
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.createDropdown.trigger').click()
        await byQa(page, 'host.createDropdown.item', { entity: 'deal' }).click()
        await expect(byQa(page, 'host.entityCreate.drawer', { entity: 'deal' })).toBeVisible()
        await byQa(page, 'host.create.deal.name').fill(dealName)
        await byQa(page, 'host.create.deal.amount').fill('10000')

        const createPromise = page.waitForResponse(
            (r) => r.url().includes('/api/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.entityCreate.submit', { entity: 'deal' }).click()
        const createRes = await createPromise
        expect(createRes.ok(), 'deal POST should succeed').toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#55: после success /p/:id резолвится ProjectHomeRedirect в первый модуль', async ({
    page,
    api,
}) => {
    const projectName = uniqueName('home-after-create')
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
            await next.click()
        }
        await submit.click()

        await expect(page).toHaveURL(/\/p\/[^/]+\//, { timeout: 45_000 })
        createdProjectId = page.url().match(/\/p\/([^/?#]+)/)?.[1]
        expect(createdProjectId, 'project id parsed from URL').toBeTruthy()
        await expect(page).not.toHaveURL(new RegExp(`/p/${createdProjectId}$`))
    } finally {
        if (createdProjectId) await api.archiveProject(createdProjectId)
        else await api.cleanupProjects()
    }
})

test('#76: /members, /roles, /audit доступны по правам в portfolio chrome', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('pm-routes'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}/members`)
        await expect(page).toHaveURL(/\/members/, { timeout: 20_000 })

        await page.goto(`/p/${pid}/roles`)
        await expect(page).toHaveURL(/\/roles/, { timeout: 20_000 })

        await page.goto(`/p/${pid}/audit`)
        await expect(page).toHaveURL(/\/audit/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#108: /members — список участников загружается', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('members-list'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}/members`)
        await expect(page.getByRole('heading', { name: 'Участники проекта', level: 3 })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#153: /dashboard загружает statistics remote', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('dashboard'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}/dashboard`)
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 45_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#147: toggle dark/light theme в user-menu persist', async ({ page }) => {
    await page.goto('/account/profile')
    const isDarkBefore = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
    )
    await byQa(page, 'host.userMenu.trigger').click()
    await page.getByText('Тема').click()
    await expect
        .poll(async () =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        )
        .not.toBe(isDarkBefore)

    await page.reload()
    await expect
        .poll(async () =>
            page.evaluate(() => document.documentElement.classList.contains('dark')),
        )
        .not.toBe(isDarkBefore)
})
