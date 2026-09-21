/**
 * Регрессия TODO-271 / TODO-460/519: реестр slot-expose'ов в
 * `slot-exposes.config.ts` (читается `host/vite.config.ts`) не должен ссылаться
 * на удалённые компоненты.
 *
 * Почему тест читает конфиг текстом, а не импортирует vite.config: он тянет
 * `@originjs/vite-plugin-federation` и лежит вне `include` тестового tsconfig.
 * Парсим `slot-exposes.config.ts` и проверяем ОБА конца связки:
 *  1) исходник `modules/<folder>/src/<source>.tsx` существует;
 *  2) ремоут объявляет expose в своём federation-конфиге.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = path.dirname(fileURLToPath(import.meta.url)) // host/src/configs
const hostDir = path.resolve(thisDir, '../..') // host
const repoRoot = path.resolve(hostDir, '..') // frontend checkout root
const slotExposesConfig = readFileSync(
    path.join(thisDir, 'slot-exposes.config.ts'),
    'utf8',
)

/** Тело объектного литерала по имени объявления (до строки, начинающейся с `}`). */
function objectBody(source: string, declaration: string): string {
    const start = source.indexOf(declaration)
    expect(start, `${declaration} не найдено`).toBeGreaterThan(-1)
    const open = source.indexOf('{', start)
    const close = source.indexOf('\n}', open)
    expect(close, `не найден конец литерала ${declaration}`).toBeGreaterThan(open)
    return source.slice(open + 1, close)
}

/** `remoteStatistics: 'statistics'` → { remoteStatistics: 'statistics' } */
function parseRemoteFolders(): Record<string, string> {
    const body = objectBody(slotExposesConfig, 'export const REMOTE_FOLDERS =')
    const out: Record<string, string> = {}
    for (const m of body.matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2]
    return out
}

/** Парсит `remoteSearch: [{ name: 'SearchSettingsTab', source: '...' }]`. */
function parseSlotExposes(): Record<string, Array<{ name: string; source: string }>> {
    const body = objectBody(slotExposesConfig, 'export const REMOTE_SLOT_EXPOSES')
    const withoutComments = body.replace(/\/\/[^\n]*/g, '')
    const out: Record<string, Array<{ name: string; source: string }>> = {}
    for (const block of withoutComments.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
        const key = block[1]
        const inner = block[2]
        const entries: Array<{ name: string; source: string }> = []
        for (const item of inner.matchAll(
            /\{\s*name:\s*'([^']+)',\s*source:\s*'([^']+)'/g,
        )) {
            entries.push({ name: item[1], source: item[2] })
        }
        if (entries.length) out[key] = entries
    }
    return out
}

describe('REMOTE_SLOT_EXPOSES (slot-exposes.config.ts)', () => {
    const folders = parseRemoteFolders()
    const slotExposes = parseSlotExposes()

    it('парсинг конфига жив (иначе тест ничего не проверяет)', () => {
        expect(Object.keys(folders).length).toBeGreaterThan(5)
        expect(folders.remoteStatistics).toBe('statistics')
        expect(slotExposes.remoteSearch?.map((e) => e.name)).toEqual([
            'SearchSettingsTab',
        ])
    })

    it('каждый expose ссылается на существующий исходник ремоута', () => {
        const missing: string[] = []
        for (const [key, exposes] of Object.entries(slotExposes)) {
            const folder = folders[key]
            expect(folder, `${key} нет в REMOTE_FOLDERS`).toBeTruthy()
            for (const expose of exposes) {
                const src = path.join(
                    repoRoot,
                    'modules',
                    folder,
                    'src',
                    `${expose.source}.tsx`,
                )
                if (!existsSync(src)) missing.push(`${key}/${expose.name} → ${src}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('каждый expose объявлен в federation-конфиге своего ремоута', () => {
        const undeclared: string[] = []
        for (const [key, exposes] of Object.entries(slotExposes)) {
            const folder = folders[key]
            const cfgPath = path.join(
                repoRoot,
                'modules',
                folder,
                'vite.config.ts',
            )
            expect(existsSync(cfgPath), `нет ${cfgPath}`).toBe(true)
            const cfg = readFileSync(cfgPath, 'utf8')
            for (const expose of exposes) {
                if (!cfg.includes(`'./${expose.name}'`)) {
                    undeclared.push(`${key}/${expose.name}`)
                }
            }
        }
        expect(undeclared).toEqual([])
    })

    it('удалённый демо-вклад DashboardSlotDemo не вернулся', () => {
        const names = slotExposes.remoteStatistics?.map((e) => e.name) ?? []
        expect(names).not.toContain('DashboardSlotDemo')
    })

    it('GlobalSearchDialog не вернулся после снятия chrome-дубля (TODO-258)', () => {
        const searchNames = slotExposes.remoteSearch?.map((e) => e.name) ?? []
        expect(searchNames).not.toContain('GlobalSearchDialog')
    })
})
