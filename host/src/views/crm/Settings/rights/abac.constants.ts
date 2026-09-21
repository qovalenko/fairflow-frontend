import type {
    AbacOperator,
    AbacPolicyCondition,
    AbacPolicyRule,
} from '@/services/CrmService'

/**
 * FE mirror of the K2-abac closed operator set (exactly 10) + error codes.
 * The host NEVER compiles ABAC — this is for live UX validation only; the
 * backend `validateAbac` / dual-compile remains the source of truth
 * (some predicates are mongo-only, e.g. record-vs-field, dates).
 *
 * Source: backend/shared/src/abac/ir.ts (AbacErrorCode, ABAC_*_OPS).
 */

export const ABAC_COMPARE_OPS: readonly AbacOperator[] = [
    'eq',
    'ne',
    'gt',
    'gte',
    'lt',
    'lte',
]
export const ABAC_SET_OPS: readonly AbacOperator[] = ['in', 'nin']
/** Logic ops (and/or/not) — composed implicitly: a rule = AND of its conditions. */
export const ABAC_LOGIC_OPS: readonly AbacOperator[] = ['and', 'or', 'not']

/** Operators selectable per single condition (logic is implicit AND). */
export const ABAC_LEAF_OPS: readonly AbacOperator[] = [
    ...ABAC_COMPARE_OPS,
    ...ABAC_SET_OPS,
]

export const ABAC_OP_LABELS: Record<AbacOperator, string> = {
    eq: '= равно',
    ne: '≠ не равно',
    gt: '> больше',
    gte: '≥ больше или равно',
    lt: '< меньше',
    lte: '≤ меньше или равно',
    in: '∈ входит в список',
    nin: '∉ не входит в список',
    and: 'И',
    or: 'ИЛИ',
    not: 'НЕ',
}

/** Operators that take a list value (comma-separated input). */
export function isSetOperator(op: AbacOperator): boolean {
    return op === 'in' || op === 'nin'
}

/**
 * Machine-readable validation/compile error codes (RFC-ABAC §9.2,
 * backend AbacErrorCode) → human RU messages for inline display (ST-7).
 */
export const ABAC_ERROR_LABELS: Record<string, string> = {
    OPERATOR_NOT_SUPPORTED: 'Оператор не поддерживается (доступно 10 операторов).',
    OPERAND_NOT_ALLOWED:
        'Атрибут недопустим. Разрешены поля record.*, user.*, project.*.',
    OPERAND_NESTED_PATH_UNSUPPORTED:
        'Вложенные пути не поддерживаются — используйте плоское поле записи.',
    FIELD_VS_FIELD_UNSUPPORTED:
        'Сравнение «поле с полем» не компилируется — справа должно быть значение.',
    TYPE_MISMATCH: 'Тип значения не совпадает с типом атрибута.',
    DATE_OPERAND_UNSUPPORTED: 'Операнд-дата в этом операторе не поддерживается.',
    NOT_OVER_UNSUPPORTED_LEAF: 'НЕ применимо только к eq/in.',
    NULL_IN_LITERAL_ARRAY: 'null недопустим внутри списка.',
    NULL_LITERAL_COMPARE: 'Сравнение с null недопустимо для этого оператора.',
    ABAC_BACKEND_UNSUPPORTED:
        'Это условие не компилируется для текущего хранилища (mongo-only / PG-субъект).',
    NOT_COMPILABLE_MONGO: 'Условие не компилируется в фильтр (Mongo).',
    UNKNOWN_CONTEXT_REF: 'Неизвестная ссылка user.* / project.*.',
    MALFORMED_NODE: 'Некорректное правило.',
    POLICY_NOT_COMPILABLE: 'Политика не компилируется — проверьте условия.',
    OWNER_LOCKOUT:
        'Запрещено: правило отрезало бы владельцу проекта доступ (anti-lockout).',
}

export function abacErrorLabel(code?: string): string {
    if (!code) return 'Ошибка валидации политики.'
    return ABAC_ERROR_LABELS[code] ?? code
}

/** Empty editable rule template. */
export function emptyAbacRule(): AbacPolicyRule {
    return {
        subject: '',
        action: 'read',
        effect: 'allow',
        conditions: [emptyCondition()],
    }
}

export function emptyCondition(): AbacPolicyCondition {
    return { attribute: '', operator: 'eq', value: '' }
}

/**
 * Lightweight client-side pre-check before sending to the PDP/validate.
 * Returns a per-condition error code (UX hint) or null. NOT authoritative —
 * the backend dual-compile is the source of truth (non-compilable rejected there).
 */
export function precheckCondition(c: AbacPolicyCondition): string | null {
    if (!c.attribute.trim()) return 'OPERAND_NOT_ALLOWED'
    const ns = c.attribute.split('.')[0]
    if (!['record', 'user', 'project'].includes(ns)) return 'OPERAND_NOT_ALLOWED'
    // nested record path (record.a.b) is unsupported (flat field only)
    if (ns === 'record' && c.attribute.split('.').length > 2) {
        return 'OPERAND_NESTED_PATH_UNSUPPORTED'
    }
    if (!ABAC_LEAF_OPS.includes(c.operator)) return 'OPERATOR_NOT_SUPPORTED'
    if (isSetOperator(c.operator)) {
        const list = parseListValue(c.value)
        if (list.length === 0) return 'TYPE_MISMATCH'
        if (list.some((v) => v === null)) return 'NULL_IN_LITERAL_ARRAY'
    } else {
        if (c.value === '' || c.value === null) return 'NULL_LITERAL_COMPARE'
    }
    return null
}

/** Parse a comma-separated set-operator value into a typed scalar list. */
export function parseListValue(value: unknown): Array<string | number | boolean> {
    if (Array.isArray(value)) return value as Array<string | number | boolean>
    if (typeof value !== 'string') return []
    return value
        .split(',')
        .map((s) => coerceScalar(s.trim()))
        .filter((s) => s !== '')
}

/** Coerce a raw input string to number / boolean / string. */
export function coerceScalar(raw: string): string | number | boolean {
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw)
    return raw
}

/** Human one-line summary of a rule for the list view. */
export function summarizeRule(rule: AbacPolicyRule): string {
    const cond = rule.conditions
        .map(
            (c) =>
                `${c.attribute} ${ABAC_OP_LABELS[c.operator] ?? c.operator} ${formatValue(c.value)}`,
        )
        .join(' И ')
    const head = `${rule.effect === 'deny' ? 'ЗАПРЕТ' : 'РАЗРЕШИТЬ'} ${rule.subject || '—'}:${rule.action || '—'}`
    return cond ? `${head} если ${cond}` : head
}

function formatValue(value: unknown): string {
    if (Array.isArray(value)) return `[${value.join(', ')}]`
    if (value === null) return 'null'
    return String(value)
}
