/** Canonical trash hint for soft-deleted duplicate candidates (FR-DEALS-040). */
export const TRASH_DUPLICATE_HINT = 'Похожий в корзине. Восстановить?'

export type CompanyDupCandidate = {
    id: string
    name: string
    inn?: string
    matchReason?: string
    deleted?: boolean
}

export const COMPANY_MATCH_LABELS: Record<string, string> = {
    inn: 'по ИНН',
    domain: 'по домену',
    name: 'по названию',
}
