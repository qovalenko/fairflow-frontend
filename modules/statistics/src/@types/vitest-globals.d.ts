/**
 * Ambient test types so `tsc --noEmit` knows vitest globals + jest-dom matchers
 * for the co-located `*.test.tsx` specs. Runtime setup: host/testing/vitest.shared.ts.
 *
 * Почему `reference path` на host, а не `reference types="vitest/globals"`:
 * этот remote не ставит собственных тестовых зависимостей (vitest/RTL берутся
 * из `host/node_modules` — тем же пином, что React и роутер, см.
 * `vitest.config.ts`), а директива `reference types` резолвится НЕ через
 * `paths` из tsconfig, только через node_modules/typeRoots — то есть у модуля
 * не нашлась бы. Путь ведёт на ту же копию, что реально исполняет тесты.
 */
/// <reference path="../../../../host/node_modules/vitest/globals.d.ts" />
import '@testing-library/jest-dom/vitest'
