import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

/**
 * Catalog #179 — deals MFE in VITE_STANDALONE_MODE (separate preview server).
 * Run: `cd modules/deals && npm run build:standalone && npm run preview:standalone -- --port 5020`
 * then `DEALS_STANDALONE_URL=http://localhost:5020 npx playwright test tests/22-deals-standalone.spec.ts`
 */
test('#179: standalone MFE opens deals list without host shell', async ({ page, api, useProject }) => {
    const standaloneUrl = process.env.DEALS_STANDALONE_URL?.replace(/\/$/, '')
    test.skip(!standaloneUrl, 'DEALS_STANDALONE_URL not set — standalone preview not running')

    const pid = await api.createProject(uniqueName('standalone-deals'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    try {
        await page.goto(`${standaloneUrl}/deals`)
        await expect(byQa(page, 'deals.list.create').or(byQa(page, 'deals.list.empty'))).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})
