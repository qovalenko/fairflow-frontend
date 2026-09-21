export type Contact = {
    id: string
    firstName: string
    lastName: string
    middleName?: string
    phone: string
    email: string
    position?: string
    /** Основной контакт компании */
    isPrimary?: boolean
    /** @deprecated Prefer companyIds for M:M */
    companyId?: string
    companyName?: string
    companyIds?: string[]
    orphanedCompanyIds?: string[]
    companies?: { id: string; name: string; role?: string }[]
    companyLinks?: {
        companyId: string
        role?: string
        isPrimary?: boolean
        position?: string
        period?: { from?: number; to?: number }
    }[]
    departmentId?: string
    lastActivityAt?: number | null
    source?: string
    assigneeId?: string
    assigneeName?: string
    tags?: string[]
    notes?: string
    createdAt: number
    updatedAt: number
    /** Soft-delete (trash) fields — contract §3.5/§3.6 */
    deletedAt?: number | null
    deletedBy?: string
    deletedByName?: string
    purgeAt?: number | null
    mergedInto?: string | null
    /**
     * TODO-161: доноры, слитые В ЭТОТ контакт, по которым откат ещё возможен.
     * Приходит только с карточки (GET /v1/contacts/:id) — в списках пусто.
     */
    mergedSources?: MergedSource[]
}

/** TODO-161 (FR-CONTACTS-260): слитый донор + срок, до которого доступен откат. */
export type MergedSource = {
    id: string
    firstName: string
    lastName: string
    middleName?: string
    email?: string
    phone?: string
    /** unix seconds */
    mergedAt?: number
    /** unix seconds, mergedAt + 30 дней */
    unmergeUntil?: number
}

export type RelatedCompanyRelation = 'head' | 'current' | 'branch' | 'subsidiary'

export type RelatedCompany = {
    id: string
    name: string
    inn?: string
    relationType: RelatedCompanyRelation
    children?: RelatedCompany[]
}

export type Company = {
    id: string
    name: string
    inn?: string
    kpp?: string
    ogrn?: string
    legalAddress?: string
    /**
     * НЕ ПОДДЕРЖИВАЕТСЯ БЭКЕНДОМ: ни в `Company` (proto company v1), ни в маппинге
     * gateway `mapCompany` — всегда undefined. Оставлено только для read-only
     * рендера (виджеты выводят поле по `&&`, то есть ничего не выводят). Ввод
     * этого значения из формы редактирования убран: он молча терялся.
     */
    actualAddress?: string
    /** Банковские реквизиты (FR-COMPANIES-380): proto/домен/gateway их хранят и маскируют. */
    bankName?: string
    bik?: string
    correspondentAccount?: string
    settlementAccount?: string
    phone?: string
    email?: string
    website?: string
    industry?: string
    // employeeCount убран: поля нет ни в proto company v1, ни в домене, ни в gateway —
    // форма его теряла молча. Возвращать вместе с `employee_count` на бэкенде.
    /** Профиль контрагента (FR-MCOM-28). */
    status?: 'lead' | 'client' | 'partner' | 'former' | string
    contactIds?: string[]
    /**
     * W-6 — подразделение-владелец записи (ABAC-атрибут видимости наравне с
     * `assigneeId`). Читается из BFF `mapCompany`, пишется обычным
     * create/update (`department_id`) — в отличие от контакта, домен company его
     * из update не вычёркивает.
     */
    departmentId?: string
    assigneeId?: string
    assigneeName?: string
    tags?: string[]
    notes?: string
    /** Связанные компании (иерархия) */
    relatedCompanies?: RelatedCompany[]
    /** Аудит (FR-MCOM-32). */
    createdBy?: string
    updatedBy?: string
    /** Soft-delete: запись в корзине, если не null (FR-MCOM-1/7). */
    deletedAt?: number | null
    createdAt: number
    updatedAt: number
}

export type PipelineStage = {
    id: string
    name: string
    color: string
    order: number
    kind?: 'active' | 'won' | 'lost'
    rottingDays?: number
}

export type PipelineAutoTransition = {
    fromStageId: string
    toStageId: string
}

export type Pipeline = {
    id: string
    name: string
    stages: PipelineStage[]
    isDefault: boolean
    autoTransitions?: PipelineAutoTransition[]
}

/** Light contact fields on deal for quick reference (denormalized). */
export type DealLightContact = {
    contactPhone?: string
    contactEmail?: string
    contactCompanyName?: string
}

export type StageLogEntry = {
    stage: string
    enteredAt: number
    exitedAt?: number
}

/** Event for history timeline (audit-style). */
export type AuditEvent = {
    id: string
    time: string
    user: string
    action: string
    details?: string
    diff?: { field: string; old: string; new: string }[]
}

export type Deal = {
    id: string
    name: string
    amount: number
    currency: string
    pipelineId: string
    stageId: string
    stageName: string
    contactId?: string
    contactName?: string
    companyId?: string
    companyName?: string
    /** Denormalized quick-reference contact fields. */
    contactPhone?: string
    contactEmail?: string
    contactCompanyName?: string
    /** Light lead fields captured before qualification (FR-MDEAL-1, no contact record yet). */
    lightName?: string
    lightPhone?: string
    lightEmail?: string
    lightCompanyName?: string
    productId?: string
    productName?: string
    source?: string
    assigneeId?: string
    assigneeName?: string
    expectedCloseDate?: number
    closedAt?: number
    result?: 'won' | 'lost' | 'active'
    /** Lifecycle status (pipe contract FR-MDEAL-10). Falls back to `result`. */
    status?: 'open' | 'won' | 'lost'
    wonAt?: number
    lostAt?: number
    lostReason?: string
    lostReasonId?: string
    lostReasonComment?: string
    notes?: string
    tags?: string[]
    /** Snapshot↔source divergence indicator (FR-MDEAL-26). */
    driftFlag?: boolean
    deletedAt?: number
    stageEnteredAt?: number
    stageLog?: StageLogEntry[]
    /** FR-DEALS-180 — computed on read, never stored. */
    daysOnStage?: number
    isStalled?: boolean
    stageReturnCount?: number
    totalTimeOnStageDays?: number
    createdAt: number
    updatedAt: number
}

/** Pipe lost-reason dictionary item (contract §23). */
export type LostReason = {
    id: string
    name: string
    order?: number
    active?: boolean
}

/** Result of a bulk deal update (contract §14). */
export type BulkUpdateResult = {
    updated: string[]
    skipped: { id: string; reason: string }[]
    async?: boolean
    jobId?: string
}

/** FR-DEALS-290: mass accept drift for selected deals. */
export type BulkAcceptDriftResult = {
    accepted: string[]
    skipped: { id: string; reason: string }[]
}

/** One field-level divergence between snapshot and live source (pipe contract §4). */
export type DealDriftField = {
    field: string
    snapshotValue?: string | null
    currentValue?: string | null
    changedBy?: string
    changedAt?: number
}

/** Drift response for a deal (`GET /api/deals/:id/drift`, pipe contract §4). */
export type DealDrift = {
    dealId: string
    /** When the linked source (contact/company) has been deleted (EC-14). */
    sourceDeleted?: boolean
    drift: DealDriftField[]
}

/** Deals dashboard aggregate (`GET /api/deals/dashboard`, pipe contract §5). */
export type DealDashboard = {
    statistics: DashboardStatistic[]
    dealsByStage: { stageId?: string; stageName: string; count: number; amount: number }[]
    dealsTimeline?: { date: string; won?: number; lost?: number; new?: number }[]
    topManagers?: { assigneeId?: string; name: string; deals: number; amount: number; conversion?: number }[]
    recentDeals?: Deal[]
    /** TO-BE aggregate extras (pipe contract §5 TO-BE). */
    conversionByPipeline?: { pipelineId: string; pipelineName: string; conversion: number }[]
    avgCycleDays?: number
    stalledCount?: number
    forecastAmount?: number
    byDepartment?: { departmentId: string; count: number; amount: number }[]
}

export type OrderTypeField = {
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'select' | 'file' | 'checkbox'
    required: boolean
    options?: string[]
}

export type OrderTypeStage = {
    id: string
    name: string
    order: number
    /**
     * Ключи полей типа, обязательные для ВЫХОДА с этого этапа (§3.2 StageSpec
     * `required_field_keys`). Домен валидирует их при MoveOrder — конструктор
     * типа обязан их сохранять, иначе required-gate этапа стирается.
     */
    requiredFieldKeys?: string[]
    isTerminal?: boolean
}

export type OrderType = {
    id: string
    name: string
    fields: OrderTypeField[]
    stages: OrderTypeStage[]
    schemaVersion: number
    webhookEnabled: boolean
    activeOrders: number
}

/** Ревизия типа продажи (§3.2 GetOrderType → `revision`). */
export type OrderTypeRevision = {
    version?: number
    status?: string
    fields?: OrderTypeField[]
    stages?: OrderTypeStage[]
    terminalStageId?: string
    finalActionSpec?: { type?: string; config?: Record<string, unknown> } | null
    retryPolicy?: {
        maxAttempts?: number
        strategy?: string
        baseIntervalSec?: number
        maxWaitSec?: number
    } | null
    documentTemplates?: { id?: string }[]
    createdAt?: number
    createdBy?: string
}

/**
 * Ответ GET /order-types/:id (опционально `?version=N`).
 *
 * Продажа закреплена за ревизией (`order.orderTypeVersion`), и сервер валидирует
 * её именно по ней — экраны продажи обязаны рендериться по этой ревизии, а не по
 * текущему типу из списка `GET /order-types`.
 */
export type OrderTypeDetail = {
    id: string
    name: string
    description?: string
    currentVersion?: number
    deletedAt?: number | null
    revision?: OrderTypeRevision
}

export type Order = {
    id: string
    number: string
    typeId: string
    typeName: string
    productId?: string
    productName?: string
    /** FR-PRODUCTS-180: catalog snapshot at link time */
    productPrice?: number
    productCurrency?: string
    productUnit?: string
    productCategory?: string
    dealId?: string
    dealName?: string
    contactId?: string
    contactName?: string
    companyId?: string
    companyName?: string
    stageId: string
    stageName: string
    assigneeId?: string
    assigneeName?: string
    fields: Record<string, unknown>
    /**
     * Статус продажи. Legacy AS-IS (`active|completed|error`) + TO-BE 5 статусов
     * машины состояний FR-MORD §5.4 (ACTIVE/SENDING/DONE/SEND_ERROR/CANCELLED).
     */
    status:
        | 'active'
        | 'completed'
        | 'error'
        | 'ACTIVE'
        | 'SENDING'
        | 'DONE'
        | 'SEND_ERROR'
        | 'CANCELLED'
    dlqError?: string
    /**
     * Реквизиты донора (контакт/компания) разошлись со снимком продажи.
     * BFF отдаёт именно `hasDrift` (crm-bff.controller `orderFe`) — раньше UI
     * читал несуществующее `driftWarning`, из-за чего баннер/иконки дрейфа не
     * показывались никогда. Пер-филд diff отдаётся отдельной ручкой
     * GET /orders/:id/drift (apiCheckOrderDrift).
     */
    hasDrift?: boolean
    /** Ревизия типа продажи, закреплённая при создании (сервер валидирует по ней). */
    orderTypeVersion?: number
    /** Снимок реквизитов донора на момент создания/принятия дрейфа. */
    snapshot?: Record<string, unknown> | null
    /** Состояние финального действия: лог попыток + последняя ошибка (FR-ORDERS-320). */
    finalActionState?: OrderFinalActionState | null
    /** Свободные заметки по продаже — отдельно от валидируемых customFields (FR-ORDERS-200). */
    notes?: string
    stageChangedAt?: number
    createdAt: number
    updatedAt: number
}

/** Одна попытка выполнения финального действия (BFF `finalActionStateFe.attempts[]`). */
export type OrderFinalActionAttempt = {
    at?: number
    attemptNo?: number
    responseCode?: number
    errorBody?: string
    durationMs?: number
}

/** `finalActionState` продажи (BFF `finalActionStateFe`). */
export type OrderFinalActionState = {
    status?: string
    idempotencyKey?: string
    payloadGen?: number
    lastError?: string
    succeededAt?: number
    attempts?: OrderFinalActionAttempt[]
}

/** Один разошедшийся реквизит (GET /orders/:id/drift → `diffs[]`). */
export type OrderDriftDiff = {
    entity?: string
    field?: string
    old?: string
    new?: string
}

/** Ответ GET /orders/:id/drift (§3.14 CheckDrift). */
export type OrderDriftStatus = {
    hasDrift: boolean
    /** `present` | `deleted` — донор мог быть удалён. */
    sourceState?: string
    diffs?: OrderDriftDiff[]
}

/**
 * Элемент ленты изменений продажи (`GET /v1/orders/:id/history`, TODO-414).
 * BFF отдаёт уже готовые к показу подписи: этапы/статусы/ответственные приходят
 * именами, а не сырыми id (`gateway/src/bff/order-history.ts`).
 */
export type OrderHistoryItem = {
    id: string
    /** Имя события цепочки audit, напр. `crm.order.stage_changed`. */
    type: string
    userId?: string
    userName?: string
    /** Секунды (единая шкала дат BFF); `formatOrderDate` понимает и мс. */
    timestamp: number
    summary: string
    changedFields?: { field: string; old?: string; new?: string }[]
}

export type ActivityType = 'task' | 'call' | 'meeting' | 'note'
export type ActivityStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type ActivityPriority = 'low' | 'medium' | 'high' | 'urgent'

export type Activity = {
    id: string
    type: ActivityType
    title: string
    description?: string
    status: ActivityStatus
    priority: ActivityPriority
    dueDate?: number
    startDate?: number
    endDate?: number
    assigneeId?: string
    assigneeName?: string
    /**
     * W-6 — подразделение-владелец активности (второй ключ видимости рядом с
     * `assigneeId`). BFF `activityFe` отдаёт null, когда отдел не задан.
     */
    departmentId?: string | null
    dealId?: string
    dealName?: string
    contactId?: string
    contactName?: string
    companyId?: string
    companyName?: string
    orderId?: string
    orderName?: string
    location?: string
    /** Канон домена — inbound|outbound (DIRECTIONS); incoming/outgoing — легаси-записи старого FE-enum. */
    direction?: 'inbound' | 'outbound' | 'incoming' | 'outgoing'
    result?: string
    duration?: number
    participants?: string[]
    overdue?: boolean
    /** Polymorphic links to CRM entities (activity contract §6.2 `links[]`). */
    links?: ActivityLink[]
    actualDuration?: number
    completedAt?: number
    reminderOffset?: 'none' | 'at_time' | '15m' | '1h' | '1d'
    reminderState?: 'none' | 'scheduled' | 'sent' | 'cancelled'
    /** Soft-delete marker (activity contract §3, корзина FR-MACT-13). */
    deletedAt?: number | null
    /** Правило автоматизации, создавшее активность (FR-AUTOM-120). */
    createdByRule?: { ruleId: string; name: string }
    createdAt: number
    updatedAt: number
}

/** Polymorphic activity link (activity contract §6.2 `ActivityLink`). */
export type ActivityLink = {
    entityType: 'deal' | 'order' | 'contact' | 'company'
    entityId: string
    nameSnapshot?: string
    orphaned?: boolean
}

export type ProductUnit = 'ONE_TIME' | 'MONTHLY' | 'YEARLY' | 'one-time' | 'monthly' | 'yearly'

export type ProductStatus = 'active' | 'archived'

export type Product = {
    id: string
    name: string
    description?: string
    category?: string
    price: number
    effectivePrice?: number
    currency?: string
    unit: ProductUnit
    orderTypeId?: string
    orderTypeName?: string
    orderTypeDangling?: boolean
    status?: ProductStatus
    archivedAt?: number | null
    /**
     * W-6 — отдел-владелец каталожной позиции (null = продукт уровня проекта).
     * Задаётся ТОЛЬКО при создании: домен product не даёт переписать его через
     * update (`product.service.ts` S6), поэтому в форме редактирования поле
     * read-only.
     */
    ownerDepartmentId?: string | null
    prefill?: Record<string, string | number | boolean>
    dealsCount: number
    activeDealsCount?: number
    ordersCount: number
    createdAt: number
    updatedAt: number
}

/** Write payload for product create/update (product contract §3.3 / §3.4). */
export type ProductWritePayload = {
    name: string
    price: number
    unit: 'ONE_TIME' | 'MONTHLY' | 'YEARLY'
    description?: string
    category?: string
    currency?: string
    orderTypeId?: string | null
    orderTypeName?: string
    /** W-6: только на создании — update домен игнорирует (см. Product). */
    ownerDepartmentId?: string
    prefill?: Record<string, string | number | boolean>
}

/** Affected-references breakdown returned by archive / usage (product contract §3.5, FR-PRODUCTS-230). */
export type ProductArchiveAffected = {
    deals: number
    orders: number
    activeDeals?: number
    byDepartment?: { departmentId: string; deals: number; orders: number }[]
    byUser?: { userId: string; deals: number; orders: number }[]
}

export type DashboardStatistic = {
    key: string
    label: string
    value: number
    /**
     * Значение той же метрики за предыдущее окно той же длины (домен
     * `reports.service.ts#kpiCell` → proto `previous_value` → BFF
     * `previousValue`). ОПЦИОНАЛЬНО намеренно: старая сборка домена поля не
     * шлёт, и подменять его нулём нельзя — ноль здесь имеет собственный
     * смысл «предыдущего окна не было».
     */
    previousValue?: number
    /**
     * Прирост ДОЛЕЙ, не процентами: `(value − previousValue) / previousValue`.
     * Домен отдаёт `0`, когда `previousValue == 0` (сравнивать не с чем) —
     * поэтому одного `growthRate` для показа индикатора НЕ достаточно, см.
     * `KpiCell` в `modules/statistics/src/DashboardWidgets.tsx`.
     */
    growthRate?: number
}

/**
 * `DashboardMetrics` / `StatisticsMetrics` (C1-stats-be, statistics-TZ §5.5).
 *
 * Read-only витрина агрегатов в зоне видимости зрителя. Мета-поля
 * `asOf`/`partial`/`scopeLevel` несёт сам ответ (FR-MSTAT-14/15/26) — отдельной
 * обёртки нет, поэтому они опциональны на самом DTO. `stalledDeals`/`orderTypes`
 * добавлены под виджеты «зависшие» (FR-MSTAT-30) и «типы продаж» (EL-ANL-10).
 */
export type DashboardData = {
    statistics: DashboardStatistic[]
    /**
     * `stageId` — сырой ключ стадии из ответа BFF (`funnel[].key`): по нему
     * строится drill в список сделок (`?stageId=`), тогда как `stage` — только
     * подпись. Без него клик по воронке уходил по display-имени (FR-MSTAT-24).
     */
    dealsByStage: { stage: string; count: number; amount: number; stageId?: string }[]
    dealsTimeline: { date: string; won: number; lost: number; new: number }[]
    /** `sourceKey` — сырой `sources[].key` BFF для drill (`?source=`). */
    dealsBySource?: { source: string; count: number; sourceKey?: string }[]
    /** `ownerId` — id менеджера (`team[].ownerId`) для drill (`?assigneeId=`). */
    topManagers: {
        name: string
        deals: number
        amount: number
        conversion: number
        ownerId?: string
        departmentId?: string
    }[]
    /**
     * FR-STAT-360: чем сгруппирован `team` / `topManagers` —
     * `'user'` (по умолчанию) или `'department'` (свёртка за порогом N_OWNER).
     */
    teamGrouping?: 'user' | 'department'
    /** Срез по отделам (`by_department` BFF `/api/v1/statistics`, FR-MSTAT-28). */
    byDepartment?: {
        departmentId: string
        name: string
        deals: number
        amount: number
        avgCheck: number
        managersCount: number
    }[]
    recentDeals: Deal[]
    overdueActivities: Activity[]
    upcomingActivities: Activity[]
    /** Сделки без движения > N дней (FR-MSTAT-30). */
    stalledDeals?: Deal[]
    /**
     * Полные размеры списков ДО усечения серверным лимитом (`*Total` BFF
     * `/api/v1/dashboard`, TODO-498). Сами массивы выше приходят усечёнными
     * (≤5 строк), поэтому «+ ещё N» считается как `total − показано`: по длине
     * усечённого массива остаток тождественно равен нулю. Отсутствует → виджет
     * падает на длину массива (AS-IS, без выдуманных чисел).
     */
    overdueTotal?: number
    upcomingTotal?: number
    stalledTotal?: number
    /**
     * Продажи по типам (Order Type, EL-ANL-10 / FR-STAT-280/290) — срез
     * `order_types` BFF `/api/v1/statistics`. Имя поля и его состав повторяют
     * ответ gateway (`statistics-bff.controller.ts` → `orderTypes`): id типа
     * сохранён отдельно от подписи, по нему идёт drill в список продаж
     * (`/orders?typeId=`) — по имени список не сматчить. Суммы у среза нет:
     * у заказа нет собственного amount (он в динамических полях типа).
     * Прежнее имя `dealsByType` ({type,count,amount}) убрано — продюсера в
     * gateway у него не было, виджет по нему всегда рисовал «данных нет».
     */
    orderTypes?: { orderTypeId: string; orderTypeName: string; count: number }[]
    /** Динамика сделок за период (срез `sales` BFF `/api/v1/statistics`, TODO-052). */
    sales?: { bucket: string; count: number; amount: number }[]
    /** Среднее время на стадии (срез `stage_timing`, FR-REPORTS-250). */
    stageDurations?: {
        stageId: string
        label: string
        transitionCount: number
        avgDurationMs: number
    }[]
    /** Мета: «данные на ЧЧ:ММ» (min по провайдерам, FR-MSTAT-14). */
    asOf?: number | string
    /** Мета: ≥1 провайдер не уложился в тайм-бюджет (FR-MSTAT-15). */
    partial?: boolean
    /** Мета: уровень видимости зрителя для подписи «смотрю: …» (FR-MSTAT-26). */
    scopeLevel?:
        | 'only_own'
        | 'own_and_shared'
        | 'own_and_subordinates'
        | 'own_and_department'
        | 'all'
}

export type ProjectMember = {
    id: string
    name: string
    email: string
    role: 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
    avatar?: string
}

export type Project = {
    id: string
    name: string
    description?: string
    members: ProjectMember[]
    modules: string[]
    createdAt: number
}

export type DealSource = {
    id: string
    name: string
    color: string
}
