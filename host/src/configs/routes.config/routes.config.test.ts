import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const thisDir = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(thisDir, 'routes.config.ts'), 'utf8')

/**
 * The route table is read as SOURCE rather than imported: every entry is a
 * `lazy(() => import('remote…'))`, and the Module-Federation virtual ids do not
 * resolve under vitest (testing/vitest.shared.ts). Key/path uniqueness is a
 * property of the literal table, so parsing it is sufficient — and it is exactly
 * what TODO-459/523 is about.
 */
const keys = [...source.matchAll(/^\s*key: '([^']+)',$/gm)].map((m) => m[1])
const paths = [...source.matchAll(/^\s*path: '([^']+)',$/gm)].map((m) => m[1])

const duplicates = (values: string[]): string[] => {
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const v of values) {
        if (seen.has(v)) dupes.add(v)
        seen.add(v)
    }
    return [...dupes]
}

describe('routes.config — no duplicate route entries (TODO-459/523)', () => {
    it('parsed the table (guards against a regex that silently matches nothing)', () => {
        expect(keys.length).toBeGreaterThan(50)
        expect(paths.length).toBeGreaterThan(50)
    })

    it('declares every route key exactly once', () => {
        expect(duplicates(keys)).toEqual([])
    })

    it('declares every route path exactly once', () => {
        expect(duplicates(paths)).toEqual([])
    })

    it('has a single /chat pair (the duplicated block is gone)', () => {
        expect(keys.filter((k) => k === 'portfolio.chat')).toHaveLength(1)
        expect(
            keys.filter((k) => k === 'portfolio.chat.conversation'),
        ).toHaveLength(1)
        expect(paths.filter((p) => p === '/chat')).toHaveLength(1)
        expect(paths.filter((p) => p === '/chat/:conversationId')).toHaveLength(1)
    })

    it('gates notification routes with notifications:read (FR-NOTIF-560)', () => {
        const blocks = source.split(/\n\s*\/\/ Account - Notifications|\n\s*\/\/ ── Портфель: Уведомления/)
        const notificationsBlock = blocks.slice(1).join('\n')
        expect(notificationsBlock).toContain("key: 'account.notifications.settings'")
        expect(notificationsBlock).toContain("requires: 'notifications:read'")
        expect(notificationsBlock).toContain("key: 'portfolio.notifications'")
    })
})
