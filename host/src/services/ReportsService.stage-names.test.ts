/**
 * Регрессия TODO-470 (отчётная половина): gateway дописывает `stage_name` в
 * срез `deals_by_stage` прогона отчёта (`gateway/src/bff/report-run-names.service.ts`),
 * а host `parseRunResult` его не читал — в таблице и на графике стадии
 * оставались UUID. Классический разрыв «домен умеет, а до пользователя не
 * доходит», поэтому тест закрепляет ОБА конца:
 *  1) подпись стадии доезжает в ячейку таблицы и в категорию графика;
 *  2) сырой `stage_id` не теряется — уезжает в скрытую `__stage_id`, по которой
 *     `modules/reports/src/Reports.tsx` (`__<dim> ?? <dim>`) строит drill;
 *  3) без `stage_name` (резолв стадий не удался) работает фоллбек на id —
 *     fail-soft, поведение не хуже прежнего.
 */
import { describe, it, expect } from 'vitest'
import { parseRunResult } from './ReportsService'

const STAGE_A = '11111111-1111-4111-8111-111111111111'
const STAGE_B = '22222222-2222-4222-8222-222222222222'

const run = (dataJson: unknown) =>
    parseRunResult({
        report_id: 'rep-1',
        report_name: 'Воронка',
        generated_at: 1_700_000_000_000,
        data_json: JSON.stringify(dataJson),
    })

describe('parseRunResult: подписи стадий (TODO-470)', () => {
    it('показывает stage_name в таблице и на графике, сохраняя id для drill', () => {
        const result = run({
            deals_by_stage: [
                { stage_id: STAGE_A, stage_name: 'Квалификация', count: 3, amount: 300 },
                { stage_id: STAGE_B, stage_name: 'Переговоры', count: 2, amount: 200 },
            ],
        })

        expect(result.table?.rows.map((r) => r.stage_id)).toEqual([
            'Квалификация',
            'Переговоры',
        ])
        expect(result.chart?.categories).toEqual(['Квалификация', 'Переговоры'])
        // Drill-значение: Reports.tsx берёт `__stage_id ?? stage_id`.
        expect(result.table?.rows.map((r) => r.__stage_id)).toEqual([STAGE_A, STAGE_B])
        expect(result.primaryDimension).toBe('stage_id')
    })

    it('колонка «Стадия» остаётся первой — от неё зависит dimension drill', () => {
        const result = run({
            deals_by_stage: [{ stage_id: STAGE_A, stage_name: 'Квалификация', count: 1, amount: 1 }],
        })
        expect(result.table?.columns[0]?.key).toBe('stage_id')
        // Скрытый ключ не рендерится: его нет среди колонок.
        expect(result.table?.columns.map((c) => c.key)).not.toContain('__stage_id')
    })

    it('без stage_name откатывается на stage_id (fail-soft)', () => {
        const result = run({
            deals_by_stage: [{ stage_id: STAGE_A, count: 1, amount: 10 }],
        })
        expect(result.table?.rows[0]?.stage_id).toBe(STAGE_A)
        expect(result.table?.rows[0]?.__stage_id).toBe(STAGE_A)
        expect(result.chart?.categories).toEqual([STAGE_A])
    })

    it('пустое stage_name не съедает фоллбек на id', () => {
        // `??` сработал бы только на null/undefined и оставил бы пустую ячейку,
        // поэтому в хелпере намеренно `||`.
        const result = run({
            deals_by_stage: [{ stage_id: STAGE_A, stage_name: '', count: 1, amount: 10 }],
        })
        expect(result.table?.rows[0]?.stage_id).toBe(STAGE_A)
        expect(result.chart?.categories).toEqual([STAGE_A])
    })
})
