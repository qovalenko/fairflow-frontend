/**
 * data-qa-id helper for stable e2e (Playwright) selectors.
 * See modules/contacts/src/qa.ts — duplicated per remote for build-local tree-shaking.
 */
export interface QaAttributes {
    readonly [key: `data-qa${string}`]: string | undefined
}

const NONE: QaAttributes = {}

export function qa(
    id: string,
    data?: Record<string, string | number | null | undefined>,
): QaAttributes {
    if (!__QA_IDS_ENABLED__) return NONE
    const attrs: Record<string, string> = { 'data-qa-id': id }
    if (data) {
        for (const key of Object.keys(data)) {
            const value = data[key]
            if (value !== null && value !== undefined) {
                attrs[`data-qa-${key}`] = String(value)
            }
        }
    }
    return attrs
}
