import { describe, it, expect } from 'vitest'
import {
    getModuleSettingsPanelLoader,
    getSlotComponentLoader,
    hasModuleSettingsPanel,
} from '@/utils/loadRemoteComponent'
import { rejectSlotContribution } from '@/configs/slot-catalog.config'

/**
 * TODO-103 / TODO-258 (FR-PSET-230, FR-SEARCH-360): экран настроек модуля
 * `search` должен быть достижим из настроек проекта.
 *
 * Канонический путь — mount-point в слот `project.settings.tab` (открыт для
 * business после OQ-MODULE-130). Host-only chrome (`shell.header.action`) и
 * cross-cutting настройки без enablement — отдельные пути (ModuleSettingsPanel).
 */
describe('экран настроек модуля в настройках проекта', () => {
    it('search поставляет собственный экран настроек, и он ведёт на тот же экспоуз, что и слот-реестр', () => {
        expect(hasModuleSettingsPanel('search')).toBe(true)
        expect(getModuleSettingsPanelLoader('search')).toBe(
            getSlotComponentLoader('search', './SearchSettingsTab'),
        )
    })

    it('documents поставляет собственный экран настроек (FR-DOCS-410)', () => {
        expect(hasModuleSettingsPanel('documents')).toBe(true)
        expect(getModuleSettingsPanelLoader('documents')).toBe(
            getSlotComponentLoader('documents', './DocumentsSettingsTab'),
        )
    })

    it('модуль без собственного экрана настроек резолвится в null (host покажет авто-форму)', () => {
        expect(hasModuleSettingsPanel('deals')).toBe(false)
        expect(getModuleSettingsPanelLoader('deals')).toBeNull()
    })

    it('project.settings.tab открыт для business (OQ-MODULE-130); chrome host-only — нет', () => {
        expect(rejectSlotContribution('project.settings.tab', 'business')).toBeNull()
        expect(rejectSlotContribution('shell.header.action', 'business')).toBe(
            'HOST_ONLY_SLOT_FORBIDDEN',
        )
    })

    it('host-local chrome слоты резолвятся без federated remote', () => {
        expect(getSlotComponentLoader('search', 'GlobalSearchDialog')).not.toBeNull()
        expect(getSlotComponentLoader('notifications', 'HeaderNotificationBell')).not.toBeNull()
        expect(getSlotComponentLoader('notifications', 'NavItemBadge')).not.toBeNull()
        expect(getSlotComponentLoader('notifications', 'AccountMenuItem')).not.toBeNull()
    })
})
