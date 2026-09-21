import type { Activity } from '@/@types/crm'

/** Resolve deal id from an activity row (direct field or link entity). */
export function activityDealId(activity: Activity): string {
    return (
        activity.dealId ??
        activity.links?.find((l) => l.entityType === 'deal')?.entityId ??
        ''
    )
}

/** Normalize epoch seconds vs milliseconds to milliseconds. */
export function activityDueMs(activity: Activity): number {
    const raw = activity.dueDate ?? activity.startDate ?? 0
    if (!raw) return 0
    return raw > 1_000_000_000_000 ? raw : raw * 1000
}

/**
 * FR-DEALS-090: nearest upcoming planned activity per deal for kanban cards.
 * Skips overdue items; when several activities share a deal, picks the earliest due.
 */
export function pickNextActivityByDealId(activities: Activity[], nowMs = Date.now()): Map<string, Activity> {
    const map = new Map<string, Activity>()
    for (const activity of activities) {
        const dealId = activityDealId(activity)
        if (!dealId) continue
        const dueMs = activityDueMs(activity)
        if (dueMs && dueMs < nowMs) continue
        const prev = map.get(dealId)
        if (!prev) {
            map.set(dealId, activity)
            continue
        }
        const prevMs = activityDueMs(prev)
        if (dueMs && (!prevMs || dueMs < prevMs)) map.set(dealId, activity)
    }
    return map
}

/** Short label for the kanban card chip. */
export function formatKanbanActivityLabel(activity: Activity): string {
    const title = (activity.title ?? activity.type ?? 'Активность').trim()
    const dueMs = activityDueMs(activity)
    if (!dueMs) return title
    const d = new Date(dueMs)
    const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${title} · ${date}`
}
