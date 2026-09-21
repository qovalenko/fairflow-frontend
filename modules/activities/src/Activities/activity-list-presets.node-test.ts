import test from 'node:test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import {
    applyActivityListPreset,
    dateRangeForPreset,
    detectActivePreset,
} from './activity-list-presets.ts'

test('FR-ACTIVITIES-240: today preset window', () => {
    const now = dayjs('2026-08-19T14:30:00')
    assert.deepEqual(dateRangeForPreset('today', now), {
        dateFrom: dayjs('2026-08-19').startOf('day').valueOf(),
        dateTo: dayjs('2026-08-19').endOf('day').valueOf(),
    })
})

test('FR-ACTIVITIES-240: tomorrow preset window', () => {
    const now = dayjs('2026-08-19T14:30:00')
    assert.deepEqual(dateRangeForPreset('tomorrow', now), {
        dateFrom: dayjs('2026-08-20').startOf('day').valueOf(),
        dateTo: dayjs('2026-08-20').endOf('day').valueOf(),
    })
})

test('FR-ACTIVITIES-240: detect and apply presets', () => {
    const now = dayjs('2026-08-19T14:30:00')
    const today = dateRangeForPreset('today', now)
    assert.equal(
        detectActivePreset({
            overdueOnly: false,
            dateFrom: today.dateFrom,
            dateTo: today.dateTo,
            now,
        }),
        'today',
    )
    assert.equal(detectActivePreset({ overdueOnly: true, now }), 'overdue')
    const overdue = applyActivityListPreset('overdue', now)
    assert.equal(overdue.overdueOnly, true)
    assert.deepEqual(overdue.dateRange, [null, null])
})
