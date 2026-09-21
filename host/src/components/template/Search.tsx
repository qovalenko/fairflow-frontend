import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import classNames from '@/utils/classNames'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import ScrollBar from '@/components/ui/ScrollBar'
import Segment from '@/components/ui/Segment'
import navigationIcon from '@/configs/navigation-icon.config'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useModulePolicy from '@/utils/hooks/useModulePolicy'
import usePermission from '@/utils/hooks/usePermission'
import { useVisibilityScope } from '@/utils/hooks/usePermissionStatus'
import useSearchClientSettings from '@/utils/hooks/useSearchClientSettings'
import {
    apiSearchQuery,
    searchHitPath,
    ENTITY_TYPE_LABEL,
    type SearchEntityType,
    type SearchQueryResponse,
    type SearchScopePreset,
} from '@/services/SearchService'
import debounce from 'lodash/debounce'
import {
    PiMagnifyingGlassDuotone,
    PiMagnifyingGlass,
    PiCaretRightDuotone,
    PiClockCountdownDuotone,
} from 'react-icons/pi'
import { Link, useNavigate } from 'react-router'
import Highlighter from 'react-highlight-words'
import {
    navigateSearchHit,
    SearchHitLink,
} from '@/components/search/SearchHitLink'
import { qa, qaWithAlias } from '@/shared/qa'

/**
 * SCR-SEARCH-DIALOG — глобальный поиск в шапке оболочки (TODO-259 / TODO-258).
 *
 * Раньше компонент звал `CommonService.apiGetSearchResult` и ждал МАССИВ секций
 * admin-шаблона, тогда как gateway `GET /api/search/query` отдаёт объект
 * `{ groups, total, total_by_type }` (common-bff.controller `search`) — любой
 * ответ падал в `normalizeSearchResults` → `[]` и шапка всегда показывала
 * «нет результатов». Теперь используется каноничный клиент домена
 * (`@/services/SearchService`), а `projectId` берётся из контекста проекта.
 *
 * ЭТО ЕДИНСТВЕННАЯ реализация SCR-SEARCH-DIALOG (TODO-258, решение зафиксировано
 * в круге доработки). Шапка оболочки — chrome хоста: слот `shell.header.action`
 * по RFC-3 §1.3 объявлен `accessKind:"host-only"`, т.е. закрыт для всех не-system
 * модулей (`rejectSlotContribution` → HOST_ONLY_SLOT_FORBIDDEN, зеркало
 * be-валидатора). `search` — `kind:"business"` (`shared/module-manifests.ts`,
 * `locked:false` в реестре: модуль выключается per-project), и поднимать его до
 * `system` РАДИ ПОПАДАНИЯ В ШАПКУ нельзя — это сняло бы изоляцию chrome от
 * бизнес/партнёрских модулей (RFC-3, недоговорное №5) и заодно сделало бы модуль
 * несъёмным (`isModuleLocked` выводит несъёмность из `kind==='system'`).
 * Поэтому дублирующий remote-экспоуз `remoteSearch/./GlobalSearchDialog` снят
 * (modules/search vite.config, `loadRemoteComponent`, federation-remotes.d.ts),
 * а недостающие элементы канона перенесены сюда:
 *   EL-DIALOG-10 ↑↓/Enter · EL-DIALOG-11 scope-пресет · ST-6 retry ·
 *   ST-13 visibility-note · ST-28 свежесть индекса.
 * Полноэкранный `SCR-SEARCH-RESULTS` остаётся за ремоутом (`modules/search`) —
 * это обычный маршрут модуля, а не chrome.
 */

/** Иконка секции по CRM-типу (ключи navigation-icon.config). */
const ENTITY_ICON_KEY: Record<SearchEntityType, string> = {
    contact: 'contacts',
    company: 'companies',
    deal: 'deals',
    order: 'orders',
    activity: 'activities',
    product: 'products',
}

type SearchData = {
    key: string
    path: string
    title: string
    subtitle?: string
    icon: string
    entity_type: SearchEntityType
    entity_id: string
}

type SearchSection = {
    /** CRM-тип секции — для ссылки «показать все». */
    type: SearchEntityType
    title: string
    /** Полное число видимых хитов типа (BFF `type_total`). */
    total: number
    data: SearchData[]
}

// T-018-FE: не дёргаем поиск на пустой/слишком короткой строке. TODO-492: порог
// (`minQueryChars`) и лимит хитов на тип (`perTypeLimit`) — сохранённые настройки
// проекта (useSearchClientSettings), а не константы сборки; дефолты модуля
// остаются запасным значением внутри хука.
const DEBOUNCE_MS = 300
const MAX_QUERY_LEN = 256 // FR-MSRCH-22 / NFR-MSRCH-6

type ScopePreset = SearchScopePreset

/**
 * EL-DIALOG-11 / FR-SEARCH-140. Дефолт — `all`: пресет только СУЖАЕТ выдачу
 * поверх уже резолвнутой видимости, поэтому «ничего не выбрано» = «всё, что мне
 * видно». Набор и правила показа — те же, что на SCR-SEARCH-RESULTS
 * (`modules/search/src/SearchResults.tsx`), чтобы лупа и полный экран не
 * расходились.
 */
const SCOPE_OPTIONS: { value: ScopePreset; label: string }[] = [
    { value: 'my', label: 'Мои' },
    { value: 'dept', label: 'Мой отдел' },
    { value: 'all', label: 'Все доступные' },
]
const DEFAULT_SCOPE: ScopePreset = 'all'

/** `?q=…&type=…&scope=…` — пресет переносится на полный экран (EL-DIALOG-9). */
const searchPageHref = (
    query: string,
    scope: ScopePreset,
    type?: SearchEntityType,
) => {
    const params = new URLSearchParams({ q: query })
    if (type) params.set('type', type)
    if (scope !== DEFAULT_SCOPE) params.set('scope', scope)
    return `/search?${params.toString()}`
}

/** `{groups}` контракта §3.1 → секции шапки. */
const toSections = (resp: SearchQueryResponse | undefined): SearchSection[] => {
    if (!resp || !Array.isArray(resp.groups)) return []
    return resp.groups
        .filter((g) => Array.isArray(g.list) && g.list.length > 0)
        .map((g) => ({
            type: g.entity_type,
            title: ENTITY_TYPE_LABEL[g.entity_type] ?? g.entity_type,
            total: g.type_total ?? g.list.length,
            data: g.list.map((hit) => ({
                key: hit.id,
                // Индекс хранит /p/<pid>/<модуль>/<id>; такого роута в host нет.
                path: searchHitPath(hit),
                title: hit.title,
                subtitle: hit.subtitle,
                icon: ENTITY_ICON_KEY[hit.entity_type] ?? 'list',
                entity_type: hit.entity_type,
                entity_id: hit.entity_id,
            })),
        }))
}

const errMessage = (e: unknown): string => {
    const err = e as {
        response?: { data?: { error?: { message?: string } } }
    }
    return err?.response?.data?.error?.message ?? 'Не удалось выполнить поиск'
}

const ListItem = (props: {
    icon: string
    label: string
    subtitle?: string
    url: string
    hit: Pick<SearchData, 'entity_type' | 'entity_id'>
    projectId: string | undefined
    isLast?: boolean
    keyWord: string
    /** EL-DIALOG-10: строка под кареткой ↑↓ (её же откроет Enter). */
    active?: boolean
    onNavigate: () => void
}) => {
    const {
        icon,
        label,
        subtitle,
        url = '',
        hit,
        projectId,
        keyWord,
        active,
        onNavigate,
    } = props
    const rowRef = useRef<HTMLDivElement>(null)

    // Каретка может уехать за пределы прокручиваемой области (max-h 350px).
    useEffect(() => {
        if (active) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
    }, [active])

    return (
        <SearchHitLink
            projectId={projectId}
            hit={hit}
            to={url}
            onNavigate={onNavigate}
        >
            <div
                ref={rowRef}
                {...qa('host.search.dialog.hit', {
                    entityType: hit.entity_type,
                    entityId: hit.entity_id,
                })}
                data-active={active ? 'true' : undefined}
                className={classNames(
                    'flex items-center justify-between rounded-xl p-3 cursor-pointer user-select',
                    active
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                )}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <div
                        className={classNames(
                            'rounded-lg border-2 border-gray-200 shadow-xs text-xl group-hover:shadow-sm h-10 w-10 flex items-center justify-center bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shrink-0',
                        )}
                    >
                        {icon && navigationIcon[icon]}
                    </div>
                    <div className="min-w-0 text-gray-900 dark:text-gray-300">
                        <div className="truncate">
                            <Highlighter
                                autoEscape
                                highlightClassName={classNames(
                                    'text-primary',
                                    'underline bg-transparent font-semibold dark:text-white',
                                )}
                                searchWords={[keyWord]}
                                textToHighlight={label ?? ''}
                            />
                        </div>
                        {subtitle && (
                            <div className="truncate text-xs text-gray-400">
                                {subtitle}
                            </div>
                        )}
                    </div>
                </div>
                <PiCaretRightDuotone className="text-lg shrink-0" />
            </div>
        </SearchHitLink>
    )
}

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error'

const _Search = ({ className }: { className?: string }) => {
    const [searchDialogOpen, setSearchDialogOpen] = useState(false)
    const [sections, setSections] = useState<SearchSection[]>([])
    const [status, setStatus] = useState<SearchStatus>('idle')
    const [errorText, setErrorText] = useState<string>('')
    const [query, setQuery] = useState('')
    /** EL-DIALOG-11: сужение выдачи поверх видимости. */
    const [scope, setScope] = useState<ScopePreset>(DEFAULT_SCOPE)
    /** EL-DIALOG-10: индекс строки под кареткой в ПЛОСКОМ порядке отрисовки. */
    const [activeIdx, setActiveIdx] = useState(-1)

    const navigate = useNavigate()
    const projectId = useCurrentProjectId()
    // Гейт показа лупы обязан повторять СЕРВЕРНЫЙ PEP, а не каталог модулей.
    //
    // `GET /api/search/query` (common-bff.controller.ts) намеренно НЕ навешивает
    // `@RequireModule('search')` — решение T-018: поиск это cross-cutting
    // возможность, и НИ ОДИН проект не включает модуль `search` по умолчанию
    // (module-registry: `locked: false`, вне DEMO_SHOWCASE_MODULES). Разрешение
    // считает ProjectAccessGuard в два шага:
    //   1) плоская матрица ролей `projectRoleCanKey(role, 'search', 'read')` —
    //      действие 'read' есть у ВСЕХ проектных ролей вплоть до viewer, значит
    //      отказа по роли для чтения поиска не бывает;
    //   2) module-policy overlay — явное project-wide deny-правило на
    //      `search:read` → 403 MODULE_POLICY_DENIED.
    //
    // Каталожный ключ `search:read` попадает в проекцию прав (PDP →
    // buildProjectCatalogWithSystem(effectiveModules)) ТОЛЬКО когда модуль
    // включён в проекте. Поэтому гейт `usePermission()('search','read')` прятал
    // лупу вообще у всех, включая владельца дефолтного проекта, — фронт говорил
    // «нельзя» там, где сервер честно отдаёт результаты. Гейтим ровно по (2):
    // правила нет → показываем, deny → прячем.
    // (FE-гейт — UX, не безопасность: сервер остаётся источником истины.)
    const searchPolicy = useModulePolicy('search')
    const searchDenied = !searchPolicy.flag('search:read', true)

    // TODO-492: порог/лимит/хоткей приходят из настроек проекта под тем же
    // гейтом, что и сам поиск (`GET /api/search/settings`, `search:read`).
    const { minQueryChars, perTypeLimit, hotkeyEnabled } =
        useSearchClientSettings(projectId, !searchDenied)

    // EL-DIALOG-11 / ST-12: пресет показываем только там, где он что-то меняет.
    // Правило дословно повторяет SCR-SEARCH-RESULTS: «Мой отдел» без отделов в
    // проекции прав всегда вернёт пусто, а при видимости only_own сужать нечего.
    // (`search:read` тут НЕ спрашиваем: каталожный ключ появляется в проекции
    // только при включённом модуле, а поиск cross-cutting — T-018.)
    const can = usePermission()
    const visibility = useVisibilityScope()
    const hasDepartments = (visibility?.departmentIds?.length ?? 0) > 0
    const scopeOptions = useMemo(
        () => SCOPE_OPTIONS.filter((o) => o.value !== 'dept' || hasDepartments),
        [hasDepartments],
    )
    const ownOnly =
        visibility?.mode === 'restricted' && visibility?.level === 'only_own'
    const showScopePreset =
        can('contacts', 'read') && !ownOnly && scopeOptions.length > 1

    const inputRef = useRef<HTMLInputElement>(null)
    // T-018-FE: отмена предыдущего in-flight /search/query.
    const abortRef = useRef<AbortController | null>(null)
    // projectId читаем через ref, чтобы debounce не пересоздавался на каждый
    // ре-рендер/смену проекта (иначе таймер не переиспользуется).
    const projectIdRef = useRef<string | undefined>(projectId)
    projectIdRef.current = projectId
    // Тот же приём для настроек: debounce создаётся один раз и обязан видеть
    // АКТУАЛЬНЫЕ значения, а не замкнутые на первый рендер (до ответа ручки там
    // стоят дефолты модуля).
    const settingsRef = useRef({ minQueryChars, perTypeLimit })
    settingsRef.current = { minQueryChars, perTypeLimit }
    // Тот же приём для пресета и последней строки запроса: их читает стабильный
    // (созданный один раз) debounce и повтор запроса по кнопке «Повторить».
    const scopeRef = useRef<ScopePreset>(scope)
    scopeRef.current = scope
    const queryRef = useRef('')

    const handleReset = () => {
        setStatus('idle')
        setErrorText('')
        setSections([])
        setQuery('')
        setActiveIdx(-1)
        queryRef.current = ''
    }

    const handleSearchOpen = () => {
        setSearchDialogOpen(true)
    }

    /**
     * Один запрос к `GET /api/search/query`. Вынесен из debounce, потому что его
     * зовут три сценария: ввод (debounce), смена scope-пресета (EL-DIALOG-11) и
     * ручной повтор после ошибки (ST-6). Стабилен по ссылке — всё изменчивое
     * читается через ref.
     */
    const performSearch = useCallback(async (raw: string) => {
        const trimmed = raw.trim().slice(0, MAX_QUERY_LEN)
        // Отменяем прежний in-flight перед новой веткой.
        abortRef.current?.abort()

        if (trimmed.length < settingsRef.current.minQueryChars) {
            setStatus('idle')
            setErrorText('')
            setSections([])
            return
        }

        const pid = projectIdRef.current
        if (!pid) {
            // ST-19: поиск живёт в рамках проекта.
            setStatus('idle')
            setErrorText('')
            setSections([])
            return
        }

        setStatus('loading')
        setErrorText('')
        const ctrl = new AbortController()
        abortRef.current = ctrl
        try {
            const respond = await apiSearchQuery(
                {
                    projectId: pid,
                    query: trimmed,
                    perTypeLimit: settingsRef.current.perTypeLimit,
                    pageSize: 25,
                    // TODO-262: пресет уходит в КОНТРАКТ (`?scope=`), а не только
                    // в ключ кэша. Бэкенд сужает им уже резолвнутый
                    // visibility-scope (FR-SEARCH-140/160): `my` — свои записи,
                    // `dept` — отделы пользователя, `all` — без сужения.
                    scope: scopeRef.current,
                },
                ctrl.signal,
            )
            if (ctrl.signal.aborted) return
            setSections(toSections(respond))
            setActiveIdx(-1)
            setStatus('ready')
        } catch (e) {
            // Отменённый запрос — не ошибка UI.
            if (ctrl.signal.aborted) return
            setSections([])
            setActiveIdx(-1)
            setErrorText(errMessage(e))
            setStatus('error')
        }
    }, [])

    // T-018-FE: стабильный debounce (создаётся один раз, а не на каждый рендер) +
    // порог длины + отмена прежнего запроса.
    const debounceFn = useMemo(
        () =>
            debounce((raw: string) => {
                const trimmed = raw.trim().slice(0, MAX_QUERY_LEN)
                setQuery(trimmed)
                queryRef.current = trimmed
                void performSearch(trimmed)
            }, DEBOUNCE_MS),
        [performSearch],
    )

    // EL-DIALOG-11: смена пресета — это НОВЫЙ запрос с тем же текстом, иначе
    // «контрол есть, эффекта нет». Текст запроса читаем через ref (его ведёт
    // debounce), поэтому эффект срабатывает ТОЛЬКО на смену пресета; на
    // монтировании запрос пустой → no-op.
    useEffect(() => {
        if (!queryRef.current) return
        void performSearch(queryRef.current)
    }, [scope, performSearch])

    // Гасим debounce/in-flight при размонтировании.
    useEffect(
        () => () => {
            debounceFn.cancel()
            abortRef.current?.abort()
        },
        [debounceFn],
    )

    const handleSearchClose = () => {
        setSearchDialogOpen(false)
        debounceFn.cancel()
        abortRef.current?.abort()
        handleReset()
    }

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        // EL-DIALOG-10: каретку сбрасываем сразу на нажатии, а не по приходу
        // ответа, — иначе Enter во время дебаунса открыл бы строку прошлой выдачи.
        setActiveIdx(-1)
        debounceFn(e.target.value)
    }

    // FR-MSRCH-26 / EL-DIALOG-2: Ctrl/Cmd+K открывает overlay. TODO-492: хоткей —
    // единственная из сохранённых настроек, которую применяет только клиент;
    // выключенный админом `hotkeyEnabled` слушателя не вешает. Гейт тот же, что
    // у самой лупы (project-wide deny на `search:read` → поиска нет вообще).
    useEffect(() => {
        if (searchDenied || !projectId || !hotkeyEnabled) return
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setSearchDialogOpen(true)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [searchDenied, projectId, hotkeyEnabled])

    useEffect(() => {
        if (searchDialogOpen) {
            const timeout = setTimeout(() => inputRef.current?.focus(), 100)
            return () => {
                clearTimeout(timeout)
            }
        }
    }, [searchDialogOpen])

    const handleNavigate = () => {
        handleSearchClose()
    }

    // EL-DIALOG-10: плоский список строк в порядке отрисовки — база для ↑↓/Enter.
    const flatItems = useMemo(
        () => sections.flatMap((section) => section.data),
        [sections],
    )

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!flatItems.length) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIdx((i) => (i + 1) % flatItems.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIdx((i) => (i <= 0 ? flatItems.length - 1 : i - 1))
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault()
            const item = flatItems[activeIdx]
            if (!item) return
            void navigateSearchHit(
                projectId,
                item,
                item.path,
                navigate,
                handleSearchClose,
            )
        }
    }

    // ST-10: project-wide deny на `search:read` — лупы в шапке нет (скрыть, а не
    // disabled). Во всех остальных случаях лупа есть: сервер пустил бы запрос.
    if (searchDenied) return null

    const hasQuery = query.length >= minQueryChars
    const noResult = status === 'ready' && sections.length === 0

    return (
        <>
            <div
                className={classNames(className, 'text-2xl')}
                onClick={handleSearchOpen}
                {...qa('host.search.trigger')}
            >
                <PiMagnifyingGlassDuotone />
            </div>
            <Dialog
                contentClassName="p-0"
                isOpen={searchDialogOpen}
                closable={false}
                onRequestClose={handleSearchClose}
                {...qa('host.search.dialog')}
            >
                <div onKeyDown={handleKeyDown} {...qa('host.search.dialog')}>
                    <div className="px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-600">
                        <div className="flex items-center">
                            <PiMagnifyingGlass className="text-xl" />
                            <input
                                ref={inputRef}
                                className="ring-0 outline-hidden block w-full p-4 text-base bg-transparent text-gray-900 dark:text-gray-100"
                                placeholder="Поиск по проекту..."
                                maxLength={MAX_QUERY_LEN}
                                onChange={handleSearch}
                                {...qaWithAlias(
                                    'host.search.dialog.input',
                                    'host.search.input',
                                )}
                            />
                        </div>
                        <Button
                            size="xs"
                            onClick={handleSearchClose}
                            {...qa('host.search.dialog.close')}
                        >
                            Esc
                        </Button>
                    </div>

                    {/* EL-DIALOG-11 / ST-12: scope-пресет (сужение поверх видимости) */}
                    {projectId && showScopePreset && (
                        <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-700">
                            <Segment
                                size="sm"
                                value={scope}
                                onChange={(val) => {
                                    const next = Array.isArray(val) ? val[0] : val
                                    setScope(
                                        (next as ScopePreset) || DEFAULT_SCOPE,
                                    )
                                }}
                            >
                                {scopeOptions.map((o) => (
                                    <Segment.Item
                                        key={o.value}
                                        value={o.value}
                                        {...qa('host.search.dialog.scope', {
                                            scope: o.value,
                                        })}
                                    >
                                        {o.label}
                                    </Segment.Item>
                                ))}
                            </Segment>
                        </div>
                    )}

                    <div className="py-6 px-5">
                        <ScrollBar className=" max-h-[350px] overflow-y-auto">
                            {/* ST-19: поиск работает только в контексте проекта */}
                            {!projectId && (
                                <div
                                    className="my-10 text-center text-sm text-gray-400"
                                    {...qa('host.search.dialog.noProject')}
                                >
                                    Поиск работает в рамках проекта. Выберите
                                    проект, чтобы продолжить.
                                </div>
                            )}

                            {/* ST-3: до ввода / ниже порога */}
                            {projectId && !hasQuery && (
                                <div
                                    className="my-10 text-center text-sm text-gray-400"
                                    {...qa('host.search.dialog.hint')}
                                >
                                    Начните вводить минимум {minQueryChars}{' '}
                                    символа для поиска по проекту.
                                </div>
                            )}

                            {/* ST-1: загрузка */}
                            {projectId && hasQuery && status === 'loading' && (
                                <div
                                    className="my-10 text-center text-sm text-gray-400"
                                    {...qa('host.search.dialog.loading')}
                                >
                                    Ищем…
                                </div>
                            )}

                            {/* ST-6: ошибка + ручной повтор (авто-ретраев нет) */}
                            {projectId && status === 'error' && (
                                <div
                                    className="my-10 text-center text-sm text-gray-500 dark:text-gray-300"
                                    {...qa('host.search.dialog.error')}
                                >
                                    <div>{errorText}</div>
                                    <button
                                        type="button"
                                        className="mt-3 text-sm text-primary font-semibold"
                                        onClick={() =>
                                            void performSearch(queryRef.current)
                                        }
                                        {...qa('host.search.dialog.retry')}
                                    >
                                        Повторить
                                    </button>
                                </div>
                            )}

                            {sections.map((section, sectionIdx) => {
                                // Смещение секции в ПЛОСКОМ порядке (EL-DIALOG-10).
                                const baseIndex = sections
                                    .slice(0, sectionIdx)
                                    .reduce((n, s) => n + s.data.length, 0)
                                return (
                                    <div
                                        key={section.type}
                                        className="mb-4"
                                        {...qa('host.search.dialog.section', {
                                            type: section.type,
                                        })}
                                    >
                                        <h6 className="mb-3">
                                            {section.title}
                                            <span className="ml-1 text-gray-300">
                                                ({section.total})
                                            </span>
                                        </h6>
                                        {section.data.map((data, i) => (
                                            <ListItem
                                                key={data.key}
                                                icon={data.icon}
                                                label={data.title}
                                                subtitle={data.subtitle}
                                                url={data.path}
                                                hit={data}
                                                projectId={projectId}
                                                keyWord={query}
                                                active={
                                                    baseIndex + i === activeIdx
                                                }
                                                onNavigate={handleNavigate}
                                            />
                                        ))}
                                        {section.total > section.data.length && (
                                            <Link
                                                to={searchPageHref(
                                                    query,
                                                    scope,
                                                    section.type,
                                                )}
                                                className="block px-3 py-1 text-xs text-primary hover:underline"
                                                onClick={handleNavigate}
                                                {...qa(
                                                    'host.search.dialog.showAll',
                                                    { type: section.type },
                                                )}
                                            >
                                                Показать все {section.total} →
                                            </Link>
                                        )}
                                    </div>
                                )
                            })}

                            {/* ST-4: нет результатов */}
                            {projectId && hasQuery && noResult && (
                                <div
                                    className="my-10 text-center text-lg"
                                    {...qaWithAlias(
                                        'host.search.dialog.empty',
                                        'host.search.empty',
                                    )}
                                >
                                    <span>Нет результатов для </span>
                                    <span className="heading-text">
                                        {`'`}
                                        {query}
                                        {`'`}
                                    </span>
                                </div>
                            )}
                        </ScrollBar>

                        {/* Вход на полноэкранный поиск (SCR-SEARCH-RESULTS) */}
                        {projectId && hasQuery && (
                            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 text-center">
                                <Link
                                    to={searchPageHref(query, scope)}
                                    className="text-sm text-primary hover:underline"
                                    onClick={handleNavigate}
                                    {...qa('host.search.dialog.openPage')}
                                >
                                    Открыть страницу поиска
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* ST-13 visibility-note + ST-28 свежесть индекса */}
                    {projectId && (
                        <div className="flex items-center justify-between gap-2 px-5 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
                            <span {...qa('host.search.dialog.footer.visibility')}>
                                Показаны записи в рамках вашей видимости.
                            </span>
                            <span
                                className="flex items-center gap-1"
                                {...qa('host.search.dialog.footer.lag')}
                            >
                                <PiClockCountdownDuotone />
                                Индекс может обновляться с задержкой
                            </span>
                        </div>
                    )}
                </div>
            </Dialog>
        </>
    )
}

const Search = withHeaderItem(_Search)

export default Search
