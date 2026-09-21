/**
 * Shared test setup, loaded before every test file (host + remotes).
 *
 * Registers `@testing-library/jest-dom` matchers and DOM cleanup. IMPORTANT: we
 * use the vitest GLOBALS (`expect`, `afterEach`, provided by `globals: true`)
 * rather than importing them from `'vitest'`. This shared file is loaded
 * cross-workspace (a remote's vitest install differs from the host's), so a bare
 * `import { expect } from 'vitest'` would grab the WRONG instance and the matcher
 * extension / hooks would silently not apply to the running suite. The matcher
 * objects are framework-agnostic, so resolving them from host node_modules is fine.
 */
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'

expect.extend(matchers)

afterEach(() => {
    cleanup()
    // Zustand persist + our project store write to localStorage; wipe it so each
    // test starts from a clean slate (auth/project regression tests rely on this).
    localStorage.clear()
    sessionStorage.clear()
})
