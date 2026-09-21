# FairFlow e2e smoke harness (T-029)

Playwright smoke suite for the FairFlow shell + remotes. Selectors are **`data-qa-id`
only** (T-028 convention, `<module>.<screen>.<element>`) — never text/class/DOM structure.

## Why the local hybrid is required

The deployed stand (`the stand`) is a **prod build with `VITE_QA_IDS` OFF**, so every
`data-qa-id` is tree-shaken out and qa-id selectors resolve to nothing. The green
smoke run therefore targets a **local hybrid**:

- `host` runs `vite dev` (qa-ids ON by default in dev mode),
- the `contacts` and `companies` remotes are **built + previewed** with
  `VITE_QA_IDS=true` (or served from `vite dev`, see `HYBRID_REMOTE_MODE`),
- all other remotes and the **REST API come from the real `the stand` stand** (proxied
  same-origin through the host dev server, so `/api/*` and `/frontend/*` just work).

`e2e/run-hybrid.sh` wires all of this up, holds a shared `flock` (ports are shared
between devs), waits for the host to come up, exports `BASE_URL`, then runs the
given command.

## Run it

```bash
export PATH=/opt/node/bin:$PATH
export NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/ff-ca.crt

cd e2e
npm ci                       # first time only (browsers preinstalled on CI hosts)

# full smoke set against the local hybrid (recommended)
./run-hybrid.sh npx playwright test

# a single spec
./run-hybrid.sh npx playwright test tests/04-create-contact.spec.ts

# against a raw stand (login/api specs work; qa-id UI specs will FAIL — no attrs)
BASE_URL=https://stand.example.com npx playwright test tests/01-login.spec.ts
```

`STAND_URL` (default `https://stand.example.com`) and `HOST_PORT` (default `5173`) can override
where the hybrid points / listens. Feature stands: `STAND_URL=https://<slug>.stand.example.com`.

Runner knobs (all optional):

| var | default | meaning |
| --- | --- | --- |
| `HYBRID_REMOTES` | `contacts companies` | which remotes are served locally with qa-ids; narrow it (`HYBRID_REMOTES=companies`) to skip building a remote a spec does not touch |
| `HYBRID_REMOTE_MODE` | `preview` | `dev` serves the remotes from `vite dev` instead of build+preview — same qa-ids and same `/assets/remoteEntry.js`, and it is the only way in when a module's standalone `vite build` cannot resolve the `remote<Other>/…` federation ids it inherits from `host/src` |
| `STAND_IP` | unset | resolve the stand hostname to this IP inside the Node processes (`support/dns-shim.cjs`). Needed where the stand is reachable over the network but its name is not in DNS and `/etc/hosts` needs sudo |

```bash
# companies specs on a host without split-DNS for the stand, remote served from vite dev
STAND_IP=203.0.113.10 HYBRID_REMOTES=companies HYBRID_REMOTE_MODE=dev \
  ./run-hybrid.sh npx playwright test tests/06-companies-list.spec.ts
```

## Config knobs

Copy `.env.example` → `.env` (gitignored) to override, or pass via shell env:

| var | default | meaning |
| --- | --- | --- |
| `BASE_URL` | `https://stand.example.com` | app origin under test (hybrid sets it to `http://localhost:5173`) |
| `API_BASE_URL` | `${BASE_URL}/api` | REST base for the seeding/cleanup client |
| `E2E_EMAIL` / `E2E_PASSWORD` | `admin@fairflow.local` / `admin` | login creds |
| `E2E_DEALS` | unset | enable the pending deals smoke (needs deals served locally with qa-ids) |

## Scenarios

| spec | flow | notes |
| --- | --- | --- |
| `01-login` | clean UI login → token in localStorage | exercises real `/v1/auth/login` |
| `02-create-project` | wizard: template → name → submit → land in `/p/:id`, sidebar built | API-archived in cleanup |
| `03-module-menu` | enable `orders` in settings → it appears in the portfolio sidebar | project seeded via API |
| `04-create-contact` | contacts drawer create → POST ok → row appears in list | contacts served locally (qa-ids) |
| `05-create-deal` | deals create | **skipped** unless `E2E_DEALS=1` (deals remote needs a local qa-id build + `deals.create.*` ids) |
| `06-companies-list` | companies list: nav, paging, search, industry/status/assignee filters, row → card, trash/import links, "only mine", create drawer (quick + full + dedup hint), CSV export, bulk delete, bulk merge | catalog #1, #20–#24, #27, #35–#37, #41, #42, #45, #58, #62, #65; fixme: #20, #22–23, #36, #47, #58 — см. REPORT.md |
| `07-companies-details` | company card: header fields, composite widgets with linked contact/deal/order, edit entry, soft-delete → trash, restore, merge picker, add contact via host drawer, cross-nav to contact/deal/order | catalog #68, #69, #79, #85, #88, #96, #100, #102–#104; fixme: #69, #88–89, #96, #100, #102–104 |
| `08-companies-edit-trash` | edit form load → save → card, status/industry/tags/notes persistence, trash list + paging, restore from trash | catalog #109, #115, #120, #125; fixme: #115, #120, #126 |
| `09-companies-merge-import` | header "+" → company, merge preview/relation counts/confirm, per-field conflict decision, import wizard mapping + dedup mode | catalog #52, #132, #137, #138, #148; fixme: #52, #132–138, #146–148 |
| `10-companies-p1` | P1: no project, empty list/filter reset, only-mine persistence, create/edit validation, card 404/empty widgets, merge picker empty, deal/order cross-nav, trash empty/row click, merge guard states, merge cancel | catalog #3, #28, #29, #38, #43, #71, #72, #97, #103–104, #110–112, #114, #121, #124, #133–135, #140 |

### Known blockers behind the `fixme`s

Полный список с repro — **`REPORT.md`** в корне worktree. Кратко:

- **list/trash pagination** (#20, #120): BFF отдаёт `total === len(page)`, не общий count → вторая страница недоступна в UI.
- **list filters** (#22, #23): `filterIndustry` / `filterStatus` на the stand не сужают выборку.
- **import/export permissions** (#36, #58, #148): `companies:import` / `companies:export` нет в `GET …/permissions`.
- **global create** (#52): в manifest модулей нет `drawerEntities[]` → нет `host.globalCreate.trigger`.
- **card contacts composite** (#69, #100, #102–104): `/card` → `contacts: []` при связанном contact.
- **restore collision** (#47, #89, #126): `POST …/restore` → **500** вместо `422 FAILED_PRECONDITION`.
- **CSV import** (#146): multipart vs JSON body на gateway.

## Structure

- `playwright.config.ts` — `setup` project logs in once → `storageState` reused by `chromium`.
- `support/env.ts` — centralised env + `uniqueName()` (all created data is prefixed `t029-`).
- `support/qa.ts` — `byQa(scope, id, data?)`, the only selector entry point.
- `support/ui.ts` — interactions for widgets whose real control is not the element carrying the qa-id: `pickSelectOption` (react-select), `toggleSwitcher` / `pickRadio` (visually hidden inputs behind their label), `selectRow` (DataTable row checkbox).
- `support/dns-shim.cjs` — `--require` hook for `STAND_IP` (see knobs above).
- `fixtures/test.ts` — `api` (authenticated REST client) + `useProject(pid)` (seeds project context pre-navigation) + `noForbidden` (auto fixture: fails any test that sees an unexpected `403` on the happy path, INV-403-00; widen via `test.use({ forbiddenAllow: [/…/] })`).
- `fixtures/api.ts` — thin REST client for seeding/cleanup, mirrors host/contacts service calls.

## Artifacts

On failure: `trace` (`retain-on-failure`) + `screenshot` under
`test-results/artifacts/`; HTML report at `test-results/html-report`
(`npm run report`). Both are gitignored.

**Allure Report** (enabled in `playwright.config.ts`):

- raw results: `allure-results/` (gitignored)
- generate static report: `npm run allure:report` → `allure-report/`
- open static report: `npm run allure:open`
- live server (no generate step): `npm run allure:serve`

Playwright traces and failure screenshots are attached to Allure automatically.
