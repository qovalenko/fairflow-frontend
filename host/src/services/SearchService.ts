import ApiService from './ApiService'

/**
 * Search-domain API client (контракт docs/tz/contracts/search.md).
 *
 * Search — навигационный слой над производным индексом: глобальный кросс-сущностный
 * поиск (`/search/query`), наблюдаемость свежести (`/search/status`), ручная
 * реиндексация (`/search/reindex`). Настройки модуля живут в control
 * (`/projects/:id/modules/search/settings`).
 *
 * Все запросы идут на gateway REST `/api`. `projectId` передаётся query-параметром
 * (gateway также читает заголовок X-Project-Id; на TO-BE projectId берётся из
 * контекста токена — FR-MSRCH-4, query-значение игнорируется). Небезопасные
 * мутации (reindex) несут `Idempotency-Key`.
 */

// ─── Типы (зеркало схем контракта §3) ───────────────────────────────────────

/** CRM-типы индексируемых сущностей (FR-MSRCH-2; OQ-UX-SEARCH-6). */
export type SearchEntityType =
    | 'contact'
    | 'company'
    | 'deal'
    | 'order'
    | 'activity'
    | 'product'

/** Один хит индекса (`SearchHit` контракта §3.1). */
export interface SearchHit {
    id: string
    entity_type: SearchEntityType
    entity_id: string
    title: string
    subtitle?: string
    /** Динамический путь на карточку домена `SCR-<AREA>-DETAILS`. */
    path: string
    score: number
    updated_at: number
}

/** Группа результатов по типу сущности. */
export interface SearchGroup {
    entity_type: SearchEntityType
    list: SearchHit[]
    /** Полное число видимых хитов этого типа (для «показать все N»). */
    type_total: number
}

/** Ответ `GET /api/search/query` (§3.1/§3.2). */
export interface SearchQueryResponse {
    groups: SearchGroup[]
    total: number
    total_by_type: Partial<Record<SearchEntityType, number>>
    /**
     * TODO-261: есть ли следующая страница. Считает бэкенд — только он знает и
     * per-type тоталы, и ЭФФЕКТИВНЫЙ размер страницы на тип (`perTypeLimit`,
     * который gateway может взять из настроек проекта, а не из `pageSize`
     * клиента). Клиентская догадка `(page+1)*pageSize < total` держала «Вперёд»
     * активной почти всегда. Отсутствие поля трактуем как «следующей нет».
     */
    has_more?: boolean
    /** Только при `groupBy` (§3.2, FR-MSRCH-30). count-only. */
    total_by_owner?: Record<string, number>
}

/**
 * Пресет области видимости (FR-SEARCH-140 / TODO-262): «Мои / Мой отдел / Все
 * доступные». Уходит в API как `?scope=`; на бэкенде это ТОЛЬКО сужение поверх
 * уже резолвнутого visibility-scope (расширить видимость им нельзя), `dept`
 * разворачивается gateway'ем в отделы пользователя через control.
 */
export type SearchScopePreset = 'my' | 'dept' | 'all'

export interface SearchQueryParams {
    projectId: string
    query: string
    /** Пресет области видимости (FR-SEARCH-140); `all` = без сужения. */
    scope?: SearchScopePreset
    pageIndex?: number
    /** ∈ {25,50,100} */
    pageSize?: 25 | 50 | 100
    /** Ограничение набора типов (пересекается с enabled-modules). */
    entityTypes?: SearchEntityType[]
    /** Лимит хитов на тип (def 5 из settings). */
    perTypeLimit?: number
    /** count-разбивка (FR-MSRCH-30). */
    groupBy?: 'ownerId' | 'departmentId'
}

/** Ответ `GET /api/search/status` (§3.4). */
export interface SearchStatus {
    lastEventProcessedAt: number | null
    lagMs: number | null
    indexedCount: number
    freshnessSlaMs: number
    deadLetterCount?: number
}

/** Ответ `POST /api/search/reindex` (§3.3). */
export interface SearchReindexResponse {
    indexed_count: number
    sources: string[]
    jobId?: string
    status?: 'running' | 'done' | 'failed'
    /**
     * TODO-256: перестройка НЕПОЛНАЯ — хотя бы один источник обрезан бюджетом
     * `SEARCH_REINDEX_MAX_DOCS` либо пропущен из-за потерянного лока
     * (`ReindexResponse.truncated`, search.proto). Домен в таком случае не
     * штампует `backfilledAt`, т.е. проход надо повторить. Поле snake_case, как
     * и `indexed_count`: gateway грузит proto с `keepCase: true`.
     */
    truncated?: boolean
    /** Типы, чей проход обрезан/пропущен (подмножество запрошенных). */
    skipped_types?: string[]
}

/** Настройки модуля (control, `settingsSchema` — FR-MSRCH-19). */
export interface SearchSettings {
    /** Порог запроса (def 2). */
    minQueryChars: number
    /** Лимит хитов на тип (def 5). */
    perTypeLimit: number
    /** Ctrl/Cmd+K включён. */
    hotkeyEnabled: boolean
    /** Набор индексируемых типов (эффективно ∩ enabled-modules). */
    indexableTypes: SearchEntityType[]
    /** SLA свежести (мс, опц.). */
    freshnessSlaMs?: number
}

/** Дефолты settingsSchema (используются, пока control-ручка не отдаёт значения). */
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
    minQueryChars: 2,
    perTypeLimit: 5,
    hotkeyEnabled: true,
    indexableTypes: ['contact', 'company', 'deal', 'order', 'activity', 'product'],
    freshnessSlaMs: 5000,
}

/** Человекочитаемые лейблы типов (EL-DIALOG-5 / OQ-UX-SEARCH-6). */
export const ENTITY_TYPE_LABEL: Record<SearchEntityType, string> = {
    contact: 'Контакты',
    company: 'Компании',
    deal: 'Сделки',
    order: 'Продажи',
    activity: 'Активности',
    product: 'Продукты',
}

/**
 * Маршрут карточки сущности в host-роутинге (`routes.config.ts`).
 *
 * Домен кладёт в индекс путь вида `/p/<projectId>/<модуль>/<id>`
 * (search.service.ts makeDoc / projectUpsert), но такой схемы в host нет: есть
 * верхнеуровневые `/contacts/:id`, `/companies/:id`, `/deals/:id`, `/orders/:id`,
 * `/products/:id` и `/activities/*` — проект берётся из store/`/p/:pid`-контекста.
 * Переход по «сырому» `hit.path` попадал в catch-all → 404 на каждом результате.
 */
const ENTITY_ROUTE_BASE: Record<SearchEntityType, string> = {
    contact: '/contacts',
    company: '/companies',
    deal: '/deals',
    order: '/orders',
    activity: '/activities',
    product: '/products',
}

/** Снимает префикс проекта `/p/<pid>` с индексированного пути. */
export function stripProjectPathPrefix(path: string): string {
    const m = /^\/p\/[^/]+(\/.+)$/.exec(path)
    return m ? m[1] : path
}

/**
 * Нормализация пути хита на чтении (без реиндекса уже проиндексированных
 * документов): маршрут строится из `entity_type` + `entity_id`, а «сырой»
 * `hit.path` остаётся запасным вариантом для незнакомых типов.
 */
export function searchHitPath(hit: {
    entity_type: string
    entity_id?: string
    path?: string
}): string {
    const base = ENTITY_ROUTE_BASE[hit.entity_type as SearchEntityType]
    if (base && hit.entity_id) return `${base}/${hit.entity_id}`
    return hit.path ? stripProjectPathPrefix(hit.path) : '/'
}

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `ik_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

/** FR-SEARCH-110 / FR-MSRCH-27: stale-хит из индекса → понятное сообщение, не пустая карточка. */
export const SEARCH_HIT_UNAVAILABLE_MSG = 'Запись недоступна или удалена'

/** GET одной записи домена перед переходом из поиска (лёгкий probe, не полная карточка). */
const ENTITY_PROBE_PATH: Record<SearchEntityType, (id: string) => string> = {
    contact: (id) => `/v1/contacts/${id}`,
    company: (id) => `/v1/companies/${id}`,
    deal: (id) => `/v1/deals/${id}`,
    order: (id) => `/v1/orders/${id}`,
    activity: (id) => `/v1/activities/${id}`,
    product: (id) => `/v1/products/${id}`,
}

/** 403/404 при probe — записи нет в зоне видимости или она удалена. */
export function isSearchHitAccessDenied(e: unknown): boolean {
    const status = (e as { response?: { status?: number } })?.response?.status
    return status === 403 || status === 404
}

/**
 * FR-SEARCH-110: проверяет, что целевая карточка ещё доступна, прежде чем уводить
 * пользователя из контекста поиска. fail-open для неизвестных типов и сетевых
 * ошибок — доменная карточка сама отработает 403/404.
 */
export async function probeSearchHitAvailability(
    projectId: string,
    hit: Pick<SearchHit, 'entity_type' | 'entity_id'>,
    signal?: AbortSignal,
): Promise<boolean> {
    const path = ENTITY_PROBE_PATH[hit.entity_type]
    if (!path || !hit.entity_id) return true
    try {
        await ApiService.fetchDataWithAxios({
            url: path(hit.entity_id),
            method: 'get',
            params: { projectId },
            signal,
        })
        return true
    } catch (e) {
        if (isSearchHitAccessDenied(e)) return false
        throw e
    }
}

// ─── Методы ──────────────────────────────────────────────────────────────────

/**
 * GET /api/search/query (§3.1/§3.2).
 *
 * `signal` — опциональный AbortSignal: вызывающий (SWR-фетчер overlay/страницы)
 * отменяет предыдущий in-flight запрос при новом вводе, чтобы не копить гонки
 * ответов на устаревшие ключи (T-018-FE).
 */
export async function apiSearchQuery(
    params: SearchQueryParams,
    signal?: AbortSignal,
) {
    const { projectId, query, entityTypes, ...rest } = params
    return ApiService.fetchDataWithAxios<SearchQueryResponse>({
        url: '/search/query',
        method: 'get',
        signal,
        params: {
            projectId,
            query,
            ...(entityTypes && entityTypes.length
                ? { entityTypes: entityTypes.join(',') }
                : {}),
            ...rest,
        },
    })
}

/**
 * Member-readable проекция настроек модуля (TODO-492, хвост).
 *
 * Сохранённые настройки читались только админской ручкой control
 * (`GET /projects/:id/modules/search/settings`, гейт `project:manage`), поэтому
 * рядовой участник получал 403 и клиент навсегда оставался на
 * `DEFAULT_SEARCH_SETTINGS` — «порог 2 символа» и «хоткей включён» админа никто
 * не применял именно для тех, кому их настраивали. gateway отдаёт ту же
 * конфигурацию под гейтом `search:read` (`GET /api/search/settings`,
 * common-bff.controller `searchClientSettings`) с уже подставленными дефолтами.
 *
 * `indexableTypes: []` в ответе означает «проект набор не ограничивал» (то же,
 * что отсутствующее значение на `/search/query`), а НЕ «искать нечего».
 */
export interface SearchClientSettings {
    minQueryChars: number
    perTypeLimit: number
    hotkeyEnabled: boolean
    indexableTypes: SearchEntityType[]
    freshnessSlaMs?: number
}

/** GET /api/search/settings (гейт `search:read`). */
export async function apiGetSearchClientSettings(
    projectId: string,
    signal?: AbortSignal,
) {
    return ApiService.fetchDataWithAxios<SearchClientSettings>({
        url: '/search/settings',
        method: 'get',
        signal,
        params: { projectId },
    })
}

/** GET /api/search/status (§3.4). */
export async function apiSearchStatus(params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<SearchStatus>({
        url: '/search/status',
        method: 'get',
        params,
    })
}

/**
 * POST /api/search/reindex (§3.3).
 *
 * `entityTypes` уходит ТОЛЬКО query-параметром (CSV): BFF-обработчик объявлен
 * как `@Query('entityTypes')` и разбирает строку через `split(',')`
 * (common-bff.controller.ts `reindex`) — тело он не читает вовсе, поэтому
 * прежний `data: { entityTypes }` молча терялся и домен всегда делал полный
 * реиндекс. Формат совпадает с `apiSearchQuery`.
 */
export async function apiSearchReindex(params: {
    projectId: string
    entityTypes?: SearchEntityType[]
}) {
    return ApiService.fetchDataWithAxios<SearchReindexResponse>({
        url: '/search/reindex',
        method: 'post',
        params: {
            projectId: params.projectId,
            ...(params.entityTypes && params.entityTypes.length
                ? { entityTypes: params.entityTypes.join(',') }
                : {}),
        },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** GET /api/projects/:id/modules/search/settings (control, FR-MSRCH-19). */
export async function apiGetSearchSettings(projectId: string) {
    return ApiService.fetchDataWithAxios<SearchSettings>({
        url: `/projects/${projectId}/modules/search/settings`,
        method: 'get',
    })
}

/** PUT /api/projects/:id/modules/search/settings (control, FR-MSRCH-19). */
export async function apiPutSearchSettings(
    projectId: string,
    settings: SearchSettings,
) {
    return ApiService.fetchDataWithAxios<SearchSettings, SearchSettings>({
        url: `/projects/${projectId}/modules/search/settings`,
        method: 'put',
        data: settings,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}
