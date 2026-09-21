import { describe, expect, it } from 'vitest'
import { parseRunResult, type PresetKey } from '@/services/ReportsService'

describe('FR-REPORTS-110: parseRunResult my_overdue', () => {
    it('собирает персональный срез просрочек', () => {
        const raw = {
            report_id: 'r1',
            report_name: 'Мои просрочки',
            generated_at: 1,
            preset_key: 'my_overdue' as PresetKey,
            data_json: JSON.stringify({
                preset_key: 'my_overdue',
                scope_note: 'Персональный срез',
                my_overdue_totals: { overdue_activities: 2, inactive_deals: 1, stalled_days: 7 },
                my_overdue_activities: [
                    {
                        activity_id: 'a1',
                        title: 'Звонок',
                        type: 'call',
                        due_at: 1_700_000_000_000,
                    },
                ],
                my_inactive_deals: [
                    {
                        deal_id: 'd1',
                        name: 'Зависшая',
                        amount: 1000,
                        stage_id: 's1',
                        days_inactive: 12,
                    },
                ],
            }),
        }
        const result = parseRunResult(raw, 'my_overdue')
        expect(result.cards?.[0]?.value).toBe(2)
        expect(result.cards?.[1]?.value).toBe(1)
        expect(result.table?.rows).toHaveLength(2)
        expect(result.table?.rows[0]).toMatchObject({
            kind: 'Просроченная активность',
            title: 'Звонок',
        })
        expect(String(result.table?.rows[0].detail)).not.toBe('1700000000000')
        expect(result.table?.rows[1]).toMatchObject({
            kind: 'Сделка без активности',
            title: 'Зависшая',
            detail: '12 дн.',
        })
    })
})

describe('NFR-020: aggregate_pagination в parseRunResult', () => {
    it('прокидывает aggregatePagination из data_json', () => {
        const raw = {
            report_id: 'r1',
            report_name: 'Продажи',
            generated_at: 1,
            preset_key: 'sales' as PresetKey,
            data_json: JSON.stringify({
                sales_totals: { count: 1, amount: 100 },
                sales_dynamics: [{ bucket: '2026-01-01', count: 1, amount: 100 }],
                aggregate_pagination: { page_index: 0, page_size: 25, total_groups: 40 },
            }),
        }
        const result = parseRunResult(raw, 'sales')
        expect(result.aggregatePagination).toEqual({
            pageIndex: 0,
            pageSize: 25,
            totalGroups: 40,
        })
    })
})

describe('FR-REPORTS-380: entity_mini в parseRunResult', () => {
    it('нормализует мини-срез карточки', () => {
        const raw = {
            report_id: 'r1',
            report_name: 'Sales',
            generated_at: 1,
            preset_key: 'sales' as PresetKey,
            data_json: JSON.stringify({
                entity_mini: {
                    entity_type: 'deal',
                    entity_id: 'd1',
                    found: true,
                    name: 'Сделка',
                    amount: 1000,
                    activities_overdue: 2,
                },
            }),
        }
        const result = parseRunResult(raw, 'sales')
        expect(result.entityMini).toMatchObject({
            entityType: 'deal',
            found: true,
            name: 'Сделка',
            activitiesOverdue: 2,
        })
    })
})
