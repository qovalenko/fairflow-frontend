import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import {
    applyActivityListPreset,
    dateRangeForPreset,
    detectActivePreset,
} from './activity-list-presets'

describe('activity-list-presets (FR-ACTIVITIES-240)', () => {
    const now = dayjs('2026-08-19T14:30:00')

    it('maps today preset to start/end of current day', () => {
        expect(dateRangeForPreset('today', now)).toEqual({
            dateFrom: dayjs('2026-08-19').startOf('day').valueOf(),
            dateTo: dayjs('2026-08-19').endOf('day').valueOf(),
        })
    })

    it('maps tomorrow preset to next calendar day', () => {
        expect(dateRangeForPreset('tomorrow', now)).toEqual({
            dateFrom: dayjs('2026-08-20').startOf('day').valueOf(),
            dateTo: dayjs('2026-08-20').endOf('day').valueOf(),
        })
    })

    it('detects active today / tomorrow / overdue presets', () => {
        const today = dateRangeForPreset('today', now)
        expect(
            detectActivePreset({
                overdueOnly: false,
                dateFrom: today.dateFrom,
                dateTo: today.dateTo,
                now,
            }),
        ).toBe('today')
        expect(detectActivePreset({ overdueOnly: true, now })).toBe('overdue')
        expect(
            detectActivePreset({ overdueOnly: false, dateFrom: 1, dateTo: 2, now }),
        ).toBeNull()
    })

    it('applyActivityListPreset sets overdueOnly or date window', () => {
        expect(applyActivityListPreset('overdue', now)).toEqual({
            overdueOnly: true,
            dateRange: [null, null],
        })
        const tomorrow = applyActivityListPreset('tomorrow', now)
        expect(tomorrow.overdueOnly).toBe(false)
        expect(tomorrow.dateRange[0]?.getTime()).toBe(
            dayjs('2026-08-20').startOf('day').valueOf(),
        )
    })
})
