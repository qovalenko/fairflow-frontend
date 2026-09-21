/**
 * CRM-сущности в сообщениях чата (P2.c) — FE-only через текстовую разметку.
 *
 * Backend-контракт чата (`Message`) содержит поле `entityRefs` (FR-CHAT-440) и
 * inline-токен в `text` для совместимости. Ссылка кодируется inline-токеном ВНУТРИ `text` (аналогия с @mentions, но без
 * выделенного поля). Токен переживает редактирование (это часть text) и деградирует
 * на клиентах без поддержки до читаемого текста — метка (label) обязательна и видна.
 *
 * Формат токена: `[[entity:<type>:<id>|<label>]]`
 *   type  ∈ deal | contact | company | order
 *   id    — идентификатор записи (без `|` и `]`)
 *   label — человекочитаемое имя (без `]`, санитайзится при сериализации)
 *
 * Namespace-префикс `entity:` отделяет токен от прочих `[[...]]`-конвенций.
 * Все функции здесь — чистые (без сети/DOM), тестируемы изолированно.
 */
import type { EntityRef, EntityRefType } from './chatTypes'

export const ENTITY_TYPES: readonly EntityRefType[] = [
    'deal',
    'contact',
    'company',
    'order',
]

export const ENTITY_TYPE_LABELS: Record<EntityRefType, string> = {
    deal: 'Сделка',
    contact: 'Контакт',
    company: 'Компания',
    order: 'Продажа',
}

/** Эмодзи-иконка по типу (инлайновый рендер чипа без внешних зависимостей). */
export const ENTITY_TYPE_ICONS: Record<EntityRefType, string> = {
    deal: '🤝',
    contact: '👤',
    company: '🏢',
    order: '📦',
}

/**
 * Хост-роут карточки сущности (сверено по host routes.config: `/deals/:id`,
 * `/contacts/:id`, `/companies/:id`, `/orders/:id`). Тип единственного числа →
 * множественный сегмент пути.
 */
const ROUTE_SEGMENT: Record<EntityRefType, string> = {
    deal: 'deals',
    contact: 'contacts',
    company: 'companies',
    order: 'orders',
}

export function entityRoutePath(ref: EntityRef): string {
    return `/${ROUTE_SEGMENT[ref.type]}/${ref.id}`
}

/**
 * Токен-конвенция. Санитайзим label (убираем `[` `]` и переводы строк), чтобы
 * закрывающая `]]` не рвалась и токен оставался однострочным. Пустой label
 * заменяем на дефолт по типу — гарантия читаемости при деградации.
 */
export function serializeEntityRef(ref: EntityRef): string {
    const label =
        (ref.label ?? '').replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim() ||
        ENTITY_TYPE_LABELS[ref.type]
    return `[[entity:${ref.type}:${ref.id}|${label}]]`
}

/** Один сегмент разобранного текста: обычный текст или чип-ссылка. */
export type MessageSegment =
    | { kind: 'text'; text: string }
    | { kind: 'entity'; ref: EntityRef; raw: string }

// id: без `|` и `]`; label: без `]` (может содержать `|`, пробелы, юникод).
const TOKEN_RE = /\[\[entity:(deal|contact|company|order):([^|\]]+)\|([^\]]*)\]\]/g

function isEntityType(v: string): v is EntityRefType {
    return (ENTITY_TYPES as readonly string[]).includes(v)
}

/**
 * Разбирает текст на сегменты text/entity для рендера (MessageItem). Не-токены и
 * невалидные токены остаются обычным текстом. Всегда возвращает ≥1 сегмент; для
 * пустой строки — `[{kind:'text', text:''}]` (вызывающий сам решает не рендерить).
 */
export function parseMessageSegments(text: string): MessageSegment[] {
    const src = text ?? ''
    const segments: MessageSegment[] = []
    let lastIndex = 0
    TOKEN_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TOKEN_RE.exec(src)) !== null) {
        const [raw, type, id, label] = m
        if (!isEntityType(type)) continue
        if (m.index > lastIndex) {
            segments.push({ kind: 'text', text: src.slice(lastIndex, m.index) })
        }
        segments.push({
            kind: 'entity',
            raw,
            ref: { type, id, label: label.trim() || ENTITY_TYPE_LABELS[type] },
        })
        lastIndex = m.index + raw.length
    }
    if (lastIndex < src.length) {
        segments.push({ kind: 'text', text: src.slice(lastIndex) })
    }
    if (segments.length === 0) segments.push({ kind: 'text', text: '' })
    return segments
}

/** Есть ли в тексте хотя бы один entity-токен (быстрый гейт для рендера). */
export function hasEntityRefs(text: string): boolean {
    TOKEN_RE.lastIndex = 0
    return TOKEN_RE.test(text ?? '')
}
