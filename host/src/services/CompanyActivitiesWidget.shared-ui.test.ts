import { describe, it, expect } from 'vitest'
import {
    activityTimestamp,
    filterActivitiesByType,
    groupActivitiesByDate,
    type CompanyActivity,
} from '@fairflow/shared-ui'

describe('CompanyActivitiesWidget helpers (TODO-363/524)', () => {
    const sample: CompanyActivity[] = [
        {
            id: '1',
            type: 'call',
            title: 'Call A',
            createdAt: 1_700_000_000,
            assigneeName: 'Ivan',
        },
        {
            id: '2',
            type: 'task',
            title: 'Task B',
            createdAt: 1_700_086_400,
            assigneeName: 'Petr',
        },
    ]

    it('filters and groups activities for the shared widget', () => {
        expect(activityTimestamp({ ...sample[0], dueDate: 99 })).toBe(99)
        expect(filterActivitiesByType(sample, 'call').map((a) => a.id)).toEqual(['1'])
        expect(groupActivitiesByDate(sample)).toHaveLength(2)
    })
})
