/**
 * T-010 — единый механизм человекочитаемого имени.
 *
 * Проблема: во множестве экранов вместо ФИО светился email или сырой UUID —
 * потому что бэкенд-ответы отдают либо только `id`/`userId`, либо `name`, в
 * котором лежит UUID/login (fallback домена), либо связанная сущность вообще
 * не резолвится в имя.
 *
 * Решение: одна чистая функция с фиксированной цепочкой падения
 *   ФИО → name(если это не id) → email → login → UUID → '—'.
 * Использовать её ВЕЗДЕ, где рендерится имя пользователя/персоны, чтобы UUID
 * никогда не «протекал» в UI, а email показывался только как осознанный fallback.
 */

/** UUID (в т.ч. v7, что использует auth) либо 24-символьный hex (mongo id доменов). */
const ID_RE =
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})$/i

/** Значение выглядит как машинный идентификатор (не имя человека). */
export function looksLikeId(value: string | null | undefined): boolean {
    if (!value) return false
    return ID_RE.test(value.trim())
}

export type NameParts = {
    name?: string | null
    firstName?: string | null
    lastName?: string | null
    middleName?: string | null
    email?: string | null
    login?: string | null
    id?: string | null
    userId?: string | null
}

const clean = (v: string | null | undefined): string => (v ?? '').trim()

/** ФИО из отдельных полей (Фамилия Имя Отчество), пустые части отбрасываются. */
export function joinFullName(
    parts: Pick<NameParts, 'firstName' | 'lastName' | 'middleName'>,
): string {
    return [parts.lastName, parts.firstName, parts.middleName]
        .map(clean)
        .filter(Boolean)
        .join(' ')
        .trim()
}

/**
 * Человекочитаемое имя персоны с fallback ФИО → email → UUID.
 * @param fallback что вернуть, если нет вообще ничего (по умолчанию '—').
 */
export function personDisplayName(parts: NameParts, fallback = '—'): string {
    const fio = joinFullName(parts)
    if (fio) return fio

    const name = clean(parts.name)
    // `name` берём, только если это реальное имя, а не подставленный доменом UUID.
    if (name && !looksLikeId(name)) return name

    const email = clean(parts.email)
    if (email) return email

    const login = clean(parts.login)
    if (login && !looksLikeId(login)) return login

    // Последняя ступень цепочки — сам идентификатор (лучше UUID, чем пусто).
    const id = clean(parts.userId) || clean(parts.id) || name
    return id || fallback
}

/** Инициалы для аватара из уже вычисленного отображаемого имени. */
export function initialsFromName(display: string, fallback = '—'): string {
    const src = clean(display)
    if (!src || looksLikeId(src)) return fallback
    const words = src.split(/\s+/).filter(Boolean)
    if (words.length === 0) return fallback
    if (words.length === 1) {
        // email: берём первую букву локальной части.
        const w = words[0].includes('@') ? words[0].split('@')[0] : words[0]
        return w.slice(0, 2).toUpperCase()
    }
    return (words[0][0] + words[1][0]).toUpperCase()
}
