import { describe, expect, it } from 'vitest'
import { groupOverdueByAssignee } from './overdueAssigneeGroups'
import type { Activity } from '@/@types/crm'

const act = (id: string, assigneeId: string, assigneeName: string): Activity =>
    ({
        id,
        type: 'task',
        title: id,
        status: 'planned',
        assigneeId,
        assigneeName,
    }) as Activity

describe('groupOverdueByAssignee (FR-ACTIVITIES-200)', () => {
    it('groups rows by assigneeId with display names', () => {
        const groups = groupOverdueByAssignee([
            act('a1', 'u1', 'Анна'),
            act('a2', 'u2', 'Борис'),
            act('a3', 'u1', 'Анна'),
        ])
        expect(groups).toHaveLength(2)
        expect(groups[0].assigneeName).toBe('Анна')
        expect(groups[0].items).toHaveLength(2)
        expect(groups[1].assigneeName).toBe('Борис')
    })
})
