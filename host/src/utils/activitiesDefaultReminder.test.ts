import { describe, expect, it } from 'vitest'
import { activitiesDefaultReminder } from './activitiesDefaultReminder'

describe('activitiesDefaultReminder (FR-ACTIVITIES-010)', () => {
    it('reads defaultReminder from activities personalSettings', () => {
        expect(
            activitiesDefaultReminder([
                {
                    moduleId: 'activities',
                    enabled: true,
                    personalSettings: { defaultReminder: '1h' },
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                    config: {},
                    configState: 'ready',
                },
            ]),
        ).toBe('1h')
    })

    it('falls back to none when unset or invalid', () => {
        expect(activitiesDefaultReminder([])).toBe('none')
        expect(
            activitiesDefaultReminder([
                {
                    moduleId: 'activities',
                    enabled: true,
                    personalSettings: { defaultReminder: 'bad' },
                    integrationSettings: {},
                    integrationMethodsEnabled: [],
                    config: {},
                    configState: 'ready',
                },
            ]),
        ).toBe('none')
    })
})
