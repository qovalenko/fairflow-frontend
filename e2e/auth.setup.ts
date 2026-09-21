import fs from 'node:fs'
import { test as setup, expect } from '@playwright/test'
import { BASE_URL, STORAGE_STATE } from './support/env'
import { signInViaApi, signInViaUi } from './support/login'
import { ApiClient } from './fixtures/api'

/**
 * Auth setup project: seeds an authenticated session once for the chromium project.
 * Uses REST login on remote stands because the hybrid host may fail to render
 * sign-in when fe-manifest from the stand is unavailable (limited shell mode).
 * On localhost prefers UI login (host.login.* qa-ids) to avoid hammering
 * `/v1/auth/login` during long suites.
 *
 * Reuses a fresh storageState when the JWT is still valid — avoids redundant
 * `/v1/auth/login` calls that trip single-session revoke and stand rate-limits.
 */
setup.setTimeout(65 * 60_000)

setup('authenticate admin via API', async ({ browser }) => {
    const cached = await ApiClient.fromStorageState()
    if (cached) {
        await cached.dispose()
        return
    }

    if (fs.existsSync(STORAGE_STATE)) {
        const reuseContext = await browser.newContext({ storageState: STORAGE_STATE })
        const reusePage = await reuseContext.newPage()
        const existing = await ApiClient.fromPageSession(reusePage)
        try {
            if (existing && (await existing.getMe())) {
                await reuseContext.storageState({ path: STORAGE_STATE })
                return
            }
        } finally {
            await existing?.dispose()
            await reuseContext.close()
        }
    }

    const context = await browser.newContext()
    const page = await context.newPage()
    if (BASE_URL.includes('localhost')) {
        await signInViaUi(page)
    } else {
        await signInViaApi(page)
    }

    await expect
        .poll(async () => page.evaluate(() => localStorage.getItem('token')), {
            timeout: 30_000,
        })
        .not.toBeNull()

    fs.mkdirSync('test-results/.auth', { recursive: true })
    await context.storageState({ path: STORAGE_STATE })
    await context.close()
    await ApiClient.resetSession()
})
