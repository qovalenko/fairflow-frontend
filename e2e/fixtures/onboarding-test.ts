import { test as base, expect } from './test'
import { ApiClient } from './api'
import { STORAGE_STATE } from '../support/env'

/**
 * Onboarding suite fixture: reuse JWT from storageState for API seeding (one client
 * per worker, no extra /v1/auth/login calls).
 */
export const test = base.extend<{}, { workerApi: ApiClient }>({
    workerApi: [
        async ({}, use) => {
            const client = await ApiClient.loginOrCached(STORAGE_STATE)
            await use(client)
            await client.dispose()
        },
        { scope: 'worker' },
    ],

    api: async ({ workerApi }, use) => {
        await use(workerApi)
    },
})

export { expect }
