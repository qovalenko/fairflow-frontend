import dayjs, { type Dayjs } from 'dayjs'

export type ActivityListDatePreset = 'today' | 'tomorrow' | 'overdue'

export const ACTIVITY_LIST_DATE_PRESETS: ReadonlyArray<{
    id: ActivityListDatePreset
    label: string
}> = [
    { id: 'today', label: 'Сегодня' },
    { id: 'tomorrow', label: 'Завтра' },
    { id: 'overdue', label: 'Просроченные' },
]

/** Server-side window for «Сегодня» / «Завтра» (ms, inclusive day bounds). */
export function dateRangeForPreset(
    preset: 'today' | 'tomorrow',
    now: Dayjs = dayjs(),
): { dateFrom: number; dateTo: number } {
    const base = preset === 'today' ? now : now.add(1, 'day')
    return {
        dateFrom: base.startOf('day').valueOf(),
        dateTo: base.endOf('day').valueOf(),
    }
}

/** Detect whether current list filters match a built-in preset (FR-ACTIVITIES-240). */
export function detectActivePreset(opts: {
    overdueOnly: boolean
    dateFrom?: number
    dateTo?: number
    now?: Dayjs
}): ActivityListDatePreset | null {
    if (opts.overdueOnly) return 'overdue'
    const { dateFrom, dateTo } = opts
    if (dateFrom == null || dateTo == null) return null
    const now = opts.now ?? dayjs()
    for (const preset of ['today', 'tomorrow'] as const) {
        const expected = dateRangeForPreset(preset, now)
        if (dateFrom === expected.dateFrom && dateTo === expected.dateTo) return preset
    }
    return null
}

export type ActivityListPresetState = {
    overdueOnly: boolean
    dateRange: [Date | null, Date | null]
}

/** Apply a quick filter preset on top of existing list filters. */
export function applyActivityListPreset(
    preset: ActivityListDatePreset,
    now: Dayjs = dayjs(),
): ActivityListPresetState {
    if (preset === 'overdue') {
        return { overdueOnly: true, dateRange: [null, null] }
    }
    const { dateFrom, dateTo } = dateRangeForPreset(preset, now)
    return {
        overdueOnly: false,
        dateRange: [new Date(dateFrom), new Date(dateTo)],
    }
}
