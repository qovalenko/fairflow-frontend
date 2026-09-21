import ApiService from './ApiService'

/**
 * Automation-domain API client (contract docs/tz/contracts/automation.md).
 *
 * Все запросы идут на gateway REST `/api`. `projectId` передаётся query-параметром
 * (gateway также читает заголовок X-Project-Id) — единая конвенция фронта.
 * Небезопасные мутации несут `Idempotency-Key` (генерируется на клиенте).
 *
 * Гейтинг прав — на FE через usePermission (UX). Истина — backend-guard
 * (`@RequirePermission('automation', …)`, см. SEC-BLOCKER-1 в контракте §1).
 */

// ─── Типы (зеркало схем контракта) ──────────────────────────────────────────

export type RuleState =
    | 'draft'
    | 'enabled'
    | 'disabled'
    | 'frozen'
    | 'deleted'

export type SkipReason =
    | 'conditions_not_met'
    | 'module_disabled'
    | 'missing_dependency'
    | 'actor_inactive'
    // C4-automation-be: исходы атомарного idempotency-claim (ровно-один-раз
    // на (event,rule)) — повторная доставка/ретрай события не задваивает действие.
    | 'idempotency_skipped'
    | 'duplicate_event'
    | 'loop_suppressed'
    | string

export interface RuleStats {
    matched30d: number
    executed30d: number
    lastError: string | null
}

/** AutomationRule (FE-форма, camelCase) — §3.1 контракта. */
export interface AutomationRule {
    id: string
    projectId: string
    name: string
    description?: string
    enabled: boolean
    state?: RuleState
    triggerType: string
    triggerConfigJson?: string
    conditionsJson?: string
    actionsJson?: string
    /**
     * Версия движка правила (automation-v2): 1 — flat (форма), 2 — граф.
     * Отсутствует/1 → правило создано формой v1 (upgrade в линейный граф на FE).
     */
    engineVersion?: 1 | 2
    /** Сериализованный GraphSpec (engine_version=2). string JSON или объект. */
    graphJson?: string
    priority?: number
    createdBy?: string
    notifyOnFailure?: string | null
    /** Флаг «неисполнимо» (FR-MAUT-23): ссылка на выключенный модуль. */
    unexecutable?: boolean
    /** Причина disabled (FR-MAUT-8a/23, EL-LIST-9a). */
    skipReason?: SkipReason | null
    disabledReason?: SkipReason | null
    deletedAt?: number
    stats?: RuleStats
    triggerDescription?: string
    actionDescription?: string
    createdAt: number
    updatedAt: number
    lastExecutedAt?: number | null
}

export interface ListRulesResponse {
    list: AutomationRule[]
    total: number
}

export type ExecutionStatus =
    | 'success'
    | 'skipped'
    | 'fail'
    | 'partial_fail'
    | 'throttled'
    | 'suppressed_loop'
    | 'running'
    | 'dlq'

export type ExecutionSource = 'event' | 'manual' | 'dry_run'

export interface ActionResult {
    index: number
    type: string
    status: string
    error?: string
    attempts: number
    assignee?: string
    dlqId?: string
}

export interface RuleExecution {
    executionId: string
    ruleId: string
    projectId?: string
    status: ExecutionStatus
    skipReason?: SkipReason | null
    source: ExecutionSource
    triggerEventName?: string
    entityType?: string
    entityId?: string
    actionResults: ActionResult[]
    traceId?: string
    causationId?: string
    dryRun?: boolean
    createdAt: number
    finishedAt?: number | null
    /** v2: visited node ids on the execution path (FR-AUTOM-530). */
    graphPath?: string[]
}

export interface ListExecutionsResponse {
    list: RuleExecution[]
    total: number
    /** Метка свежести производных данных (S-COMMON-7, ST-28). */
    generatedAt?: number
}

export interface TriggerDef {
    id: string
    requiredModule: string
    entityType: string
    eventName: string
    configSchema?: Record<string, unknown>
    outputSchema?: Record<string, unknown>
}

export interface ActionDef {
    id: string
    requiredModule: string
    externalEffect: boolean
    configSchema?: Record<string, unknown>
}

export interface RegistryResponse {
    triggers: TriggerDef[]
    actions: ActionDef[]
}

export type BreakerState = 'closed' | 'open' | 'half_open'

export interface Connection {
    id: string
    projectId: string
    name: string
    url: string
    headers?: Record<string, string>
    enabled: boolean
    secretSet: boolean
    breakerState: BreakerState
    breakerFailures?: number
    createdBy?: string
    createdAt: number
    updatedAt: number
}

export interface ListConnectionsResponse {
    list: Connection[]
    total: number
}

export type DlqStatus =
    | 'retrying'
    | 'failed'
    | 'resolved'
    | 'dismissed'
    | 'paused_module_disabled'
    | 'paused_project_archived'
    | 'exhausted'

export interface DlqEntry {
    id: string
    ruleId: string
    ruleName?: string
    actionType: string
    entityType?: string
    entityId?: string
    lastError?: string
    lastHttpCode?: number
    attempts: number
    status: DlqStatus
    nextRetryAt?: number | null
    createdAt: number
    updatedAt: number
}

export interface ListDlqResponse {
    list: DlqEntry[]
    total: number
    /** Счётчики по статусам (EL-DLQ-1). */
    counts?: Partial<Record<DlqStatus, number>>
    generatedAt?: number
}

export interface DryRunResultAction {
    type: string
    wouldRun: boolean
    reason?: string
}

export interface DryRunResult {
    eventName: string
    matched: boolean
    conditionsPassed: boolean
    actions: DryRunResultAction[]
    dryRun: true
}

export interface DryRunResponse {
    results: DryRunResult[]
}

// ─── Утилита идемпотентности ─────────────────────────────────────────────────

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export interface ListRulesParams {
    projectId: string
    pageIndex?: number
    pageSize?: number
    query?: string
    triggerType?: string
    state?: RuleState | ''
    createdBy?: string
    enabledOnly?: boolean
    engineVersion?: 0 | 1 | 2
}

export async function apiListRules(params: ListRulesParams) {
    const { projectId, ...rest } = params
    return ApiService.fetchDataWithAxios<ListRulesResponse>({
        url: '/v1/automation/rules',
        method: 'get',
        params: { projectId, ...rest },
    })
}

export async function apiGetRule(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<AutomationRule>({
        url: `/v1/automation/rules/${id}`,
        method: 'get',
        params,
    })
}

export interface RuleActionInput {
    type: string
    connectionId?: string
    priority?: number
    config?: Record<string, unknown>
}

/**
 * GraphSpec (automation-v2 control-flow). Зеркало контракта backend
 * (PLAN.md §1). На FE тот же shape в modules/automation/src/v2/types.ts —
 * здесь дублируется как opaque-форма для тела запроса (host не импортит модуль).
 */
export interface GraphSpecNodeDTO {
    id: string
    type: 'trigger' | 'condition' | 'branch' | 'action'
    position: { x: number; y: number }
    config: Record<string, unknown>
}
export interface GraphSpecEdgeDTO {
    /** backend graph-validator требует id у ребра (INVALID_HANDLE иначе). */
    id: string
    source: string
    sourceHandle: string | null
    target: string
}
export interface GraphSpecDTO {
    version: 2
    nodes: GraphSpecNodeDTO[]
    edges: GraphSpecEdgeDTO[]
}

export interface SaveRuleInput {
    name: string
    description?: string
    enabled?: boolean
    triggerType: string
    triggerConfig?: Record<string, unknown>
    conditions?: Record<string, unknown>
    actions?: RuleActionInput[]
    priority?: number
    notifyOnFailure?: string | null
    /**
     * automation-v2: версия движка (2 — граф). Gateway BFF денормализует
     * triggerType/conditions/actions из триггер-/condition-/action-нод графа.
     */
    engineVersion?: 1 | 2
    /** automation-v2: control-flow граф (engine_version=2). */
    graph?: GraphSpecDTO
}

// ─── automation-v2: node-registry + graph validation ─────────────────────────

export interface NodeTypeDefDTO {
    id: string
    kind: 'trigger' | 'condition' | 'branch' | 'action'
    label?: string
    requiredModule?: string
    externalEffect?: boolean
    configSchema?: Record<string, unknown>
}

export interface NodeRegistryResponse {
    triggers: NodeTypeDefDTO[]
    conditions: NodeTypeDefDTO[]
    branches: NodeTypeDefDTO[]
    actions: NodeTypeDefDTO[]
}

export interface GraphValidationIssueDTO {
    nodeId?: string
    code: string
    message: string
    severity: 'error' | 'warning'
}

export interface ValidateGraphResponse {
    valid: boolean
    issues: GraphValidationIssueDTO[]
}

/**
 * automation-v2: реестр типов нод для канвы (триггеры/условия/ветвления/действия),
 * отфильтрованный по включённым модулям проекта (backend `x-enabled-modules`).
 * Может отсутствовать на стенде v1 — вызывающий код должен иметь graceful-fallback.
 */
export async function apiGetNodeRegistry(params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<NodeRegistryResponse>({
        url: '/v1/automation/node-registry',
        method: 'get',
        params,
    })
}

/** automation-v2: серверная валидация графа (компиляция ABAC, DAG-инварианты). */
export async function apiValidateGraph(
    body: { graph: GraphSpecDTO },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<
        ValidateGraphResponse,
        { graph: GraphSpecDTO }
    >({
        url: '/v1/automation/rules/validate-graph',
        method: 'post',
        data: body,
        params,
    })
}

export async function apiCreateRule(
    body: SaveRuleInput,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<AutomationRule, SaveRuleInput>({
        url: '/v1/automation/rules',
        method: 'post',
        data: body,
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiUpdateRule(
    id: string,
    body: Partial<SaveRuleInput>,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<AutomationRule, Partial<SaveRuleInput>>({
        url: `/v1/automation/rules/${id}`,
        method: 'put',
        data: body,
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiDeleteRule(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<Record<string, never>>({
        url: `/v1/automation/rules/${id}`,
        method: 'delete',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiSetRuleEnabled(
    id: string,
    enabled: boolean,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<AutomationRule, { enabled: boolean }>({
        url: `/v1/automation/rules/${id}/enabled`,
        method: 'put',
        data: { enabled },
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiManualRun(
    id: string,
    body: { entityType?: string; entityId: string },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<
        RuleExecution,
        { entityType?: string; entityId: string }
    >({
        url: `/v1/automation/rules/${id}/run`,
        method: 'post',
        data: body,
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiDryRun(
    id: string,
    body: { sample?: Record<string, unknown>; lastN?: number },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<
        DryRunResponse,
        { sample?: Record<string, unknown>; lastN?: number }
    >({
        url: `/v1/automation/rules/${id}/dry-run`,
        method: 'post',
        data: body,
        params,
    })
}

export async function apiListExecutions(
    ruleId: string,
    params: {
        projectId: string
        pageIndex?: number
        pageSize?: number
        status?: ExecutionStatus | ''
    },
) {
    return ApiService.fetchDataWithAxios<ListExecutionsResponse>({
        url: `/v1/automation/rules/${ruleId}/executions`,
        method: 'get',
        params,
    })
}

export async function apiListProjectExecutions(params: {
    projectId: string
    pageIndex?: number
    pageSize?: number
    status?: string
    actionType?: string
    from?: number
    to?: number
    ruleId?: string
    entityType?: string
    entityId?: string
}) {
    return ApiService.fetchDataWithAxios<ListExecutionsResponse>({
        url: '/v1/automation/executions',
        method: 'get',
        params,
    })
}

export async function apiGetRegistry(params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<RegistryResponse>({
        url: '/v1/automation/registry',
        method: 'get',
        params,
    })
}

// ─── Connections ───────────────────────────────────────────────────────────

export async function apiListConnections(params: {
    projectId: string
    pageIndex?: number
    pageSize?: number
}) {
    return ApiService.fetchDataWithAxios<ListConnectionsResponse>({
        url: '/v1/automation/connections',
        method: 'get',
        params,
    })
}

export async function apiGetConnection(
    id: string,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Connection>({
        url: `/v1/automation/connections/${id}`,
        method: 'get',
        params,
    })
}

export interface SaveConnectionInput {
    name: string
    url: string
    secret?: string
    headers?: Record<string, string>
    enabled?: boolean
    resetBreaker?: boolean
}

export async function apiCreateConnection(
    body: SaveConnectionInput,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Connection, SaveConnectionInput>({
        url: '/v1/automation/connections',
        method: 'post',
        data: body,
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiUpdateConnection(
    id: string,
    body: Partial<SaveConnectionInput>,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Connection, Partial<SaveConnectionInput>>({
        url: `/v1/automation/connections/${id}`,
        method: 'put',
        data: body,
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiDeleteConnection(
    id: string,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<Record<string, never>>({
        url: `/v1/automation/connections/${id}`,
        method: 'delete',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

// ─── DLQ ───────────────────────────────────────────────────────────────────

/** Actionable DLQ rows for nav badge «N в DLQ» (FR-AUTOM-430). */
export function dlqNavBadgeCount(
    counts?: Partial<Record<DlqStatus, number>>,
): number {
    if (!counts) return 0
    return (counts.failed ?? 0) + (counts.retrying ?? 0)
}

export async function apiListDlq(params: {
    projectId: string
    pageIndex?: number
    pageSize?: number
    status?: DlqStatus | ''
}) {
    return ApiService.fetchDataWithAxios<ListDlqResponse>({
        url: '/v1/automation/dlq',
        method: 'get',
        params,
    })
}

export async function apiRetryDlq(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<DlqEntry>({
        url: `/v1/automation/dlq/${id}/retry`,
        method: 'post',
        data: {},
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

export async function apiDismissDlq(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<DlqEntry>({
        url: `/v1/automation/dlq/${id}/dismiss`,
        method: 'post',
        data: {},
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

// ─── UI-словари (метки статусов/состояний) ───────────────────────────────────

export const RULE_STATE_LABEL: Record<RuleState, string> = {
    draft: 'Черновик',
    enabled: 'Включено',
    disabled: 'Выключено',
    frozen: 'Заморожено',
    deleted: 'Удалено',
}

export const RULE_STATE_COLOR: Record<RuleState, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    enabled: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    disabled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    frozen: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    deleted: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

export const SKIP_REASON_LABEL: Record<string, string> = {
    conditions_not_met: 'Условия не выполнены',
    module_disabled: 'Модуль выключен',
    missing_dependency: 'Нет зависимости (модуль выключен)',
    actor_inactive: 'Автор деактивирован',
    // C4-automation-be: пропуски атомарного idempotency-claim (не ошибка —
    // защита от дубль-доставки/ретрая события; действие НЕ задвоено).
    idempotency_skipped: 'Пропущено (идемпотентность)',
    duplicate_event: 'Дубль события (пропущено)',
    loop_suppressed: 'Подавлен цикл',
}

/**
 * Извлекает читаемую сводку ошибки dispatch из action_results execution
 * (C4-automation-be: реальный вызов доменного RPC может упасть — run-log
 * должен показать какое действие и почему). Пустая строка — ошибок нет.
 */
export function dispatchErrorSummary(
    results: Pick<ActionResult, 'type' | 'status' | 'error'>[],
): string {
    const failed = results.filter(
        (r) => r.status === 'fail' || r.status === 'error',
    )
    if (failed.length === 0) return ''
    return failed
        .map((r) => `${r.type}${r.error ? `: ${r.error}` : ''}`)
        .join('; ')
}

export const EXECUTION_STATUS_LABEL: Record<string, string> = {
    success: 'Успешно',
    skipped: 'Пропущено',
    fail: 'Ошибка',
    partial_fail: 'Частичная ошибка',
    throttled: 'Ограничено',
    suppressed_loop: 'Подавлен цикл',
    running: 'Выполняется',
    dlq: 'В очереди ошибок',
}

export const EXECUTION_STATUS_COLOR: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    skipped: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    fail: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    partial_fail: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    throttled: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    suppressed_loop: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    running: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    dlq: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

export const DLQ_STATUS_LABEL: Record<DlqStatus, string> = {
    retrying: 'Повтор',
    failed: 'Ошибка',
    resolved: 'Решено',
    dismissed: 'Отклонено',
    paused_module_disabled: 'Приостановлено (модуль выключен)',
    paused_project_archived: 'Приостановлено (проект архивирован)',
    exhausted: 'Исчерпано',
}

export const DLQ_STATUS_COLOR: Record<DlqStatus, string> = {
    retrying: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    dismissed: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    paused_module_disabled: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    paused_project_archived: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    exhausted: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export const BREAKER_LABEL: Record<BreakerState, string> = {
    closed: 'Норма',
    open: 'Открыт (доставка на паузе)',
    half_open: 'Проверка',
}

export const BREAKER_COLOR: Record<BreakerState, string> = {
    closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    open: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    half_open: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
}

/** Производное UI-состояние правила для Tag (учёт unexecutable/skipReason). */
export function ruleStateView(r: Pick<AutomationRule, 'enabled' | 'state' | 'unexecutable'>): {
    state: RuleState
    label: string
    color: string
} {
    if (r.unexecutable) {
        return {
            state: 'disabled',
            label: 'Неисполнимо',
            color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
        }
    }
    const state: RuleState =
        r.state ?? (r.enabled ? 'enabled' : 'disabled')
    return {
        state,
        label: RULE_STATE_LABEL[state] ?? state,
        color: RULE_STATE_COLOR[state] ?? RULE_STATE_COLOR.disabled,
    }
}
