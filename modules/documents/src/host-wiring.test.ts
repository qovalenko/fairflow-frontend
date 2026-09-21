import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { getSlotDescriptor } from '@/configs/slot-catalog.config'
import { REMOTE_SLOT_EXPOSES } from '@/configs/slot-exposes.config'

/**
 * FR-DOCS-410: documents contributes DocumentsSettingsTab to project.settings.tab.
 * Не импортируем loadRemoteComponent — под vitest remote без federation-плагина
 * Vite падает на virtual `remoteDocuments/*`. Реестр слотов и vite exposes —
 * тот же контракт, и тест падает, если вкладку выкинут.
 */
const moduleRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('documents settings slot wiring', () => {
    it('declares project.settings.tab in the slot catalog', () => {
        expect(getSlotDescriptor('project.settings.tab')).toBeTruthy()
    })

    it('registers DocumentsSettingsTab in host slot-exposes and module federation map', () => {
        const exposes = REMOTE_SLOT_EXPOSES.remoteDocuments ?? []
        expect(exposes.some((e) => e.name === 'DocumentsSettingsTab')).toBe(true)

        const viteConfig = readFileSync(join(moduleRoot, 'vite.config.ts'), 'utf8')
        expect(viteConfig).toMatch(/['"]\.\/DocumentsSettingsTab['"]\s*:\s*['"]\.\/src\/DocumentsSettingsTab\.tsx['"]/)
    })
})
