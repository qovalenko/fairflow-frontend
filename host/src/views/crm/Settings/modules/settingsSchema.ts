/**
 * F3-settings (U4 / E1-04) — settingsSchema → auto-form normalizer.
 *
 * Source of truth: docs/tz/areas/module-contract/TZ.md FR-MOD-29
 *   `settingsSchema` is JSON Schema 2020-12; host renders the form.
 *
 * Reality bridge: the live registry (`backend/shared/src/module-registry.ts`,
 * AS-IS) still ships an ad-hoc shorthand DSL:
 *   - `'string' | 'number' | 'boolean'`        → primitive field of that type
 *   - `['list', 'grid', ...]`                   → enum (single-select)
 *   - `['array']`                               → free-form array (textarea, one per line)
 * The TO-BE format is proper JSON Schema 2020-12 (`{ type, properties, ... }`).
 *
 * This module normalizes BOTH shapes into a flat list of {@link SettingsField}
 * descriptors so the renderer works against the current stand today and the
 * JSON-Schema manifest tomorrow without a UI rewrite.
 */

export type SettingsFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'array'

export type SettingsField = {
    key: string
    type: SettingsFieldType
    title: string
    description?: string
    /** enum options (value === label for shorthand) */
    options?: Array<{ value: string; label: string }>
    /** JSON Schema validation constraints (TO-BE) */
    required?: boolean
    minimum?: number
    maximum?: number
    minLength?: number
    maxLength?: number
    pattern?: string
    default?: unknown
}

type JsonObject = Record<string, unknown>

const isObject = (v: unknown): v is JsonObject =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

/** Detect proper JSON Schema 2020-12 (object schema with `properties` or `type`). */
const isJsonSchema = (schema: JsonObject): boolean =>
    'properties' in schema ||
    (typeof schema.type === 'string' && schema.type === 'object') ||
    '$schema' in schema

/** Humanize a camelCase / snake_case key into a label. */
export const humanizeKey = (key: string): string => {
    const spaced = key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Parse one entry of the ad-hoc shorthand DSL into a field. */
const fieldFromShorthand = (key: string, value: unknown): SettingsField | null => {
    if (value === 'string') {
        return { key, type: 'string', title: humanizeKey(key) }
    }
    if (value === 'number') {
        return { key, type: 'number', title: humanizeKey(key) }
    }
    if (value === 'boolean') {
        return { key, type: 'boolean', title: humanizeKey(key) }
    }
    if (Array.isArray(value)) {
        // ['array'] is the documented "free-form array" marker.
        if (value.length === 1 && value[0] === 'array') {
            return { key, type: 'array', title: humanizeKey(key) }
        }
        const options = value
            .filter((o): o is string => typeof o === 'string')
            .map((o) => ({ value: o, label: humanizeKey(o) }))
        if (options.length > 0) {
            return { key, type: 'enum', title: humanizeKey(key), options }
        }
    }
    return null
}

/** Parse one JSON Schema property into a field. */
const fieldFromJsonSchema = (
    key: string,
    prop: JsonObject,
    requiredKeys: Set<string>,
): SettingsField | null => {
    const base: Partial<SettingsField> = {
        key,
        title: typeof prop.title === 'string' ? prop.title : humanizeKey(key),
        description: typeof prop.description === 'string' ? prop.description : undefined,
        required: requiredKeys.has(key),
        default: prop.default,
        minimum: typeof prop.minimum === 'number' ? prop.minimum : undefined,
        maximum: typeof prop.maximum === 'number' ? prop.maximum : undefined,
        minLength: typeof prop.minLength === 'number' ? prop.minLength : undefined,
        maxLength: typeof prop.maxLength === 'number' ? prop.maxLength : undefined,
        pattern: typeof prop.pattern === 'string' ? prop.pattern : undefined,
    }

    if (Array.isArray(prop.enum)) {
        const options = prop.enum
            .filter((o): o is string | number => typeof o === 'string' || typeof o === 'number')
            .map((o) => ({ value: String(o), label: humanizeKey(String(o)) }))
        return { ...base, type: 'enum', options } as SettingsField
    }

    const t = prop.type
    switch (t) {
        case 'string':
            return { ...base, type: 'string' } as SettingsField
        case 'number':
            return { ...base, type: 'number' } as SettingsField
        case 'integer':
            return { ...base, type: 'integer' } as SettingsField
        case 'boolean':
            return { ...base, type: 'boolean' } as SettingsField
        case 'array':
            return { ...base, type: 'array' } as SettingsField
        default:
            return null
    }
}

/**
 * Normalize a settingsSchema (either shorthand DSL or JSON Schema 2020-12)
 * into a flat, ordered list of form fields.
 */
export const parseSettingsSchema = (schema: unknown): SettingsField[] => {
    if (!isObject(schema)) return []

    if (isJsonSchema(schema)) {
        const props = isObject(schema.properties) ? schema.properties : {}
        const requiredKeys = new Set(
            Array.isArray(schema.required)
                ? schema.required.filter((k): k is string => typeof k === 'string')
                : [],
        )
        const fields: SettingsField[] = []
        for (const [key, prop] of Object.entries(props)) {
            if (!isObject(prop)) continue
            const field = fieldFromJsonSchema(key, prop, requiredKeys)
            if (field) fields.push(field)
        }
        return fields
    }

    // Shorthand DSL
    const fields: SettingsField[] = []
    for (const [key, value] of Object.entries(schema)) {
        const field = fieldFromShorthand(key, value)
        if (field) fields.push(field)
    }
    return fields
}

/** Coerce the array textarea (newline-separated) ⇄ string[] value. */
export const arrayToText = (value: unknown): string =>
    Array.isArray(value) ? value.map((v) => String(v)).join('\n') : ''

export const textToArray = (text: string): string[] =>
    text
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

/**
 * Validate a single field value against its JSON-Schema-derived constraints.
 * Returns an error message (RU) or null when valid.
 */
export const validateField = (field: SettingsField, value: unknown): string | null => {
    const empty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)

    if (field.required && empty) {
        return 'Обязательное поле'
    }
    if (empty) return null

    if (field.type === 'number' || field.type === 'integer') {
        const num = typeof value === 'number' ? value : Number(value)
        if (Number.isNaN(num)) return 'Должно быть числом'
        if (field.type === 'integer' && !Number.isInteger(num)) {
            return 'Должно быть целым числом'
        }
        if (field.minimum !== undefined && num < field.minimum) {
            return `Минимум ${field.minimum}`
        }
        if (field.maximum !== undefined && num > field.maximum) {
            return `Максимум ${field.maximum}`
        }
    }

    if (field.type === 'string' && typeof value === 'string') {
        if (field.minLength !== undefined && value.length < field.minLength) {
            return `Минимум ${field.minLength} символов`
        }
        if (field.maxLength !== undefined && value.length > field.maxLength) {
            return `Максимум ${field.maxLength} символов`
        }
        if (field.pattern) {
            try {
                if (!new RegExp(field.pattern).test(value)) {
                    return 'Не соответствует формату'
                }
            } catch {
                /* invalid pattern in manifest — skip */
            }
        }
    }

    if (field.type === 'enum' && field.options) {
        if (!field.options.some((o) => o.value === String(value))) {
            return 'Недопустимое значение'
        }
    }

    return null
}

/** Validate a whole settings object. Returns map key → error. */
export const validateSettings = (
    fields: SettingsField[],
    values: Record<string, unknown>,
): Record<string, string> => {
    const errors: Record<string, string> = {}
    for (const field of fields) {
        const err = validateField(field, values[field.key])
        if (err) errors[field.key] = err
    }
    return errors
}
