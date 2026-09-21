/**
 * data-qa-id helper for stable e2e (Playwright) selectors.
 *
 * Usage:
 *   <input {...qa('host.login.email')} />
 *   <div {...qa('host.sidebar.item', { nav: item.key })} />
 *     -> data-qa-id="host.sidebar.item" data-qa-nav="deals"
 *
 * The second argument adds `data-qa-<key>` attributes for entity differentiation
 * (row identity etc.) WITHOUT baking positional indexes into the id. Everything is
 * returned as one object so it can be spread onto shared UI components too — a
 * spread of this typed object is never checked for excess props, unlike a direct
 * `data-*` attribute which TS rejects on non-intrinsic components.
 *
 * Naming convention: `<module>.<screen>.<element>`
 * See notes/build/plans/QA-ID-CONVENTION.md.
 *
 * The enable flag is injected at BUILD time via Vite `define` (__QA_IDS_ENABLED__):
 *   - `vite dev` / standalone serve  (mode !== 'production')      -> true
 *   - `VITE_QA_IDS=true vite build`  (test / standalone build)    -> true
 *   - plain `vite build`             (prod, default)              -> false
 *
 * When disabled the constant folds to `false`, so Rollup drops the attribute
 * branch during tree-shaking — prod bundles contain no `data-qa-id` at all.
 *
 * NOTE: this file is intentionally duplicated in the host and in each remote
 * module. `@fairflow/shared-ui` is consumed as a PRE-BUILT npm package from the
 * GitLab registry, so any `import.meta.env` / `define` inside it would be resolved
 * at shared-ui build time — not in the final host/module build, where the flag
 * actually needs to be evaluated. Keeping the helper as source in every consuming
 * app makes the flag build-local and the prod strip reliable. Future home: shared-ui.
 */
export interface QaAttributes {
    readonly [key: `data-qa${string}`]: string | undefined
}

/**
 * Тот же флаг значением — для qa-скоупа, который уезжает ПРОПОМ в host-компонент
 * (`DataTable qaScope` → пагинация). Такой компонент собирается в бандл каждого
 * ремоута, поэтому сам `__QA_IDS_ENABLED__` не читает: гейтит вызывающий экран.
 */
export const QA_IDS_ENABLED: boolean = __QA_IDS_ENABLED__

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

/** Primary id plus a legacy alias on the same node (both matchable in e2e). */
export function qaWithAlias(
    primary: string,
    legacy: string,
    data?: Record<string, string | number | null | undefined>,
): QaAttributes {
    if (!__QA_IDS_ENABLED__) return NONE
    const attrs: Record<string, string> = {
        'data-qa-id': primary,
        'data-qa-id-legacy': legacy,
    }
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
