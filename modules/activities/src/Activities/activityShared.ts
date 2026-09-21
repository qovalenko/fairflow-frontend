import type { Activity, ActivityType, ActivityStatus, ActivityPriority } from '@/@types/crm'

/**
 * Общие хелперы модуля «Активности» — нормализация raw-ответа gRPC-BFF
 * (Long-обёртки `{low,high,unsigned}`, snake/camel, разные формы списков),
 * чтобы новые экраны (card-tab / dashboard-widget) и список давали одинаковые
 * данные. Источник правды по полям — activity-контракт §6.2.
 */

export const toSafeString = (value: unknown): string => {
    if (
        value &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        'unsigned' in value
    ) {
        const raw = value as { low?: unknown; high?: unknown }
        const low = typeof raw.low === 'number' ? raw.low : Number(raw.low)
        const high = typeof raw.high === 'number' ? raw.high : Number(raw.high)
        if (Number.isFinite(low) && Number.isFinite(high)) {
            const lo = low >>> 0
            const n = high * 0x1_0000_0000 + lo
            if (Number.isFinite(n)) return String(n)
        }
    }
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    return ''
}

export const toSafeNumber = (value: unknown): number | undefined => {
    if (
        value &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        'unsigned' in value
    ) {
        const raw = value as { low?: unknown; high?: unknown }
        const low = typeof raw.low === 'number' ? raw.low : Number(raw.low)
        const high = typeof raw.high === 'number' ? raw.high : Number(raw.high)
        if (Number.isFinite(low) && Number.isFinite(high)) {
            const lo = low >>> 0
            const n = high * 0x1_0000_0000 + lo
            if (Number.isFinite(n)) return n
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

export const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

export const normalizeActivity = (value: unknown): Activity | null => {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>

    const typeRaw = toSafeString(raw.type)
    const type: ActivityType =
        typeRaw === 'task' || typeRaw === 'call' || typeRaw === 'meeting' || typeRaw === 'note'
            ? typeRaw
            : 'task'

    const statusRaw = toSafeString(raw.status)
    const status: ActivityStatus =
        statusRaw === 'planned' ||
        statusRaw === 'in_progress' ||
        statusRaw === 'completed' ||
        statusRaw === 'cancelled'
            ? statusRaw
            : 'planned'

    const priorityRaw = toSafeString(raw.priority)
    const priority: ActivityPriority =
        priorityRaw === 'low' ||
        priorityRaw === 'medium' ||
        priorityRaw === 'high' ||
        priorityRaw === 'urgent'
            ? priorityRaw
            : 'medium'

    const assigneeName =
        toSafeString(raw.assigneeName) ||
        (raw.assignee && typeof raw.assignee === 'object'
            ? toSafeString((raw.assignee as Record<string, unknown>).name)
            : '')

    return {
        ...(raw as Activity),
        id: toSafeString(raw.id || raw._id),
        title: toSafeString(raw.title) || 'Без названия',
        type,
        status,
        priority,
        assigneeId: toSafeString(raw.assigneeId) || undefined,
        assigneeName: assigneeName || undefined,
        dealName: toSafeString(raw.dealName) || undefined,
        contactName: toSafeString(raw.contactName) || undefined,
        companyName: toSafeString(raw.companyName) || undefined,
        orderName: toSafeString(raw.orderName) || undefined,
        dueDate: toSafeNumber(raw.dueDate),
        startDate: toSafeNumber(raw.startDate),
        endDate: toSafeNumber(raw.endDate),
        createdAt: toSafeNumber(raw.createdAt) ?? 0,
        updatedAt: toSafeNumber(raw.updatedAt) ?? 0,
    }
}

/** Активность просрочена: открыта и срок в прошлом (исключая терминальные). */
export const isOverdue = (a: Activity, now = Date.now()): boolean => {
    if (a.overdue) return true
    if (!a.dueDate) return false
    if (a.status === 'completed' || a.status === 'cancelled') return false
    // dueDate приходит и в секундах (список), и в мс (контракт) — нормализуем.
    const ms = a.dueDate > 1e12 ? a.dueDate : a.dueDate * 1000
    return ms < now
}

export const isTerminal = (a: Activity): boolean =>
    a.status === 'completed' || a.status === 'cancelled'

export const typeLabel: Record<ActivityType, string> = {
    task: 'Задача',
    call: 'Звонок',
    meeting: 'Встреча',
    note: 'Заметка',
}

export const statusLabel: Record<ActivityStatus, string> = {
    planned: 'Запланировано',
    in_progress: 'В работе',
    completed: 'Завершено',
    cancelled: 'Отменено',
}

/**
 * Timestamp активности → миллисекунды. В репо один и тот же тайминг приходит
 * то в unix-секундах (список), то в миллисекундах (контракт) — см. `isOverdue`.
 * Нормализуем по порогу 1e12 (~2001 г. в мс), чтобы даты в UI не «улетали».
 */
export const toEpochMs = (value?: number | null): number | undefined => {
    if (value == null || !Number.isFinite(value) || value <= 0) return undefined
    return value > 1e12 ? value : value * 1000
}

export type ApiErr = {
    response?: { data?: { error?: { message?: string; code?: string } } }
    message?: string
}

export const errMessage = (e: unknown): string => {
    const err = e as ApiErr
    return (
        err?.response?.data?.error?.message ||
        err?.message ||
        'Не удалось выполнить операцию'
    )
}

/**
 * Отображаемое имя ответственного: ФИО → email → UUID.
 *
 * ВНИМАНИЕ (для мержа): в dev-ветке появился общий хелпер `personDisplayName`
 * (T-010). База этой задачи — main, где такого хелпера ещё нет, поэтому здесь
 * локальный fallback. При мерже с dev заменить на общий и убрать этот.
 */
export const personDisplayName = (
    name?: string | null,
    email?: string | null,
    id?: string | null,
): string => {
    const n = (name ?? '').trim()
    if (n) return n
    const e = (email ?? '').trim()
    if (e) return e
    const i = (id ?? '').trim()
    return i || '—'
}

/** entity-ref → URL карточки сущности-связи (FR-MACT-5/32). */
export const linkEntityPath = (
    entityType: string,
    entityId: string,
): string | null => {
    switch (entityType) {
        case 'deal':
            return `/deals/${entityId}`
        case 'contact':
            return `/contacts/${entityId}`
        case 'company':
            return `/companies/${entityId}`
        case 'order':
            return `/orders/${entityId}`
        default:
            return null
    }
}
