# Frontend test infrastructure (T-027)

Runner: **vitest 3** + **@testing-library/react 16** + **jsdom**. Tests live next to
the code as `*.test.ts` / `*.test.tsx` (also `*.spec.*` is picked up). shared-ui is a
**published package** (`@fairflow/shared-ui` from registry) — it is NOT in this
checkout, so we only test **host** and **modules/\***.

## Layout

```
host/
  testing/
    vitest.shared.ts     # single config factory (jsdom + RTL + React-singleton aliases)
    vitest.setup.ts      # jest-dom matchers + cleanup + storage wipe (loaded before every file)
    README-TESTING.md    # this file
  vitest.config.ts       # 2 lines: re-exports createVitestConfig()
  src/@types/vitest-globals.d.ts   # ambient vitest/jest-dom types for tsc
modules/deals/
  vitest.config.ts       # 2 lines: imports ../../host/testing/vitest.shared
  src/@types/vitest-globals.d.ts
```

### Why a hand-rolled config (not `extends: vite.config.ts`)

The app/remote `vite.config.ts` load `@originjs/vite-plugin-federation`, which
rewrites bare imports (`react`, `zustand`, …) into federation **virtual** modules.
Under vitest that virtual graph has no runtime host to resolve against → tests can't
import React. `vitest.shared.ts` builds a **minimal** vite pipeline (only
`@vitejs/plugin-react`) and never touches the federation plugin.

Remote-loading code paths (`loadRemoteModule` / dynamic `import('remote/…')`) must be
`vi.mock`-ed at the test boundary — they have no runtime under vitest.

### React singleton

`vitest.shared.ts` pins `react` / `react-dom` / jsx-runtime onto **host/node_modules**.
Remotes don't install their own React (federation shares a singleton at runtime), so a
remote's source could not `import 'react'` under vitest without this. Harmless for host
(same path). The `@` alias defaults to `host/src` — correct for host AND remotes
(module tsconfigs already map `@/*` → `../../host/src/*`).

## Running

Per workspace (no hoisting — run inside each):

```bash
cd host        && npm run test            # vitest run (CI)
cd host        && npm run test:watch      # interactive
cd host        && npm run test:coverage   # v8 coverage
cd modules/deals && npm run test
```

typecheck + lint are the other gates — they must stay green:

```bash
npm run typecheck   # tsc --noEmit — includes src/**, so the co-located *.test.* files too
npm run lint        # host only; test specs under src/ ARE linted, testing/ configs are ignored
```

`src/@types/vitest-globals.d.ts` is what keeps `tsc` happy about the test globals
(`describe`/`it`/`expect`/`vi`) and jest-dom matchers without a `vitest` import in
every spec. `host/eslint.config.mjs` ignores `vitest.config.ts` + `testing/**` from
typed linting (they're outside the app tsconfig project, like the other tool configs).

## What we mock (component level)

Per QA-STRATEGY §7 FE component: mock the **boundaries** — API/SWR/`fetch`, the router
(`MemoryRouter`), MF remote stubs. Real: the component itself + zustand stores.
See `host/src/auth/AuthProvider.test.tsx` for the API-client boundary-mock pattern
(`vi.hoisted` + `vi.mock('@/services/…')`) and `modules/deals/src/Deals/DealHeaderStats.test.tsx`
for a pure remote-component render.

`vitest.setup.ts` clears `localStorage`/`sessionStorage` after every test (zustand
persist + the project store write there) — the auth/project regression tests rely on
this clean slate.

---

## Wiring a NEW module for tests (T-037 checklist)

Copy the `modules/deals` setup — 4 steps, ~5 minutes per module:

1. **package.json** — add devDeps (pin same versions as host/deals) and scripts:

   ```jsonc
   "scripts": {
     "test": "vitest run",
     "test:watch": "vitest"
   },
   "devDependencies": {
     "@testing-library/dom": "10.4.1",
     "@testing-library/jest-dom": "6.9.1",
     "@testing-library/react": "16.3.0",
     "@testing-library/user-event": "14.6.1",
     "jsdom": "26.1.0",
     "vitest": "3.2.4"
   }
   ```

   Then `npm install` inside the module (workspaces are NOT hoisted here).

2. **vitest.config.ts** at the module root — 2 lines:

   ```ts
   import { createVitestConfig } from '../../host/testing/vitest.shared'
   export default createVitestConfig()
   ```

   The factory takes options if a module needs them: `atAlias`, `env`
   (extra `import.meta.env`), extra `setupFiles`, custom `include`.

3. **src/@types/vitest-globals.d.ts** — copy verbatim from `modules/deals`
   (ambient vitest + jest-dom types so `tsc --noEmit` accepts the specs).

4. Write `src/**/*.test.tsx` next to the code. `@/…` resolves to host/src; the module's
   own React resolves to the host singleton. Anything crossing the federation boundary
   (`loadRemoteModule`, remote dynamic imports) → `vi.mock` it.

Verify: `npm run test && npm run typecheck` inside the module — both green.

> Note: `modules/deals` has no eslint config/dep of its own (pre-existing). Module
> lint wiring is out of scope for T-027; T-031/T-037 own the FE lint CI job.

---

## CI gate (T-031)

The CI pipeline has a mandatory `test` stage BEFORE `build` (rules: MR +
`qa/*`, `ci/*`, `feature/*`, `main`; no `allow_failure`):

- **lint** — matrix currently `host` ONLY. Every `modules/*` has a `lint` script but
  NO eslint dep/config (`eslint .` → exit 127) — pre-existing gap, owned by **T-037**.
  When wiring eslint into a module, add it to the `lint` matrix in the CI pipeline.
- **typecheck** — `tsc --noEmit` for host + all 12 modules (modules grouped 4 per job;
  module jobs install host + ALL modules deps because of cross-module `@`-alias imports).
- **test:unit** — vitest; matrix = workspaces that actually have the runner
  (`host`, `modules/deals`). After wiring a new module (checklist above), add it to
  the `test:unit` matrix too.

## Allure Report

Vitest (host + remotes via `vitest.shared.ts`) writes Allure results to
`frontend/allure-results/`. E2E Playwright writes to `frontend/e2e/allure-results/`.

```bash
# unit/component (from host or any wired module)
cd host && npm test && npm run allure:serve

# e2e
cd e2e && npx playwright test && npm run allure:serve
```
