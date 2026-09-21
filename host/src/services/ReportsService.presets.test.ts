/**
 * TODO-253 / FR-REPORTS-090: у каждой вкладки отчётов — СВОЙ срез.
 *
 * До правки домен отдавал один и тот же `buildSummary` на любой пресет, а
 * `parseRunResult` знал ровно два среза (`by_managers`/`depts`) — «По продажам»,
 * «По воронке», «По клиентам», «По активности» и «По источникам» рисовали
 * одинаковую таблицу «Стадия / Сделок / Сумма». Тест закрепляет второй конец
 * связки: срез домена доезжает в карточки/таблицу/график, сырые ключи остаются
 * для drill, а строка кликабельна ровно там, где домен умеет разворачивать
 * измерение (`drillable`).
 */
import { describe, it, expect } from 'vitest'
import { parseRunResult, type PresetKey } from './ReportsService'

const run = (data: unknown, forPreset?: PresetKey | 'depts') =>
    parseRunResult(
        {
            report_id: 'rep-1',
            report_name: 'Отчёт',
            generated_at: 1_700_000_000_000,
            data_json: JSON.stringify(data),
        },
        forPreset,
    )

const SALES = {
    preset_key: 'sales',
    sales_totals: {
        count: 4,
        amount: 500,
        won_count: 2,
        lost_count: 1,
        open_count: 1,
        avg_check: 125,
        conversion: 50,
    },
    sales_dynamics: [
        { bucket: '2026-08-01', count: 2, amount: 200 },
        { bucket: '2026-08-02', count: 2, amount: 300 },
    ],
}

const FUNNEL = {
    preset_key: 'funnel',
    stalled_days: 7,
    funnel_stages: [
        {
            stage_id: 's1',
            stage_name: 'Новая',
            count: 20,
            amount: 2000,
            stalled: 3,
            conversion: 100,
            conversion_from_prev: 100,
        },
        {
            stage_id: 's2',
            stage_name: 'В работе',
            count: 10,
            amount: 1000,
            stalled: 1,
            conversion: 50,
            conversion_from_prev: 50,
        },
    ],
}

const SOURCES = {
    preset_key: 'sources',
    deals_by_source: [
        { source: 'Сайт', count: 4, amount: 400, won: 1, conversion: 25, avg_check: 100 },
        { source: '', count: 2, amount: 100, won: 0, conversion: 0, avg_check: 50 },
    ],
}

describe('parseRunResult: срезы пресетов (TODO-253)', () => {
    it('«По продажам» — динамика по дням, средний чек и конверсия', () => {
        const res = run(SALES, 'sales')
        expect(res.cards?.map((c) => c.key)).toEqual([
            'count',
            'amount',
            'avg_check',
            'won_count',
            'conversion',
        ])
        expect(res.cards?.find((c) => c.key === 'avg_check')).toMatchObject({
            value: 125,
            isCurrency: true,
        })
        expect(res.chart?.type).toBe('area')
        expect(res.chart?.categories).toEqual(['01.08', '02.08'])
        expect(res.table?.rows.map((r) => r.bucket)).toEqual(['01.08', '02.08'])
        // день — не измерение drill домена
        expect(res.drillable).toBe(false)
    })

    it('«По продажам» показывает PoP с totals_previous (не только fallback-сводка)', () => {
        const res = run(
            {
                ...SALES,
                totals_previous: { deals_count: 2, deals_amount: 250 },
            },
            'sales',
        )
        expect(res.cards?.find((c) => c.key === 'count')?.growth).toBe(100)
        expect(res.cards?.find((c) => c.key === 'amount')?.growth).toBe(100)
        expect(res.cards?.find((c) => c.key === 'won_count')?.growth).toBeUndefined()
    })

    it('«По воронке» — конверсия и зависшие, drill по стадии остаётся', () => {
        const res = run(FUNNEL, 'funnel')
        expect(res.table?.columns.map((c) => c.key)).toEqual([
            'stage_id',
            'count',
            'amount',
            'conversion',
            'conversion_from_prev',
            'stalled',
        ])
        // подпись стадии в ячейке, сырой id — в скрытой колонке для drill
        expect(res.table?.rows[0].stage_id).toBe('Новая')
        expect(res.table?.rows[0].__stage_id).toBe('s1')
        expect(res.primaryDimension).toBe('stage_id')
        expect(res.drillable).toBe(true)
        expect(res.cards?.find((c) => c.key === 'stalled')?.value).toBe(4)
    })

    it('«По клиентам» — карточки качества базы из contact_quality', () => {
        const res = run(
            {
                preset_key: 'clients',
                clients_totals: { contacts_new: 12, companies_new: 4 },
                contact_quality: {
                    total_contacts: 40,
                    filled_both_pct: 62.5,
                    duplicate_candidate_pairs: 3,
                    open_drift_links: 1,
                },
                top_companies: [],
            },
            'clients',
        )
        expect(res.cards?.map((c) => c.key)).toEqual([
            'contacts_new',
            'companies_new',
            'contact_quality_total',
            'contact_quality_filled',
            'contact_quality_dupes',
            'contact_quality_drift',
        ])
        expect(res.cards?.find((c) => c.key === 'contact_quality_filled')?.value).toBe(62.5)
    })

    it('«По клиентам» — новые контакты/компании и топ компаний по выручке', () => {
        const res = run(
            {
                preset_key: 'clients',
                clients_totals: {
                    contacts_new: 12,
                    companies_new: 4,
                    contacts_without_deals: 9,
                },
                top_companies: [
                    { company_id: 'c1', company_name: 'ООО «Ромашка»', count: 3, amount: 900 },
                ],
            },
            'clients',
        )
        expect(res.cards?.map((c) => c.value)).toEqual([12, 4, 9])
        expect(res.table?.rows[0].company_id).toBe('ООО «Ромашка»')
        expect(res.table?.rows[0].__company_id).toBe('c1')
        expect(res.drillable).toBe(true)
    })

    it('«По клиентам» — карточки «без сделок» нет, когда домен её не посчитал', () => {
        const res = run(
            {
                preset_key: 'clients',
                clients_totals: { contacts_new: 12, companies_new: 4 },
                top_companies: [],
            },
            'clients',
        )
        expect(res.cards?.map((c) => c.key)).toEqual(['contacts_new', 'companies_new'])
    })

    it('«По активности» — диаграмма по типам, таблица по исполнителям', () => {
        const res = run(
            {
                preset_key: 'activity',
                activity_totals: { count: 8, completed: 3, overdue: 3, open: 5 },
                activities_by_type: [
                    { type: 'call', count: 5, completed: 2, overdue: 1, open: 3 },
                    { type: 'task', count: 3, completed: 1, overdue: 2, open: 2 },
                ],
                activities_by_manager: [
                    {
                        manager_id: 'u-7',
                        manager_name: 'Иванов А.',
                        count: 8,
                        completed: 3,
                        overdue: 3,
                        open: 5,
                    },
                ],
            },
            'activity',
        )
        expect(res.chart?.type).toBe('pie')
        expect(res.chart?.categories).toEqual(['Звонок', 'Задача'])
        // оба среза каталога пресетов доходят до экрана: типы — на диаграмме,
        // исполнители — в таблице (сырой id остаётся в скрытой колонке)
        expect(res.table?.rows[0].manager_id).toBe('Иванов А.')
        expect(res.table?.rows[0].__manager_id).toBe('u-7')
        expect(res.primaryDimension).toBe('manager_id')
        expect(res.cards?.find((c) => c.key === 'overdue')?.value).toBe(3)
        expect(res.drillable).toBe(true)
    })

    it('«По активности» без исполнителей — таблица деградирует до типов', () => {
        const res = run(
            {
                preset_key: 'activity',
                activity_totals: { count: 3, completed: 1, overdue: 2, open: 2 },
                activities_by_type: [{ type: 'task', count: 3, completed: 1, overdue: 2, open: 2 }],
            },
            'activity',
        )
        expect(res.table?.rows[0].__type).toBe('task')
        expect(res.primaryDimension).toBe('type')
    })

    it('«По источникам» — пустой источник подписан, но drill идёт по сырому ключу', () => {
        const res = run(SOURCES, 'sources')
        expect(res.table?.rows.map((r) => r.source)).toEqual(['Сайт', 'Не указан'])
        expect(res.table?.rows[1].__source).toBe('')
        expect(res.primaryDimension).toBe('source')
        expect(res.drillable).toBe(true)
    })

    it('вкладки дают РАЗНЫЕ таблицы (главный дефект TODO-253)', () => {
        const sales = run(SALES, 'sales')
        const funnel = run(FUNNEL, 'funnel')
        const sources = run(SOURCES, 'sources')
        const columns = [sales, funnel, sources].map((r) =>
            r.table?.columns.map((c) => c.key).join(','),
        )
        expect(new Set(columns).size).toBe(3)
    })

    it('пресет берётся из определения отчёта, когда вкладка его не передала', () => {
        // открытие отчёта из списка (SCR-REPORTS-LIST) — forPreset не задан
        expect(run(SALES).primaryDimension).toBe('bucket')
    })

    it('старый домен без срезов пресета деградирует до общей сводки', () => {
        const res = run(
            {
                preset_key: 'sources',
                totals: { deals_count: 3 },
                deals_by_stage: [{ stage_id: 's1', count: 3, amount: 30 }],
            },
            'sources',
        )
        expect(res.primaryDimension).toBe('stage_id')
        expect(res.table?.columns[0].label).toBe('Стадия')
    })
})
