import { useEffect, useState, useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Switcher from '@/components/ui/Switcher'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Skeleton from '@/components/ui/Skeleton'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import {
    PiArrowsClockwiseDuotone,
    PiWarningCircleDuotone,
    PiCheckCircleDuotone,
} from 'react-icons/pi'
import { searchClientSettingsKey } from '@/utils/hooks/useSearchClientSettings'
import {
    apiGetSearchSettings,
    apiPutSearchSettings,
    apiSearchStatus,
    apiSearchReindex,
    DEFAULT_SEARCH_SETTINGS,
    ENTITY_TYPE_LABEL,
    type SearchSettings,
    type SearchEntityType,
} from '@/services/SearchService'
import {
    ErrorState,
    NoPermissionState,
    NoProjectState,
    ModuleDisabledState,
    errMessage,
    errCode,
} from './shared'
import { qa } from './qa'

/**
 * SCR-SEARCH-SETTINGS (+ секция SCR-SEARCH-STATUS) — вкладка настроек модуля.
 * Монтируется в слот `project.settings.tab` (accessKind `open`, гейт —
 * `requires: project:manage`; решение OQ-MODULE-130). Вклад объявлен в манифесте
 * `backend/shared/src/module-manifests.ts` (`search.frontend.mountPoints`).
 * Источник: docs/ux/screens/search/SCREENS.md.
 *
 * Покрыто:
 *  - EL-SETTINGS-1 minQueryChars · EL-SETTINGS-2 perTypeLimit · EL-SETTINGS-3
 *    hotkeyEnabled · EL-SETTINGS-4 indexableTypes · EL-SETTINGS-5 reindex ·
 *    EL-SETTINGS-6 секция статуса · EL-SETTINGS-7 «Сохранить»
 *  - STATUS: EL-STATUS-1..4 свежесть/лаг/count/reindex
 *  - Состояния: ST-1 загрузка, ST-6 ошибка, ST-7 ошибка действия,
 *    ST-10/11/12 гейтинг, ST-17 модуль выключен, ST-19 нет проекта,
 *    ST-26 reindex running, ST-28 lag, ST-29 success, ST-30 dirty.
 */

const ALL_TYPES = Object.keys(ENTITY_TYPE_LABEL) as SearchEntityType[]

/**
 * Типы из `skipped_types` приходят сырыми строками протокола: домен может
 * назвать тип, которого фронт ещё не знает (новый источник). Известные —
 * человекочитаемым лейблом, неизвестные — как есть, но не молча теряем.
 */
const formatSkippedTypes = (types: string[]): string =>
    types
        .map((t) => ENTITY_TYPE_LABEL[t as SearchEntityType] ?? t)
        .join(', ')

export interface SearchSettingsTabProps {
    /**
     * Проект, настройки которого редактируются. Хост передаёт его как контекст
     * слота (`<Slot id="project.settings.tab" context={{ projectId }} />`,
     * манифест: `requiresContext: ['projectId']`) и это ЕДИНСТВЕННЫЙ достоверный
     * источник: экран настроек живёт на `/account/projects/:projectId/settings`,
     * где `useCurrentProjectId()` (читает `:pid`/store) вернул бы «текущий»
     * проект портфеля — то есть чужой. Без этого пропса вкладка молча писала бы
     * настройки не в тот проект.
     */
    projectId?: string
    /** Host прокидывает признак выключенного модуля (Contextual UI, ST-17). */
    moduleDisabled?: boolean
}

const SearchSettingsTab = (props: SearchSettingsTabProps) => {
    const currentPid = useCurrentProjectId()
    const pid = props.projectId ?? currentPid
    const can = usePermission()
    // Сервер гейтит GET и PUT `projects/:id/modules/:moduleId/settings` правом
    // `project:manage` (gateway common-bff.controller.ts) — гейт чтения = гейт
    // записи, и слот `project.settings.tab` требует того же. Историю с
    // `module:manage`/`search:manage` оставляем как совместимый суперсет.
    const canManageProject = can('project', 'manage')
    const canManageModule = can('module', 'manage')
    const canManageSearch = can('search', 'manage')
    // TODO-492: сброс клиентской проекции настроек после сохранения.
    const { mutate: globalMutate } = useSWRConfig()

    const settingsKey = pid ? ['/search/settings', pid] : null
    const {
        data: loaded,
        error,
        isLoading,
        mutate,
    } = useSWR<SearchSettings>(
        settingsKey,
        () => apiGetSearchSettings(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [form, setForm] = useState<SearchSettings>(DEFAULT_SEARCH_SETTINGS)
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (loaded) {
            // Backend persists only keys present in the module settingsSchema, so
            // merge over defaults — a missing/empty field must never blank the form.
            setForm({ ...DEFAULT_SEARCH_SETTINGS, ...loaded })
            setDirty(false)
        }
    }, [loaded])

    // ST-30: предупреждение об уходе при несохранённой форме.
    useEffect(() => {
        if (!dirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [dirty])

    const patch = useCallback((p: Partial<SearchSettings>) => {
        setForm((f) => ({ ...f, ...p }))
        setDirty(true)
    }, [])

    const toggleType = useCallback(
        (t: SearchEntityType) => {
            setForm((f) => {
                const has = f.indexableTypes.includes(t)
                return {
                    ...f,
                    indexableTypes: has
                        ? f.indexableTypes.filter((x) => x !== t)
                        : [...f.indexableTypes, t],
                }
            })
            setDirty(true)
        },
        [],
    )

    const onSave = useCallback(async () => {
        if (!pid) return
        setSaving(true)
        try {
            const saved = await apiPutSearchSettings(pid, form)
            await mutate(saved, { revalidate: false })
            // TODO-492: настройки применяет клиент (порог запроса, лимит на тип,
            // Ctrl/Cmd+K) через member-readable проекцию gateway. Без сброса её
            // кэша шапка и экран результатов продолжили бы жить на старых
            // значениях до перезагрузки страницы.
            await globalMutate(searchClientSettingsKey(pid))
            setDirty(false)
            // ST-29: success
            toast.push(
                <Notification
                    type="success"
                    title="Готово"
                    {...qa('search.settings.toast.saved')}
                >
                    Настройки поиска сохранены.
                </Notification>,
            )
        } catch (e) {
            // ST-7: ошибка действия
            toast.push(
                <Notification type="danger" title="Не удалось сохранить">
                    {errMessage(e)} {errCode(e) ? `(${errCode(e)})` : ''}
                </Notification>,
            )
        } finally {
            setSaving(false)
        }
    }, [pid, form, mutate, globalMutate])

    // ST-17: модуль выключен.
    if (props.moduleDisabled) return <ModuleDisabledState />
    // ST-19: нет проекта.
    if (!pid) return <NoProjectState />
    // ST-10: вкладка требует project:manage (гейт сервера); module:manage /
    // search:manage остаются как совместимый суперсет.
    if (!canManageProject && !canManageModule && !canManageSearch)
        return (
            <NoPermissionState message="Нужно право управления модулями проекта." />
        )

    return (
        <div className="flex flex-col gap-4" {...qa('search.settings.page')}>
            <h4>Поиск</h4>

            {/* ST-1: загрузка формы */}
            {isLoading && !loaded ? (
                <Card {...qa('search.settings.loading')}>
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} height={36} />
                        ))}
                    </div>
                </Card>
            ) : error && !loaded ? (
                // ST-6: ошибка загрузки настроек (с дефолтами в форме — fallback)
                <Card>
                    <ErrorState
                        message={errMessage(
                            error,
                            'Не удалось загрузить настройки',
                        )}
                        code={errCode(error)}
                        onRetry={() => mutate()}
                        qaId="search.settings.loadError"
                        retryQaId="search.settings.loadRetry"
                    />
                </Card>
            ) : (
                <Card {...qa('search.settings.form')}>
                    <div className="flex flex-col gap-5">
                        {/* EL-SETTINGS-1 */}
                        <Field label="Минимум символов для поиска">
                            <Input
                                type="number"
                                min={1}
                                max={10}
                                value={form.minQueryChars}
                                disabled={!canManageModule}
                                onChange={(e) =>
                                    patch({
                                        minQueryChars:
                                            parseInt(e.target.value, 10) || 1,
                                    })
                                }
                                className="max-w-[120px]"
                                {...qa('search.settings.minQueryChars')}
                            />
                        </Field>

                        {/* EL-SETTINGS-2 */}
                        <Field label="Результатов на тип (overlay)">
                            <Input
                                type="number"
                                min={1}
                                max={50}
                                value={form.perTypeLimit}
                                disabled={!canManageModule}
                                onChange={(e) =>
                                    patch({
                                        perTypeLimit:
                                            parseInt(e.target.value, 10) || 5,
                                    })
                                }
                                className="max-w-[120px]"
                                {...qa('search.settings.perTypeLimit')}
                            />
                        </Field>

                        {/* EL-SETTINGS-3 */}
                        <Field label="Горячая клавиша Ctrl/Cmd+K">
                            <Switcher
                                checked={form.hotkeyEnabled}
                                disabled={!canManageModule}
                                onChange={(checked) =>
                                    patch({ hotkeyEnabled: checked })
                                }
                                {...qa('search.settings.hotkeyEnabled')}
                            />
                        </Field>

                        {/* EL-SETTINGS-4 */}
                        <Field label="Индексируемые типы">
                            <div className="flex flex-wrap gap-3">
                                {ALL_TYPES.map((t) => (
                                    <Checkbox
                                        key={t}
                                        checked={form.indexableTypes.includes(t)}
                                        disabled={!canManageModule}
                                        onChange={() => toggleType(t)}
                                        {...qa('search.settings.indexableType', {
                                            type: t,
                                        })}
                                    >
                                        {ENTITY_TYPE_LABEL[t]}
                                    </Checkbox>
                                ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Эффективный набор = выбранные типы ∩ включённые
                                модули проекта.
                            </p>
                        </Field>

                        {/* EL-SETTINGS-7 / ST-12 */}
                        <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                            <Button
                                variant="solid"
                                loading={saving}
                                disabled={!canManageModule || !dirty}
                                onClick={onSave}
                                {...qa('search.settings.save')}
                            >
                                Сохранить
                            </Button>
                            {dirty && (
                                <span
                                    className="text-xs text-amber-500"
                                    {...qa('search.settings.dirty')}
                                >
                                    Есть несохранённые изменения
                                </span>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* Секция «Индекс» — SCR-SEARCH-STATUS (ST-11: только search:manage) */}
            {canManageSearch ? (
                <IndexStatusSection
                    projectId={pid}
                    canReindex={canManageSearch}
                    // EL-SETTINGS-4 → EL-SETTINGS-5: реиндексируем ровно те типы,
                    // что отмечены в форме. Полный набор шлём как «без фильтра»
                    // (домен трактует пустой entity_types как полный реиндекс).
                    entityTypes={form.indexableTypes}
                    // Незасейвленный набор не должен уходить в реиндекс молча.
                    dirtyTypes={dirty}
                />
            ) : null}
        </div>
    )
}

const Field = ({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {label}
        </label>
        {children}
    </div>
)

/** SCR-SEARCH-STATUS — секция наблюдаемости свежести индекса. */
const IndexStatusSection = ({
    projectId,
    canReindex,
    entityTypes,
    dirtyTypes,
}: {
    projectId: string
    canReindex: boolean
    /** Индексируемые типы из формы (EL-SETTINGS-4) — сужают реиндекс. */
    entityTypes?: SearchEntityType[]
    /** Форма изменена и ещё не сохранена (ST-30). */
    dirtyTypes?: boolean
}) => {
    const statusKey = ['/search/status', projectId]
    const { data, error, isLoading, mutate } = useSWR(
        statusKey,
        () => apiSearchStatus({ projectId }),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
            refreshInterval: 30000, // ST-2: авто-poll свежести
        },
    )
    const [reindexing, setReindexing] = useState(false)

    const onReindex = useCallback(async () => {
        setReindexing(true)
        try {
            const res = await apiSearchReindex({
                projectId,
                // Полный набор == реиндекс без фильтра; частичный уходит
                // query-параметром `entityTypes` (см. apiSearchReindex).
                ...(entityTypes &&
                entityTypes.length > 0 &&
                entityTypes.length < ALL_TYPES.length
                    ? { entityTypes }
                    : {}),
            })
            if (res.truncated) {
                // TODO-256: проход НЕПОЛНЫЙ — обрезан бюджетом
                // SEARCH_REINDEX_MAX_DOCS либо потерян лок. Домен в этом случае
                // не штампует backfilledAt, т.е. индекс заведомо неполный, и
                // зелёный тост тут врал бы админу: часть записей не найдётся.
                toast.push(
                    <Notification type="warning" title="Реиндексация неполная">
                        Обработано записей: {res.indexed_count}.{' '}
                        {res.skipped_types?.length
                            ? `Не достроены типы: ${formatSkippedTypes(res.skipped_types)}. `
                            : ''}
                        Повторите перестройку.
                    </Notification>,
                )
            } else {
                // ST-29: success
                toast.push(
                    <Notification
                        type="success"
                        title="Реиндексация"
                        {...qa('search.settings.toast.reindexOk')}
                    >
                        Запущена. Обработано записей: {res.indexed_count}.
                    </Notification>,
                )
            }
            await mutate()
        } catch (e) {
            // ST-7 / ST-24: занято (lock) / отказ
            toast.push(
                <Notification type="danger" title="Не удалось">
                    {errMessage(e, 'Реиндексация не запущена')}{' '}
                    {errCode(e) ? `(${errCode(e)})` : ''}
                </Notification>,
            )
        } finally {
            setReindexing(false)
        }
    }, [projectId, mutate, entityTypes])

    const slaBreached =
        data?.lagMs != null &&
        data?.freshnessSlaMs != null &&
        data.lagMs > data.freshnessSlaMs

    return (
        <Card {...qa('search.settings.status')}>
            <div className="flex items-center justify-between mb-4">
                <h5>Состояние индекса</h5>
                {canReindex && (
                    <div className="flex items-center gap-2">
                        {/* ST-30: реиндекс возьмёт СОХРАНЁННЫЙ набор типов. */}
                        {dirtyTypes && (
                            <span
                                className="text-xs text-amber-500"
                                {...qa('search.settings.reindexBlocked')}
                            >
                                Сначала сохраните настройки
                            </span>
                        )}
                        <Button
                            size="sm"
                            icon={<PiArrowsClockwiseDuotone />}
                            loading={reindexing}
                            disabled={dirtyTypes}
                            onClick={onReindex}
                            {...qa('search.settings.reindex')}
                        >
                            Переиндексировать
                        </Button>
                    </div>
                )}
            </div>

            {/* ST-1: загрузка статуса */}
            {isLoading && !data ? (
                <Skeleton height={80} />
            ) : error && !data ? (
                // ST-6: ошибка статуса (деградация секции, форма выше работает)
                <ErrorState
                    message={errMessage(error, 'Статус индекса недоступен')}
                    code={errCode(error)}
                    onRetry={() => mutate()}
                    qaId="search.settings.statusError"
                    retryQaId="search.settings.statusRetry"
                />
            ) : data ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Metric
                        label="Документов в индексе"
                        value={String(data.indexedCount ?? 0)}
                        qaId="search.settings.status.indexedCount"
                    />
                    <Metric
                        label="Обработано до"
                        value={
                            data.lastEventProcessedAt
                                ? dayjs(data.lastEventProcessedAt).format(
                                      'DD.MM HH:mm',
                                  )
                                : '—'
                        }
                        qaId="search.settings.status.lastEvent"
                    />
                    <Metric
                        label="Отставание"
                        value={
                            data.lagMs != null
                                ? `${Math.round(data.lagMs / 1000)} с`
                                : '—'
                        }
                        alert={slaBreached}
                        qaId="search.settings.status.lagMs"
                    />
                    <Metric
                        label="SLA свежести"
                        value={
                            data.freshnessSlaMs != null
                                ? `${Math.round(data.freshnessSlaMs / 1000)} с`
                                : '—'
                        }
                        qaId="search.settings.status.freshnessSla"
                    />

                    {/* ST-3: пустой индекс */}
                    {data.indexedCount === 0 && (
                        <div
                            className="col-span-full text-sm text-gray-400"
                            {...qa('search.settings.status.emptyIndex')}
                        >
                            Индекс пуст — запустите реиндексацию.
                        </div>
                    )}

                    {/* ST-18/ST-28: алерт лага */}
                    {slaBreached && (
                        <div className="col-span-full flex items-center gap-2 text-sm text-amber-600">
                            <PiWarningCircleDuotone />
                            Индекс отстаёт сильнее ожидаемого. Возможна
                            приостановка дельта-индексации — запустите
                            реиндексацию.
                        </div>
                    )}
                    {!slaBreached && data.lagMs != null && (
                        <div className="col-span-full flex items-center gap-2 text-sm text-emerald-600">
                            <PiCheckCircleDuotone />
                            Индекс в пределах SLA свежести.
                        </div>
                    )}
                    {typeof data.deadLetterCount === 'number' &&
                        data.deadLetterCount > 0 && (
                            <div className="col-span-full">
                                <Tag className="bg-red-100 text-red-600">
                                    Необработанных событий:{' '}
                                    {data.deadLetterCount}
                                </Tag>
                            </div>
                        )}
                </div>
            ) : null}
        </Card>
    )
}

const Metric = ({
    label,
    value,
    alert,
    qaId,
}: {
    label: string
    value: string
    alert?: boolean
    qaId?: string
}) => (
    <div {...(qaId ? qa(qaId) : {})}>
        <div className="text-xs text-gray-400">{label}</div>
        <div
            className={`text-lg font-semibold ${
                alert ? 'text-amber-600' : 'text-gray-700 dark:text-gray-200'
            }`}
        >
            {value}
        </div>
    </div>
)

export default SearchSettingsTab
