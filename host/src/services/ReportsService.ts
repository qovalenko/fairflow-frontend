import ApiService from './ApiService'

/**
 * Reports-domain API client (contract docs/tz/contracts/reports.md).
 *
 * Read-only композитор поверх CRM-доменов. Все запросы — на gateway REST `/api`.
 * `projectId` передаётся query-параметром (gateway также читает X-Project-Id) —
 * единая конвенция фронта. Небезопасные POST (run/export/drill/create) несут
 * `Idempotency-Key` (read-only run/export — для дедупа/кэша, §3.6/3.7).
 *
 * AS-IS gateway: `/api/reports?projectId=`, `POST /api/reports/:id/run|export`.
 * TO-BE path-isolation `/api/p/:pid/...` — OQ-REP-10 (роутинг gateway). Здесь
 * используется AS-IS-форма с `?projectId`, совместимая с текущим gateway.
 */

// ─── Идемпотентность ─────────────────────────────────────────────────────────

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

// ─── Типы (зеркало схем контракта) ──────────────────────────────────────────

/** Встроенные пресеты (FR-MREP-7). `by_managers` — TO-BE 6-й. */
export type PresetKey =
    | 'sales'
    | 'funnel'
    | 'clients'
    | 'activity'
    | 'sources'
    | 'by_managers'
    | 'my_overdue'

export type ReportKind = 'builtin' | 'custom' | string

/**
 * TODO-466 (FR-REPORTS-390): уровень доступа определения отчёта.
 * `personal` — виден только автору, `project` — участникам проекта.
 * До правки выбор радиокнопки конструктора уезжал СТРОКОЙ ОПИСАНИЯ
 * (`description: 'Личный'`) и нигде не хранился.
 */
export type ReportVisibility = 'personal' | 'project'

/** Определение отчёта (`reports_definitions`). */
export interface Report {
    id: string
    projectId: string
    name: string
    description?: string
    kind: ReportKind
    /** TO-BE — может отсутствовать в текущем билде be. */
    presetKey?: PresetKey | null
    /** TO-BE — Contextual UI пресета. */
    requiresModules?: string[]
    /** TODO-466: уровень доступа; пусто у старых билдов be = 'project'. */
    visibility?: ReportVisibility
    /** Declarative spec — GET custom для edit (TODO-474). */
    spec?: ReportSpecInput
    createdBy?: string | null
    createdAt: number
    updatedAt: number
}

/** Период прогона (§3.6 RunParams). */
export type RunPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'

export interface RunParams {
    period?: RunPeriod
    managerIds?: string[]
    departmentId?: string
    pipelineId?: string
    source?: string
    customFrom?: number
    customTo?: number
    stalledDays?: number
    pageIndex?: number
    pageSize?: number
    entityType?: string
    entityId?: string
}

export type VizType = 'area' | 'bar' | 'line' | 'pie' | 'funnel' | 'table'

export interface TableColumn {
    key: string
    label: string
    /** числовая колонка → выравнивание/форматирование. */
    numeric?: boolean
    currency?: boolean
    suffix?: string
}

export type TableRow = Record<string, string | number | null>

export interface ChartSeries {
    name: string
    data: number[]
}

export interface ReportChart {
    type: VizType
    categories?: string[]
    series?: ChartSeries[]
}

export interface ReportTotalCard {
    key: string
    label: string
    value: number
    growth?: number
    suffix?: string
    isCurrency?: boolean
    /** TO-BE FR-MREP-21 — формула метрики (тултип). */
    formula?: string
}

export interface ReportCoverage {
    departments?: { covered: number; total: number }
    managers?: { covered: number; total: number }
}

/**
 * Структурированный результат прогона (TO-BE §3.6).
 * AS-IS be отдаёт `data_json:string` — нормализуется в `parseRunResult`.
 */
export interface RunResult {
    reportId: string
    reportName: string
    generatedAt: number
    presetKey?: PresetKey | null
    params?: RunParams
    cards?: ReportTotalCard[]
    chart?: ReportChart | null
    table?: { columns: TableColumn[]; rows: TableRow[] } | null
    scopeNote?: string | null
    coverage?: ReportCoverage | null
    /** TO-BE ST-28 — отчёт может обновляться с задержкой. */
    eventualLag?: boolean
    /**
     * C4 — dimension первой колонки таблицы (для drill и сопоставления фильтра):
     * `stage_id` | `manager_id` | `department_id` | `source` …
     */
    primaryDimension?: string
    /**
     * Можно ли разворачивать строку таблицы в список записей. Домен умеет drill
     * только по своим измерениям (стадия/менеджер/отдел/источник), поэтому срезы
     * по дню, типу активности и компании отдаются некликабельными: иначе клик
     * уходил бы в INVALID_ARGUMENT.
     */
    drillable?: boolean
    /**
     * C4 — опции менеджеров, видимые в scope (для фильтра EL-MAIN-9). Берутся
     * из строк by_managers-среза → отражают РЕАЛЬНУЮ видимость актора.
     */
    managerOptions?: { id: string; name: string }[]
    /** C4 — опции отделов в scope (DEPTS / фильтр). */
    departmentOptions?: { id: string; name: string }[]
    /** NFR-020: пагинация основного агрегата прогона. */
    aggregatePagination?: {
        pageIndex: number
        pageSize: number
        totalGroups: number
    }
    /** FR-REPORTS-380: мини-срез карточки сущности (если передан entityType/entityId). */
    entityMini?: EntityMiniReport | null
}

export interface EntityMiniReport {
    entityType: string
    entityId: string
    found: boolean
    name?: string
    amount?: number
    stageId?: string
    status?: string
    activitiesTotal?: number
    activitiesOverdue?: number
    dealsCount?: number
    dealsAmount?: number
}

/** Drill-down (§3.8). */
export interface DrillCell {
    dimension: string
    value: string | number
}

export interface DrillItem {
    id: string
    name: string
    amount?: number
    ownerId?: string
    stageId?: string
    [k: string]: unknown
}

export interface DrillResult {
    items: DrillItem[]
    nextCursor: string | null
    hasMore: boolean
    total: number
}

export interface ExportResult {
    reportId: string
    format: 'csv' | 'json'
    fileName: string
    contentType: string
    payloadBase64: string
    generatedAt: number
}

// ─── Метаданные пресетов (Contextual UI + ярлыки) ────────────────────────────

export interface PresetMeta {
    key: PresetKey
    label: string
    /** Любой из модулей даёт доступ (OR-семантика per SCREENS §4 PRESET). */
    requiresModulesAny: string[]
    maturity: 'as-is' | 'to-be'
}

/** Карта пресетов: ярлык + Contextual UI (SCREENS EL-MAIN-3..8). */
export const PRESETS: PresetMeta[] = [
    { key: 'sales', label: 'По продажам', requiresModulesAny: ['deals'], maturity: 'as-is' },
    { key: 'funnel', label: 'По воронке', requiresModulesAny: ['deals'], maturity: 'as-is' },
    {
        key: 'clients',
        label: 'По клиентам',
        requiresModulesAny: ['contacts', 'companies'],
        maturity: 'as-is',
    },
    {
        key: 'activity',
        label: 'По активности',
        requiresModulesAny: ['activities'],
        maturity: 'as-is',
    },
    { key: 'sources', label: 'По источникам', requiresModulesAny: ['deals'], maturity: 'as-is' },
    {
        key: 'by_managers',
        label: 'По менеджерам',
        requiresModulesAny: ['deals'],
        maturity: 'to-be',
    },
    {
        key: 'my_overdue',
        label: 'Мои просрочки',
        requiresModulesAny: ['activities', 'deals'],
        maturity: 'to-be',
    },
]

/** Пресет доступен, если хотя бы один из требуемых модулей включён. */
export function presetEnabled(meta: PresetMeta, enabledModules: string[]): boolean {
    return meta.requiresModulesAny.some((m) => enabledModules.includes(m))
}

// ─── Период: опции селектора (TO-BE) ─────────────────────────────────────────

export const PERIOD_OPTIONS: { value: RunPeriod; label: string }[] = [
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'year', label: 'Год' },
]

// ─── API: определения ────────────────────────────────────────────────────────

export interface ListReportsParams {
    projectId: string
    pageIndex?: number
    pageSize?: number
    query?: string
}

/** GET /api/reports (§3.1). */
export async function apiListReports(params: ListReportsParams) {
    return ApiService.fetchDataWithAxios<{ list: Report[]; total: number }>({
        url: '/v1/reports',
        method: 'get',
        params,
    })
}

/** GET /api/reports/:id (§3.2). */
export async function apiGetReport(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<Report>({
        url: `/v1/reports/${id}`,
        method: 'get',
        params,
    })
}

export interface ReportSpecInput {
    entity?: string
    measures?: { fn: string; field?: string; alias?: string }[]
    groupBy?: { field: string }[]
    filters?: { field: string; operator: string; value: unknown }[]
    dateRange?: { kind: string; from?: number; to?: number }
    viz?: { type: VizType; xField?: string; yField?: string }
}

/** POST /api/reports (§3.3) — создать custom-отчёт. Право `reports:manage`. */
export async function apiCreateReport(
    body: {
        name: string
        description?: string
        spec?: ReportSpecInput
        kind?: string
        /** TODO-466: уровень доступа отдельным полем; без него be создаёт 'project'. */
        visibility?: ReportVisibility
    },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Report>({
        url: '/v1/reports',
        method: 'post',
        params,
        data: body,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** PATCH /api/reports/:id (§3.4, TO-BE) — редактировать custom. */
export async function apiUpdateReport(
    id: string,
    body: {
        name?: string
        description?: string
        spec?: ReportSpecInput
        /** TODO-466: не прислано = «не менять» (личный отчёт не расшаривается). */
        visibility?: ReportVisibility
    },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Report>({
        url: `/v1/reports/${id}`,
        method: 'patch',
        params,
        data: body,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** DELETE /api/reports/:id (§3.5, TO-BE) — soft-delete custom. */
export async function apiDeleteReport(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<{ id: string; deleted: boolean; deletedAt: number }>({
        url: `/v1/reports/${id}`,
        method: 'delete',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

// ─── API: исполнение ─────────────────────────────────────────────────────────

/**
 * POST /api/reports/:id/run (§3.6). Право `reports:read`, scope исполнителя.
 * AS-IS ответ `{ report_id, report_name, generated_at, data_json }` →
 * нормализуется `parseRunResult`. TO-BE — структурированный `{totals,table,chart,...}`.
 */
export async function apiRunReport(
    id: string,
    body: { params?: RunParams },
    params: { projectId: string },
    /** C4 — пресет/режим (sales|by_managers|depts…) для правильной сборки среза. */
    forPreset?: PresetKey | 'depts',
): Promise<RunResult> {
    const raw = await ApiService.fetchDataWithAxios<RawRunResponse>({
        url: `/v1/reports/${id}/run`,
        method: 'post',
        params,
        data: body,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
    return parseRunResult(raw, forPreset)
}

/** POST /api/reports/:id/export (§3.7). Право `reports:export`. */
export async function apiExportReport(
    id: string,
    body: { format?: 'csv' | 'json'; params?: RunParams },
    params: { projectId: string },
): Promise<ExportResult> {
    const raw = await ApiService.fetchDataWithAxios<RawExportResponse>({
        url: `/v1/reports/${id}/export`,
        method: 'post',
        params,
        data: body,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
    return {
        reportId: raw.report_id ?? raw.reportId ?? id,
        format: (raw.format as 'csv' | 'json') ?? 'csv',
        fileName: raw.file_name ?? raw.fileName ?? `report-${id}.csv`,
        contentType: raw.content_type ?? raw.contentType ?? 'text/csv; charset=utf-8',
        payloadBase64: raw.payload_base64 ?? raw.payloadBase64 ?? '',
        generatedAt: raw.generated_at ?? raw.generatedAt ?? Date.now(),
    }
}

/** POST /api/reports/:id/drill (§3.8, TO-BE) — записи за агрегатом. */
export async function apiDrillReport(
    id: string,
    body: { params?: RunParams; cell: DrillCell; limit?: number; cursor?: string },
    params: { projectId: string },
): Promise<DrillResult> {
    return ApiService.fetchDataWithAxios<DrillResult>({
        url: `/v1/reports/${id}/drill`,
        method: 'post',
        params,
        data: body,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

// ─── Нормализация AS-IS data_json → структурированный RunResult ───────────────

interface RawRunResponse {
    report_id?: string
    reportId?: string
    report_name?: string
    reportName?: string
    generated_at?: number
    generatedAt?: number
    /** AS-IS — сериализованный JSON. */
    data_json?: string
    /** TO-BE — структурированный (если be отдаёт сразу объект). */
    totals?: Record<string, number>
    table?: { columns: TableColumn[]; rows: TableRow[] }
    chart?: ReportChart
    scope_note?: string
    scopeNote?: string
    coverage?: ReportCoverage
    preset_key?: PresetKey
    presetKey?: PresetKey
}

interface RawExportResponse {
    report_id?: string
    reportId?: string
    format?: string
    file_name?: string
    fileName?: string
    content_type?: string
    contentType?: string
    payload_base64?: string
    payloadBase64?: string
    generated_at?: number
    generatedAt?: number
}

interface AsIsData {
    report_kind?: string
    /** Ключ пресета — домен дублирует его и в конверте ответа, и в data_json. */
    preset_key?: PresetKey
    generated_at?: number
    params?: RunParams
    /**
     * Пояснение видимости данных — домен кладёт его в `data_json` каждого
     * прогона (reports.service.ts `run()`). До правки поле не объявлялось и
     * терялось: все три сборки RunResult хардкодили `scopeNote: null`.
     */
    scope_note?: string
    totals?: {
        deals_count?: number
        deals_amount?: number
        orders_count?: number
        contacts_count?: number
        companies_count?: number
    }
    /** PoP-окно той же длины (FR-REPORTS-300). */
    totals_previous?: {
        deals_count?: number
        deals_amount?: number
        orders_count?: number
        contacts_count?: number
        companies_count?: number
    }
    /** FR-REPORTS-280: охват менеджеров/отделов в scope. */
    coverage?: ReportCoverage
    /**
     * TODO-470 — `stage_name` дописывает gateway (`report-run-names.service.ts`)
     * поверх сырого среза: `stage_id` остаётся UUID (по нему идёт drill), имя —
     * только для показа. Поле опционально: если резолв стадий не удался,
     * работает фоллбек на id.
     */
    deals_by_stage?: { stage_id: string; stage_name?: string; count: number; amount: number }[]
    orders_by_stage?: { stage_id: string; stage_name?: string; count: number }[]
    /** C4 — срез по менеджерам (by_managers, FR-MREP-8). */
    deals_by_manager?: {
        manager_id: string
        manager_name?: string
        row_kind?: string
        count: number
        amount: number
        won?: number
        lost?: number
    }[]
    /** Срез пресета `sales` (FR-REPORTS-090): динамика по дням + итоги. */
    sales_dynamics?: { bucket: string; count: number; amount: number }[]
    sales_totals?: {
        count?: number
        amount?: number
        won_count?: number
        won_amount?: number
        lost_count?: number
        open_count?: number
        avg_check?: number
        conversion?: number
    }
    /** Срез пресета `funnel`: стадии в порядке воронки + конверсия. */
    funnel_stages?: {
        stage_id: string
        stage_name?: string
        count: number
        amount: number
        stalled?: number
        conversion?: number
        conversion_from_prev?: number
    }[]
    /** Порог «зависшей» сделки в днях (подпись формулы карточки). */
    stalled_days?: number
    /** FR-REPORTS-160/270: каталог визуализации и формул с бэкенда. */
    viz?: { type?: VizType }
    metric_formulas?: Record<string, string>
    /** FR-REPORTS-360: результат custom spec. */
    custom_table?: {
        group_field: string
        measure_fn: string
        rows: Array<{ key: string; value: number }>
    }
    /** TODO-473: срез типов продаж в прогоне. */
    order_types?: Array<{ order_type_id: string; orders_count: number }>
    /** Срез пресета `clients`. */
    clients_totals?: {
        contacts_new?: number
        companies_new?: number
        contacts_without_deals?: number
    }
    contact_quality?: {
        total_contacts?: number
        filled_both_pct?: number
        duplicate_candidate_pairs?: number
        open_drift_links?: number
    }
    top_companies?: {
        company_id: string
        company_name?: string
        count: number
        amount: number
    }[]
    /** Срез пресета `activity`. */
    activity_totals?: {
        count?: number
        completed?: number
        overdue?: number
        open?: number
    }
    activities_by_type?: {
        type: string
        count: number
        completed?: number
        overdue?: number
        open?: number
    }[]
    activities_by_manager?: {
        manager_id: string
        manager_name?: string
        count: number
        completed?: number
        overdue?: number
        open?: number
    }[]
    /** Срез пресета `sources`. */
    deals_by_source?: {
        source: string
        source_name?: string
        count: number
        amount: number
        won?: number
        conversion?: number
        avg_check?: number
    }[]
    /** Срез пресета не посчитался (домен fail-soft) — рисуем общую сводку. */
    preset_partial?: boolean
    /** C4 — срез по отделам (by_departments / SCR-REPORTS-DEPTS, FR-MREP-25). */
    deals_by_department?: {
        department_id: string
        department_name?: string
        count: number
        amount: number
        won?: number
        lost?: number
        conversion?: number
        avg_check?: number
    }[]
    /** FR-REPORTS-110: персональный срез просрочек Member. */
    my_overdue_totals?: {
        overdue_activities?: number
        inactive_deals?: number
        stalled_days?: number
    }
    my_overdue_activities?: {
        activity_id: string
        title: string
        type: string
        due_at: number
        assignee_id?: string
    }[]
    my_inactive_deals?: {
        deal_id: string
        name: string
        amount: number
        stage_id: string
        days_inactive: number
    }[]
    /** NFR-020: метаданные пагинации агрегата. */
    aggregate_pagination?: {
        page_index?: number
        page_size?: number
        total_groups?: number
    }
    /** FR-REPORTS-380: мини-срез для карточки сущности. */
    entity_mini?: Record<string, unknown>
}

const RUB = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
})

export function formatRub(value: number): string {
    return RUB.format(value)
}

/** Дата-время «DD.MM.YYYY HH:mm» без внешних зависимостей. */
export function formatDateTime(ms: number): string {
    const d = new Date(ms)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** PoP в процентах для карточки KPI (FR-REPORTS-300). */
function growthPct(value: number, previous: number): number | undefined {
    if (previous > 0) return Math.round(((value - previous) / previous) * 100)
    if (previous === 0 && value > 0) return undefined
    return 0
}

function attachPagination(result: RunResult, data: AsIsData): RunResult {
    const p = data.aggregate_pagination
    const entityMini = parseEntityMini(data)
    const withEntity = entityMini ? { ...result, entityMini } : result
    if (!p) return withEntity
    return {
        ...withEntity,
        aggregatePagination: {
            pageIndex: p.page_index ?? 0,
            pageSize: p.page_size ?? 25,
            totalGroups: p.total_groups ?? 0,
        },
    }
}

/** FR-REPORTS-380: нормализация entity_mini из data_json прогона. */
export function parseEntityMini(data: AsIsData): EntityMiniReport | null {
    const m = data.entity_mini
    if (!m || typeof m !== 'object') return null
    return {
        entityType: String(m.entity_type ?? ''),
        entityId: String(m.entity_id ?? ''),
        found: Boolean(m.found),
        name: m.name != null ? String(m.name) : undefined,
        amount: m.amount != null ? Number(m.amount) : undefined,
        stageId: m.stage_id != null ? String(m.stage_id) : undefined,
        status: m.status != null ? String(m.status) : undefined,
        activitiesTotal:
            m.activities_total != null ? Number(m.activities_total) : undefined,
        activitiesOverdue:
            m.activities_overdue != null ? Number(m.activities_overdue) : undefined,
        dealsCount: m.deals_count != null ? Number(m.deals_count) : undefined,
        dealsAmount: m.deals_amount != null ? Number(m.deals_amount) : undefined,
    }
}

/**
 * Срезы пресетов рисуют свои карточки (`count`/`amount`), а не `totalsCards`.
 * Без этой склейки `totals_previous` доезжал в data_json, но тренд на вкладках
 * «Продажи» / «Воронка» / «Источники» никогда не показывался.
 */
function withDealPop(cards: ReportTotalCard[], data: AsIsData): ReportTotalCard[] {
    const p = data.totals_previous
    if (!p) return cards
    return cards.map((c) => {
        if (c.key === 'count') {
            return { ...c, growth: growthPct(c.value, p.deals_count ?? 0) }
        }
        if (c.key === 'amount') {
            return { ...c, growth: growthPct(c.value, p.deals_amount ?? 0) }
        }
        return c
    })
}

function totalsCards(data: AsIsData): ReportTotalCard[] {
    const t = data.totals ?? {}
    const p = data.totals_previous
    return [
        {
            key: 'deals_count',
            label: 'Сделок',
            value: t.deals_count ?? 0,
            growth: p ? growthPct(t.deals_count ?? 0, p.deals_count ?? 0) : undefined,
        },
        {
            key: 'deals_amount',
            label: 'Сумма сделок',
            value: t.deals_amount ?? 0,
            isCurrency: true,
            growth: p ? growthPct(t.deals_amount ?? 0, p.deals_amount ?? 0) : undefined,
        },
        {
            key: 'orders_count',
            label: 'Продаж',
            value: t.orders_count ?? 0,
            growth: p ? growthPct(t.orders_count ?? 0, p.orders_count ?? 0) : undefined,
        },
        {
            key: 'contacts_count',
            label: 'Контактов',
            value: t.contacts_count ?? 0,
            growth: p ? growthPct(t.contacts_count ?? 0, p.contacts_count ?? 0) : undefined,
        },
        {
            key: 'companies_count',
            label: 'Компаний',
            value: t.companies_count ?? 0,
            growth: p ? growthPct(t.companies_count ?? 0, p.companies_count ?? 0) : undefined,
        },
    ]
}

/** Подставляет формулы метрик из каталога бэкенда (FR-REPORTS-270). */
function withFormulas(cards: ReportTotalCard[], formulas?: Record<string, string>): ReportTotalCard[] {
    if (!formulas) return cards
    return cards.map((c) => (formulas[c.key] ? { ...c, formula: formulas[c.key] } : c))
}

/** Тип диаграммы: spec/каталог пресета → fallback. */
function resolveChartType(data: AsIsData, fallback: VizType): VizType {
    const t = data.viz?.type
    return t && ['area', 'bar', 'line', 'pie', 'funnel', 'table'].includes(t) ? t : fallback
}

/**
 * Нормализует ответ Run в структурированный `RunResult`.
 * Поддерживает оба формата: TO-BE (объект) и AS-IS (`data_json:string`).
 */
export function parseRunResult(
    raw: RawRunResponse,
    forPreset?: PresetKey | 'depts',
): RunResult {
    const reportId = raw.report_id ?? raw.reportId ?? ''
    const reportName = raw.report_name ?? raw.reportName ?? ''
    const generatedAt = raw.generated_at ?? raw.generatedAt ?? Date.now()
    let data: AsIsData = {}
    if (raw.data_json) {
        try {
            data = JSON.parse(raw.data_json) as AsIsData
        } catch {
            data = {}
        }
    }

    const presetKey =
        raw.preset_key ??
        raw.presetKey ??
        (data as { preset_key?: PresetKey }).preset_key ??
        null

    // TO-BE: be уже отдал структуру.
    if (raw.table || raw.chart || raw.totals) {
        const cards = raw.totals
            ? Object.entries(raw.totals).map(([key, value]) => ({
                  key,
                  label: key,
                  value: Number(value) || 0,
              }))
            : undefined
        return {
            reportId,
            reportName,
            generatedAt,
            presetKey,
            cards,
            chart: raw.chart ?? null,
            table: raw.table ?? null,
            scopeNote: raw.scope_note ?? raw.scopeNote ?? null,
            coverage: raw.coverage ?? null,
            primaryDimension: raw.table?.columns?.[0]?.key,
        }
    }

    // ── C4: срез «По менеджерам» (by_managers, FR-MREP-8) ──
    if (forPreset === 'by_managers' && data.deals_by_manager) {
        return buildManagerSlice(reportId, reportName, generatedAt, presetKey, data)
    }
    // ── C4: срез «Сравнение отделов» (depts, FR-MREP-25) ──
    if (forPreset === 'depts' && data.deals_by_department) {
        return buildDepartmentSlice(reportId, reportName, generatedAt, presetKey, data)
    }

    // ── FR-REPORTS-090: срез СВОЕГО пресета ──
    // Вкладка знает свой пресет (`forPreset`), открытие отчёта из списка — нет,
    // поэтому фоллбек на `preset_key` самого определения. Каждая ветка ждёт
    // «свои» поля: их нет (старый билд домена / упавший срез `preset_partial`)
    // — падаем в общую сводку ниже, как раньше.
    const preset = forPreset && forPreset !== 'depts' ? forPreset : presetKey
    const base: SliceBase = { reportId, reportName, generatedAt, presetKey }
    if (data.custom_table) {
        const ct = data.custom_table
        const chartType = resolveChartType(data, 'bar')
        const tableRows = ct.rows.map((r) => ({ key: r.key, value: r.value }))
        return {
            ...base,
            params: data.params,
            cards: [],
            chart:
                chartType !== 'table' && tableRows.length
                    ? {
                          type: chartType,
                          categories: tableRows.map((r) => String(r.key)),
                          series: [{ name: ct.measure_fn, data: tableRows.map((r) => Number(r.value)) }],
                      }
                    : null,
            table: {
                columns: [
                    { key: 'key', label: ct.group_field },
                    { key: 'value', label: ct.measure_fn, numeric: true },
                ],
                rows: tableRows,
            },
            scopeNote: data.scope_note ?? null,
            coverage: data.coverage ?? null,
            primaryDimension: 'key',
            drillable: false,
        }
    }
    if (preset === 'sales' && data.sales_totals) return attachPagination(buildSalesSlice(base, data), data)
    if (preset === 'funnel' && data.funnel_stages) return attachPagination(buildFunnelSlice(base, data), data)
    if (preset === 'clients' && data.clients_totals) return attachPagination(buildClientsSlice(base, data), data)
    if (preset === 'activity' && data.activity_totals) return attachPagination(buildActivitySlice(base, data), data)
    if (preset === 'sources' && data.deals_by_source) return attachPagination(buildSourcesSlice(base, data), data)
    if (preset === 'my_overdue' && data.my_overdue_totals) {
        return attachPagination(buildMyOverdueSlice(base, data), data)
    }

    const cards: ReportTotalCard[] = withFormulas(totalsCards(data), data.metric_formulas)

    const byStage = data.deals_by_stage ?? []
    // TODO-470: показываем подпись стадии (её дописывает gateway), а не UUID.
    // Сырой id уезжает в скрытую `__stage_id` — по ней Reports.tsx строит drill
    // (`__<dim> ?? <dim>`), поэтому переименование ячейки drill не ломает.
    // `||`, а не `??`: пустое имя должно откатываться на id, иначе ячейка «Стадия»
    // окажется пустой. (Соседние manager/department-хелперы обходятся `??`, потому
    // что там пустые имена отсекает сам gateway; здесь фоллбек дешевле допущения.)
    const stageName = (r: { stage_id: string; stage_name?: string }) => r.stage_name || r.stage_id
    const table = byStage.length
        ? {
              columns: [
                  { key: 'stage_id', label: 'Стадия' },
                  { key: 'count', label: 'Сделок', numeric: true },
                  { key: 'amount', label: 'Сумма', numeric: true, currency: true },
              ] as TableColumn[],
              rows: byStage.map((r) => ({
                  stage_id: stageName(r),
                  __stage_id: r.stage_id,
                  count: r.count,
                  amount: r.amount,
              })) as TableRow[],
          }
        : null

    const chart: ReportChart | null = byStage.length
        ? {
              type: resolveChartType(data, 'bar'),
              categories: byStage.map(stageName),
              series: [{ name: 'Сделок', data: byStage.map((r) => r.count) }],
          }
        : null

    return attachPagination(
        {
            reportId,
            reportName,
            generatedAt,
            presetKey,
            params: data.params,
            cards,
            chart,
            table,
            scopeNote: data.scope_note ?? null,
            coverage: data.coverage ?? null,
            primaryDimension: 'stage_id',
        },
        data,
    )
}

/** C4 — сборка среза «По менеджерам» (scope-aware: строки = видимые менеджеры). */
function buildManagerSlice(
    reportId: string,
    reportName: string,
    generatedAt: number,
    presetKey: PresetKey | null,
    data: AsIsData,
): RunResult {
    const rows = data.deals_by_manager ?? []
    const managerName = (r: {
        manager_id: string
        manager_name?: string
        row_kind?: string
    }) =>
        r.row_kind === 'department_benchmark'
            ? r.manager_name ?? 'Среднее по отделу'
            : r.manager_name ?? r.manager_id
    const table = {
        columns: [
            { key: 'manager_id', label: 'Менеджер' },
            { key: 'count', label: 'Сделок', numeric: true },
            { key: 'amount', label: 'Сумма', numeric: true, currency: true },
            { key: 'won', label: 'Won', numeric: true },
            { key: 'lost', label: 'Lost', numeric: true },
        ] as TableColumn[],
        rows: rows.map((r) => ({
            manager_id: managerName(r),
            __manager_id: r.manager_id,
            __row_kind: r.row_kind ?? null,
            count: r.count,
            amount: r.amount,
            won: r.won ?? null,
            lost: r.lost ?? null,
        })) as TableRow[],
    }
    const chart: ReportChart | null = rows.length
        ? {
              type: resolveChartType(data, 'bar'),
              categories: rows.map(managerName),
              series: [{ name: 'Сумма', data: rows.map((r) => r.amount) }],
          }
        : null
    return {
        reportId,
        reportName,
        generatedAt,
        presetKey,
        params: data.params,
        cards: withFormulas([], data.metric_formulas),
        chart,
        table,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'manager_id',
        managerOptions: rows
            .filter((r) => r.row_kind !== 'department_benchmark')
            .map((r) => ({ id: r.manager_id, name: managerName(r) })),
        drillable: rows.some((r) => r.row_kind !== 'department_benchmark'),
    }
}

/** C4 — сборка матрицы «Сравнение отделов» (SCR-REPORTS-DEPTS, FR-MREP-25). */
function buildDepartmentSlice(
    reportId: string,
    reportName: string,
    generatedAt: number,
    presetKey: PresetKey | null,
    data: AsIsData,
): RunResult {
    const rows = data.deals_by_department ?? []
    const deptName = (r: { department_id: string; department_name?: string }) =>
        r.department_name ?? r.department_id
    const table = {
        columns: [
            { key: 'department_id', label: 'Отдел' },
            { key: 'won', label: 'Won', numeric: true },
            { key: 'lost', label: 'Lost', numeric: true },
            { key: 'amount', label: 'Выручка', numeric: true, currency: true },
            { key: 'conversion', label: 'Конверсия', numeric: true, suffix: '%' },
            { key: 'avg_check', label: 'Ср. чек', numeric: true, currency: true },
        ] as TableColumn[],
        rows: rows.map((r) => ({
            department_id: deptName(r),
            __department_id: r.department_id,
            won: r.won ?? null,
            lost: r.lost ?? null,
            amount: r.amount,
            conversion: r.conversion ?? null,
            avg_check: r.avg_check ?? null,
        })) as TableRow[],
    }
    const chart: ReportChart | null = rows.length
        ? {
              type: resolveChartType(data, 'bar'),
              categories: rows.map(deptName),
              series: [{ name: 'Выручка', data: rows.map((r) => r.amount) }],
          }
        : null
    return {
        reportId,
        reportName,
        generatedAt,
        presetKey,
        params: data.params,
        cards: [],
        chart,
        table,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'department_id',
        departmentOptions: rows.map((r) => ({ id: r.department_id, name: deptName(r) })),
        drillable: true,
    }
}

// ─── Срезы пресетов (FR-REPORTS-090) ─────────────────────────────────────────

/** Общая «шапка» ответа, из которой собирается любой срез. */
type SliceBase = Pick<
    RunResult,
    'reportId' | 'reportName' | 'generatedAt' | 'presetKey'
>

/** 'YYYY-MM-DD' → 'DD.MM' (подпись дня в динамике и в таблице). */
function formatDay(bucket: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket)
    return m ? `${m[3]}.${m[2]}` : bucket
}

/** Человеческие подписи типов активностей (домен отдаёт ключи activity.TYPES). */
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
    task: 'Задача',
    call: 'Звонок',
    meeting: 'Встреча',
    note: 'Заметка',
}

/** «По продажам»: динамика по дням + средний чек и исход сделок. */
function buildSalesSlice(base: SliceBase, data: AsIsData): RunResult {
    const t = data.sales_totals ?? {}
    const rows = data.sales_dynamics ?? []
    const cards: ReportTotalCard[] = withFormulas(
        [
        { key: 'count', label: 'Сделок', value: t.count ?? 0 },
        { key: 'amount', label: 'Сумма', value: t.amount ?? 0, isCurrency: true },
        {
            key: 'avg_check',
            label: 'Средний чек',
            value: Math.round(t.avg_check ?? 0),
            isCurrency: true,
            formula: 'Сумма сделок ÷ количество сделок за период',
        },
        { key: 'won_count', label: 'Выиграно', value: t.won_count ?? 0 },
        {
            key: 'conversion',
            label: 'Конверсия',
            value: t.conversion ?? 0,
            suffix: '%',
            formula: 'Выигранные сделки ÷ все сделки периода',
        },
        ],
        data.metric_formulas,
    )
    return {
        ...base,
        params: data.params,
        cards: withDealPop(cards, data),
        chart: rows.length
            ? {
                  type: resolveChartType(data, 'area'),
                  categories: rows.map((r) => formatDay(r.bucket)),
                  series: [{ name: 'Сумма', data: rows.map((r) => r.amount) }],
              }
            : null,
        table: rows.length
            ? {
                  columns: [
                      { key: 'bucket', label: 'Дата' },
                      { key: 'count', label: 'Сделок', numeric: true },
                      { key: 'amount', label: 'Сумма', numeric: true, currency: true },
                  ],
                  rows: rows.map((r) => ({
                      bucket: formatDay(r.bucket),
                      __bucket: r.bucket,
                      count: r.count,
                      amount: r.amount,
                  })),
              }
            : null,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'bucket',
        // День — не измерение детализации домена (drill разворачивает сделки по
        // стадии/менеджеру/отделу/источнику), поэтому строки некликабельны.
        drillable: false,
    }
}

/** «По воронке»: стадии в порядке воронки, конверсия и зависшие сделки. */
function buildFunnelSlice(base: SliceBase, data: AsIsData): RunResult {
    const rows = data.funnel_stages ?? []
    const total = rows.reduce((acc, r) => acc + r.count, 0)
    const amount = rows.reduce((acc, r) => acc + r.amount, 0)
    const stalled = rows.reduce((acc, r) => acc + (r.stalled ?? 0), 0)
    const staleDays = data.stalled_days ?? 7
    const cards: ReportTotalCard[] = withFormulas(
        [
            { key: 'count', label: 'Сделок в воронке', value: total },
            { key: 'amount', label: 'Сумма', value: amount, isCurrency: true },
            {
                key: 'conversion',
                label: 'Доходит до конца',
                value: rows.length ? (rows[rows.length - 1].conversion ?? 0) : 0,
                suffix: '%',
                formula: 'Сделки на последней стадии ÷ сделки на входной стадии',
            },
            {
                key: 'stalled',
                label: 'Зависших',
                value: stalled,
                formula: `Открытые сделки без движения по стадии дольше ${staleDays} дн.`,
            },
        ],
        data.metric_formulas,
    )
    const label = (r: { stage_id: string; stage_name?: string }) =>
        r.stage_name || r.stage_id
    return {
        ...base,
        params: data.params,
        cards: withDealPop(cards, data),
        chart: rows.length
            ? {
                  type: resolveChartType(data, 'funnel'),
                  categories: rows.map(label),
                  series: [{ name: 'Сделок', data: rows.map((r) => r.count) }],
              }
            : null,
        table: rows.length
            ? {
                  columns: [
                      { key: 'stage_id', label: 'Стадия' },
                      { key: 'count', label: 'Сделок', numeric: true },
                      { key: 'amount', label: 'Сумма', numeric: true, currency: true },
                      { key: 'conversion', label: 'От входа', numeric: true, suffix: '%' },
                      {
                          key: 'conversion_from_prev',
                          label: 'От предыдущей',
                          numeric: true,
                          suffix: '%',
                      },
                      { key: 'stalled', label: 'Зависших', numeric: true },
                  ],
                  rows: rows.map((r) => ({
                      stage_id: label(r),
                      __stage_id: r.stage_id,
                      count: r.count,
                      amount: r.amount,
                      conversion: r.conversion ?? null,
                      conversion_from_prev: r.conversion_from_prev ?? null,
                      stalled: r.stalled ?? null,
                  })),
              }
            : null,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'stage_id',
        drillable: true,
    }
}

/** «По клиентам»: новые контакты/компании и топ компаний по выручке. */
function buildClientsSlice(base: SliceBase, data: AsIsData): RunResult {
    const t = data.clients_totals ?? {}
    const rows = data.top_companies ?? []
    const cards: ReportTotalCard[] = withFormulas(
        [
            { key: 'contacts_new', label: 'Новых контактов', value: t.contacts_new ?? 0 },
            { key: 'companies_new', label: 'Новых компаний', value: t.companies_new ?? 0 },
        ],
        data.metric_formulas,
    )
    // Метрики нет, когда связей «контакт → сделка» больше домашнего предела
    // домена: карточка не рисуется вовсе, а не показывает ноль.
    if (typeof t.contacts_without_deals === 'number') {
        cards.push({
            key: 'contacts_without_deals',
            label: 'Контактов без сделок',
            value: t.contacts_without_deals,
            formula: 'Контакты периода, на которых не заведено ни одной сделки',
        })
    }
    const q = data.contact_quality
    if (q) {
        if (typeof q.total_contacts === 'number') {
            cards.push({
                key: 'contact_quality_total',
                label: 'Контактов в базе',
                value: q.total_contacts,
            })
        }
        if (typeof q.filled_both_pct === 'number') {
            cards.push({
                key: 'contact_quality_filled',
                label: 'Заполненность email+телефон, %',
                value: q.filled_both_pct,
                formula: 'Доля живых контактов, у которых заполнены и email, и телефон',
            })
        }
        if (typeof q.duplicate_candidate_pairs === 'number') {
            cards.push({
                key: 'contact_quality_dupes',
                label: 'Пар дублей',
                value: q.duplicate_candidate_pairs,
            })
        }
        if (typeof q.open_drift_links === 'number') {
            cards.push({
                key: 'contact_quality_drift',
                label: 'Открытый drift связей',
                value: q.open_drift_links,
            })
        }
    }
    const label = (r: { company_id: string; company_name?: string }) =>
        r.company_name || r.company_id || 'Без компании'
    return {
        ...base,
        params: data.params,
        cards,
        chart: rows.length
            ? {
                  type: resolveChartType(data, 'bar'),
                  categories: rows.map(label),
                  series: [{ name: 'Сумма', data: rows.map((r) => r.amount) }],
              }
            : null,
        table: rows.length
            ? {
                  columns: [
                      { key: 'company_id', label: 'Компания' },
                      { key: 'count', label: 'Сделок', numeric: true },
                      { key: 'amount', label: 'Сумма', numeric: true, currency: true },
                  ],
                  rows: rows.map((r) => ({
                      company_id: label(r),
                      __company_id: r.company_id,
                      count: r.count,
                      amount: r.amount,
                  })),
              }
            : null,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'company_id',
        // drill разворачивает ячейку в сделки компании (company_id на crm_deals).
        drillable: true,
    }
}

/** «По активности»: типы, исполнители и просрочки. */
function buildActivitySlice(base: SliceBase, data: AsIsData): RunResult {
    const t = data.activity_totals ?? {}
    const rows = data.activities_by_type ?? []
    const cards: ReportTotalCard[] = withFormulas(
        [
            { key: 'count', label: 'Активностей', value: t.count ?? 0 },
            { key: 'completed', label: 'Выполнено', value: t.completed ?? 0 },
            {
                key: 'overdue',
                label: 'Просрочено',
                value: t.overdue ?? 0,
                formula: 'Незавершённые активности, срок которых уже прошёл',
            },
            { key: 'open', label: 'В работе', value: t.open ?? 0 },
        ],
        data.metric_formulas,
    )
    const label = (r: { type: string }) => ACTIVITY_TYPE_LABEL[r.type] ?? (r.type || 'Прочее')
    const managers = data.activities_by_manager ?? []
    const managerName = (r: { manager_id: string; manager_name?: string }) =>
        r.manager_name || r.manager_id || 'Без исполнителя'
    // Диаграмма — по типам, таблица — по исполнителям: экран показывает оба
    // среза каталога пресетов («активности по типам/менеджерам»), а не один.
    // Нет исполнителей — таблица деградирует до типов, вкладка не пустеет.
    const table = managers.length
        ? {
              columns: [
                  { key: 'manager_id', label: 'Исполнитель' },
                  { key: 'count', label: 'Всего', numeric: true },
                  { key: 'completed', label: 'Выполнено', numeric: true },
                  { key: 'overdue', label: 'Просрочено', numeric: true },
                  { key: 'open', label: 'В работе', numeric: true },
              ] as TableColumn[],
              rows: managers.map((r) => ({
                  manager_id: managerName(r),
                  __manager_id: r.manager_id,
                  count: r.count,
                  completed: r.completed ?? null,
                  overdue: r.overdue ?? null,
                  open: r.open ?? null,
              })) as TableRow[],
          }
        : rows.length
          ? {
                columns: [
                    { key: 'type', label: 'Тип' },
                    { key: 'count', label: 'Всего', numeric: true },
                    { key: 'completed', label: 'Выполнено', numeric: true },
                    { key: 'overdue', label: 'Просрочено', numeric: true },
                    { key: 'open', label: 'В работе', numeric: true },
                ] as TableColumn[],
                rows: rows.map((r) => ({
                    type: label(r),
                    __type: r.type,
                    count: r.count,
                    completed: r.completed ?? null,
                    overdue: r.overdue ?? null,
                    open: r.open ?? null,
                })) as TableRow[],
            }
          : null
    return {
        ...base,
        params: data.params,
        cards,
        chart: rows.length
            ? {
                  type: resolveChartType(data, 'pie'),
                  categories: rows.map(label),
                  series: [{ name: 'Активностей', data: rows.map((r) => r.count) }],
              }
            : null,
        table,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: managers.length ? 'manager_id' : 'type',
        drillable: true,
    }
}

/** FR-REPORTS-110: персональный срез просрочек для Member (`only_own`). */
function buildMyOverdueSlice(base: SliceBase, data: AsIsData): RunResult {
    const t = data.my_overdue_totals ?? {}
    const staleDays = t.stalled_days ?? data.stalled_days ?? 7
    const overdueRows = data.my_overdue_activities ?? []
    const inactiveRows = data.my_inactive_deals ?? []
    const cards: ReportTotalCard[] = withFormulas(
        [
            {
                key: 'overdue_activities',
                label: 'Просроченные активности',
                value: t.overdue_activities ?? overdueRows.length,
                formula: 'Незавершённые активности в вашем scope, срок которых прошёл',
            },
            {
                key: 'inactive_deals',
                label: 'Сделки без активности',
                value: t.inactive_deals ?? inactiveRows.length,
                formula: `Открытые сделки без связанной активности дольше ${staleDays} дн.`,
            },
        ],
        data.metric_formulas,
    )
    const tableRows: TableRow[] = [
        ...overdueRows.map((r) => ({
            kind: 'Просроченная активность',
            title: r.title,
            detail: r.due_at ? formatDateTime(r.due_at) : '—',
            __activity_id: r.activity_id,
        })),
        ...inactiveRows.map((r) => ({
            kind: 'Сделка без активности',
            title: r.name,
            detail: `${r.days_inactive} дн.`,
            __deal_id: r.deal_id,
        })),
    ]
    return {
        ...base,
        params: data.params,
        cards,
        chart: null,
        table: tableRows.length
            ? {
                  columns: [
                      { key: 'kind', label: 'Тип' },
                      { key: 'title', label: 'Название' },
                      { key: 'detail', label: 'Деталь' },
                  ],
                  rows: tableRows,
              }
            : null,
        scopeNote: data.scope_note ?? 'Персональный срез: только ваши записи в рамках видимости',
        coverage: data.coverage ?? null,
        primaryDimension: overdueRows.length ? 'activity_id' : 'deal_id',
        drillable: false,
    }
}

/** «По источникам»: объём, выручка, конверсия и средний чек по источнику. */
function buildSourcesSlice(base: SliceBase, data: AsIsData): RunResult {
    const rows = data.deals_by_source ?? []
    const count = rows.reduce((acc, r) => acc + r.count, 0)
    const amount = rows.reduce((acc, r) => acc + r.amount, 0)
    const cards: ReportTotalCard[] = withFormulas(
        [
            { key: 'count', label: 'Сделок', value: count },
            { key: 'amount', label: 'Сумма', value: amount, isCurrency: true },
            {
                key: 'avg_check',
                label: 'Средний чек',
                value: count > 0 ? Math.round(amount / count) : 0,
                isCurrency: true,
                formula: 'Сумма сделок ÷ количество сделок за период',
            },
        ],
        data.metric_formulas,
    )
    const label = (r: { source: string; source_name?: string }) =>
        r.source_name || r.source || 'Не указан'
    return {
        ...base,
        params: data.params,
        cards: withDealPop(cards, data),
        chart: rows.length
            ? {
                  type: resolveChartType(data, 'pie'),
                  categories: rows.map(label),
                  series: [{ name: 'Сумма', data: rows.map((r) => r.amount) }],
              }
            : null,
        table: rows.length
            ? {
                  columns: [
                      { key: 'source', label: 'Источник' },
                      { key: 'count', label: 'Сделок', numeric: true },
                      { key: 'amount', label: 'Сумма', numeric: true, currency: true },
                      { key: 'won', label: 'Выиграно', numeric: true },
                      { key: 'conversion', label: 'Конверсия', numeric: true, suffix: '%' },
                      { key: 'avg_check', label: 'Ср. чек', numeric: true, currency: true },
                  ],
                  rows: rows.map((r) => ({
                      source: label(r),
                      // Сырой ключ источника: по нему домен разворачивает ячейку
                      // в список сделок (подпись «Не указан» не сматчить).
                      __source: r.source,
                      count: r.count,
                      amount: r.amount,
                      won: r.won ?? null,
                      conversion: r.conversion ?? null,
                      avg_check: Math.round(r.avg_check ?? 0),
                  })),
              }
            : null,
        scopeNote: data.scope_note ?? null,
        coverage: data.coverage ?? null,
        primaryDimension: 'source',
        drillable: true,
    }
}

/** Скачать base64-файл экспорта (ST-29). */
export function downloadExport(res: ExportResult): void {
    const link = document.createElement('a')
    link.href = `data:${res.contentType};base64,${res.payloadBase64}`
    link.download = res.fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

/** Coverage-строка (SCREENS §15, закрытие MAJ-2). */
export function coverageLabel(coverage?: ReportCoverage | null): string | null {
    if (!coverage) return null
    const parts: string[] = []
    if (coverage.managers && coverage.managers.covered < coverage.managers.total) {
        parts.push(`${coverage.managers.covered} из ${coverage.managers.total} менеджеров`)
    }
    if (coverage.departments && coverage.departments.covered < coverage.departments.total) {
        parts.push(`${coverage.departments.covered} из ${coverage.departments.total} отделов`)
    }
    if (!parts.length) return 'Данные по всему проекту'
    return `Данные: ${parts.join(' · ')}`
}
