import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, STORAGE_STATE } from './support/env'

/**
 * Playwright config for the FairFlow e2e smoke harness (T-029).
 *
 * - BASE_URL from env (default https://stand.example.com; also works for https://<slug>.stand.example.com
 *   and the local hybrid http://localhost:5173).
 * - ignoreHTTPSErrors: internal ff-ca on the stand.
 * - headless chromium; trace + screenshot retained on failure for triage.
 * - `setup` project logs in once (UI) → storageState reused by the main project.
 *
 * data-qa-id selectors only resolve in a VITE_QA_IDS=true build, so the green
 * smoke run is against the LOCAL HYBRID (see README). The deployed prod stand
 * strips the attributes.
 */
export default defineConfig({
    testDir: './tests',
    outputDir: 'test-results/artifacts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
        [
            'allure-playwright',
            {
                resultsDir: 'allure-results',
                detail: true,
                suiteTitle: true,
            },
        ],
    ],
    timeout: 60_000,
    expect: { timeout: 10_000 },
    use: {
        baseURL: BASE_URL,
        ignoreHTTPSErrors: true,
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },
    projects: [
        {
            name: 'setup',
            // auth.setup.ts lives in the e2e root, not in the global testDir
            // (./tests), so scope this project to the root for it to be found.
            testDir: '.',
            testMatch: /auth\.setup\.ts/,
            timeout: 120_000,
        },
        {
            name: 'chromium',
            testMatch: /.*\.spec\.ts/,
            dependencies: ['setup'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: STORAGE_STATE,
            },
        },
    ],
})
