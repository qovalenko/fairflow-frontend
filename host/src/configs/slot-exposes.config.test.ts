import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    REMOTE_FOLDERS,
    REMOTE_SLOT_EXPOSES,
    slotExposeEntries,
    federationId,
} from './slot-exposes.config'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const hostDir = path.resolve(thisDir, '../..') // <root>/host
const repoRoot = path.resolve(hostDir, '..') // <root>

const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

/**
 * `loadRemoteComponent.ts` is read as SOURCE, not imported: its `import()`
 * specifiers are Module-Federation virtual ids (`remoteActivities/...`) that have
 * no resolution under vitest (see testing/vitest.shared.ts — federation code
 * paths must be mocked at the boundary). Parsing the keys is enough to catch the
 * drift this test exists for.
 */
function wiredSlotComponentKeys(): string[] {
    const src = read('host/src/utils/loadRemoteComponent.ts')
    const start = src.indexOf('const slotComponentMap')
    const end = src.indexOf('const hostLocalSlotComponentMap')
    const body = end > start ? src.slice(start, end) : src.slice(start, src.indexOf('function keyFor'))
    return [...body.matchAll(/'([^']+::[^']+)':/g)].map((m) => m[1])
}

/**
 * TODO-460/519 — the three slot-expose registries must not drift again:
 *   1. `src/configs/slot-exposes.config.ts` (this one, read by vite.config.ts),
 *   2. `src/utils/loadRemoteComponent.ts`   (runtime federation loaders),
 *   3. `src/@types/federation-remotes.d.ts` (tsc declarations),
 * and all three must match the module's own `vite.config.ts` `exposes` map.
 */
describe('slot-expose registries stay in sync (TODO-460/519)', () => {
    it('is non-empty (a passing-by-vacuum suite would hide the drift)', () => {
        expect(slotExposeEntries().length).toBeGreaterThan(0)
    })

    it('loadRemoteComponent wires EXACTLY the registered exposes', () => {
        const expected = slotExposeEntries()
            .map(({ moduleId, expose }) => `${moduleId}::${expose.name}`)
            .sort()
        expect(wiredSlotComponentKeys().sort()).toEqual(expected)
    })

    it('federation-remotes.d.ts declares every registered expose', () => {
        const dts = read('host/src/@types/federation-remotes.d.ts')
        for (const { remoteKey, expose } of slotExposeEntries()) {
            expect(
                dts,
                `missing declaration for ${federationId(remoteKey, expose.name)}`,
            ).toContain(`declare module '${federationId(remoteKey, expose.name)}'`)
        }
    })

    it("every registered expose is actually exposed by its module's vite.config", () => {
        for (const { remoteKey, expose } of slotExposeEntries()) {
            const folder = REMOTE_FOLDERS[remoteKey]
            const cfg = read(`modules/${folder}/vite.config.ts`)
            expect(cfg, `${folder} does not expose ./${expose.name}`).toContain(
                `'./${expose.name}'`,
            )
        }
    })

    it('every registered expose points at a source file that EXISTS', () => {
        // The stale `remoteStatistics: ['DashboardSlotDemo']` entry pointed at a
        // deleted file and broke `VITE_DIRECT_REMOTES=statistics`. The `source`
        // field also carries the nested path (`Activities/ActivityCardTab`) the
        // old `src/<name>.tsx` formula got wrong.
        for (const { remoteKey, expose } of slotExposeEntries()) {
            const folder = REMOTE_FOLDERS[remoteKey]
            const file = path.join(
                repoRoot,
                `modules/${folder}/src/${expose.source}.tsx`,
            )
            expect(fs.existsSync(file), `missing ${file}`).toBe(true)
        }
    })

    it('does not resurrect the removed statistics slot expose', () => {
        const names = REMOTE_SLOT_EXPOSES.remoteStatistics?.map((e) => e.name) ?? []
        expect(names).not.toContain('DashboardSlotDemo')
        expect(
            fs.existsSync(
                path.join(repoRoot, 'modules/statistics/src/DashboardSlotDemo.tsx'),
            ),
        ).toBe(false)
    })

    it('vite.config.ts consumes this registry instead of a private copy', () => {
        const cfg = read('host/vite.config.ts')
        expect(cfg).toContain("from './src/configs/slot-exposes.config'")
        // The direct-import alias must use `expose.source` (the path relative to
        // src/), not the expose NAME — activities' files live in src/Activities/.
        expect(cfg).toContain('${expose.source}.tsx')
    })
})
