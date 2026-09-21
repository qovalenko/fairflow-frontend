import { describe, it, expect } from 'vitest'
import type { Activity } from '@/@types/crm'
import {
    activityDealId,
    formatKanbanActivityLabel,
    pickNextActivityByDealId,
} from './dealKanbanActivity'

const act = (over: Partial<Activity> & { id: string }): Activity =>
    ({
        type: 'call',
        status: 'planned',
        ...over,
    }) as Activity

describe('pickNextActivityByDealId', () => {
    it('picks the nearest future activity per deal', () => {
        const now = Date.UTC(2026, 7, 20, 12, 0, 0)
        const map = pickNextActivityByDealId(
            [
                act({
                    id: 'a1',
                    dealId: 'd1',
                    title: 'Позвонить',
                    dueDate: Math.floor(Date.UTC(2026, 7, 25) / 1000),
                }),
                act({
                    id: 'a2',
                    dealId: 'd1',
                    title: 'Встреча',
                    dueDate: Math.floor(Date.UTC(2026, 7, 22) / 1000),
                }),
                act({
                    id: 'a3',
                    links: [{ entityType: 'deal', entityId: 'd2' }],
                    title: 'Письмо',
                    dueDate: Date.UTC(2026, 7, 23),
                }),
            ],
            now,
        )
        expect(map.get('d1')?.id).toBe('a2')
        expect(map.get('d2')?.id).toBe('a3')
    })

    it('skips overdue activities', () => {
        const now = Date.UTC(2026, 7, 20, 12, 0, 0)
        const map = pickNextActivityByDealId(
            [
                act({
                    id: 'old',
                    dealId: 'd1',
                    dueDate: Math.floor(Date.UTC(2026, 7, 10) / 1000),
                }),
            ],
            now,
        )
        expect(map.size).toBe(0)
    })
})

describe('activityDealId', () => {
    it('falls back to deal link entity', () => {
        expect(
            activityDealId(
                act({
                    id: 'x',
                    links: [{ entityType: 'contact', entityId: 'c1' }, { entityType: 'deal', entityId: 'd9' }],
                }),
            ),
        ).toBe('d9')
    })
})

describe('formatKanbanActivityLabel', () => {
    it('includes title and due date', () => {
        const label = formatKanbanActivityLabel(
            act({
                id: 'a',
                title: 'Звонок',
                dueDate: Math.floor(Date.UTC(2026, 7, 25) / 1000),
            }),
        )
        expect(label).toContain('Звонок')
        expect(label).toContain('25.08')
    })
})
