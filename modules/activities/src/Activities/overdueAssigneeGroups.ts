import { useMemo } from 'react'
import type { Activity } from '@/@types/crm'

export type OverdueAssigneeGroup = {
    assigneeId: string
    assigneeName: string
    items: Activity[]
}

/** FR-ACTIVITIES-200: group overdue widget rows by assignee. */
export function groupOverdueByAssignee(list: Activity[]): OverdueAssigneeGroup[] {
    const map = new Map<string, OverdueAssigneeGroup>()
    for (const item of list) {
        const assigneeId = item.assigneeId || 'unassigned'
        const assigneeName = item.assigneeName?.trim() || 'Без ответственного'
        const hit = map.get(assigneeId)
        if (hit) hit.items.push(item)
        else map.set(assigneeId, { assigneeId, assigneeName, items: [item] })
    }
    return Array.from(map.values()).sort((a, b) =>
        a.assigneeName.localeCompare(b.assigneeName, 'ru'),
    )
}

export function useOverdueAssigneeGroups(list: Activity[]): OverdueAssigneeGroup[] {
    return useMemo(() => groupOverdueByAssignee(list), [list])
}
