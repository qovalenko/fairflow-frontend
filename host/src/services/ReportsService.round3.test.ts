import { describe, expect, it } from 'vitest'
import { parseRunResult } from './ReportsService'

describe('round3 wave: FR-REPORTS-160/270/100', () => {
    it('resolveChartType берёт viz.type из payload бэкенда', () => {
        const result = parseRunResult(
            {
                report_id: 'r1',
                report_name: 'Продажи',
                generated_at: 1,
                preset_key: 'sales',
                data_json: JSON.stringify({
                    sales_totals: { count: 1, amount: 100 },
                    sales_dynamics: [{ bucket: '2026-01-01', count: 1, amount: 100 }],
                    viz: { type: 'line' },
                }),
            },
            'sales',
        )
        expect(result.chart?.type).toBe('line')
    })

    it('withFormulas подставляет metric_formulas с бэкенда', () => {
        const result = parseRunResult(
            {
                report_id: 'r1',
                report_name: 'Продажи',
                generated_at: 1,
                preset_key: 'sales',
                data_json: JSON.stringify({
                    sales_totals: { count: 2, amount: 200, avg_check: 100, conversion: 50 },
                    sales_dynamics: [],
                    metric_formulas: {
                        avg_check: 'Формула с бэкенда',
                        conversion: 'Конверсия с бэкенда',
                    },
                }),
            },
            'sales',
        )
        const avg = result.cards?.find((c) => c.key === 'avg_check')
        const conv = result.cards?.find((c) => c.key === 'conversion')
        expect(avg?.formula).toBe('Формула с бэкенда')
        expect(conv?.formula).toBe('Конверсия с бэкенда')
    })

    it('FR-REPORTS-100: department_benchmark не drillable и не в managerOptions', () => {
        const result = parseRunResult(
            {
                report_id: 'r1',
                report_name: 'По менеджерам',
                generated_at: 1,
                preset_key: 'by_managers',
                data_json: JSON.stringify({
                    deals_by_manager: [
                        {
                            manager_id: 'u-self',
                            manager_name: 'Я',
                            count: 5,
                            amount: 500,
                            won: 2,
                            lost: 1,
                        },
                        {
                            manager_id: '__dept_benchmark__',
                            manager_name: 'Среднее по отделу',
                            row_kind: 'department_benchmark',
                            count: 3,
                            amount: 300,
                            won: 1,
                            lost: 0,
                        },
                    ],
                }),
            },
            'by_managers',
        )
        expect(result.table?.rows).toHaveLength(2)
        expect(result.managerOptions).toEqual([{ id: 'u-self', name: 'Я' }])
        expect(result.drillable).toBe(true)
        const bench = result.table?.rows.find((r) => r.manager_id === 'Среднее по отделу')
        expect(bench?.__manager_id).toBe('__dept_benchmark__')
        expect(bench?.__row_kind).toBe('department_benchmark')
    })

    it('viz.type=table скрывает диаграмму custom_table', () => {
        const result = parseRunResult(
            {
                report_id: 'r1',
                report_name: 'Custom',
                generated_at: 1,
                preset_key: undefined,
                data_json: JSON.stringify({
                    custom_table: {
                        group_field: 'stage',
                        measure_fn: 'count',
                        rows: [{ key: 's1', value: 3 }],
                    },
                    viz: { type: 'table' },
                }),
            },
        )
        expect(result.chart).toBeNull()
        expect(result.table?.rows).toHaveLength(1)
    })
})
