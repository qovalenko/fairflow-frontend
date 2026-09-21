import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiPlusDuotone,
    PiPencilDuotone,
    PiLightningDuotone,
    PiMagnifyingGlassDuotone,
    PiTrashDuotone,
    PiPlayDuotone,
    PiPlugsConnectedDuotone,
    PiQueueDuotone,
    PiWarningDuotone,
    PiTreeStructureDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiListRules,
    apiSetRuleEnabled,
    apiDeleteRule,
    apiManualRun,
    ruleStateView,
    SKIP_REASON_LABEL,
    type AutomationRule,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    FreshnessLabel,
    ReadOnlyBanner,
    errMessage,
} from './shared'
import { qa } from './qa'

const PAGE_SIZE = 25

const stateFilterOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'enabled', label: 'Включено' },
    { value: 'disabled', label: 'Выключено' },
    { value: 'frozen', label: 'Заморожено' },
]

const AutomationList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('automation', 'read')
    const canWrite = can('automation', 'write')
    const canManage = can('automation', 'manage')
    const canExecute = can('automation', 'execute')

    const [search, setSearch] = useState('')
    const [stateFilter, setStateFilter] = useState('')
    const [pageIndex, setPageIndex] = useState(0)

    const [pendingToggle, setPendingToggle] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [manualTarget, setManualTarget] = useState<AutomationRule | null>(null)
    const [manualEntityId, setManualEntityId] = useState('')
    const [manualRunning, setManualRunning] = useState(false)

    const swrKey =
        pid && canRead
            ? ['/automation/rules', pid, { search, stateFilter, pageIndex }]
            : null

    const { data, isLoading, error, isValidating } = useSWR(
        swrKey,
        () =>
            apiListRules({
                projectId: pid!,
                query: search || undefined,
                state: (stateFilter || undefined) as never,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const rules = data?.list ?? []
    const total = data?.total ?? 0
    const enabledCount = rules.filter((r) => r.enabled).length
    const hasActiveFilter = !!search || !!stateFilter

    const refresh = () =>
        mutate((key) => Array.isArray(key) && key[0] === '/automation/rules')

    const resetFilters = () => {
        setSearch('')
        setStateFilter('')
        setPageIndex(0)
    }

    // FLOW-AUTOMATION-TOGGLE — optimistic + откат при ошибке (T1..T5)
    const handleToggle = async (rule: AutomationRule) => {
        if (!pid) return
        const next = !rule.enabled
        setPendingToggle(rule.id)
        // optimistic (ST-29)
        mutate(
            swrKey,
            (cur: typeof data) =>
                cur && {
                    ...cur,
                    list: cur.list.map((r) =>
                        r.id === rule.id ? { ...r, enabled: next } : r,
                    ),
                },
            false,
        )
        try {
            await apiSetRuleEnabled(rule.id, next, { projectId: pid })
            refresh()
        } catch (e) {
            // ST-7: откат optimistic
            mutate(swrKey)
            toast.push(errMessage(e, 'Не удалось изменить состояние правила'))
        } finally {
            setPendingToggle(null)
        }
    }

    // FLOW-AUTOMATION-DELETE (soft)
    const confirmDelete = async () => {
        if (!deleteTarget || !pid) return
        setDeleting(true)
        try {
            await apiDeleteRule(deleteTarget.id, { projectId: pid })
            toast.push('Правило удалено')
            setDeleteTarget(null)
            refresh()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить правило'))
        } finally {
            setDeleting(false)
        }
    }

    // FLOW-AUTOMATION-MANUAL-RUN
    const confirmManualRun = async () => {
        if (!manualTarget || !pid || !manualEntityId.trim()) return
        setManualRunning(true)
        try {
            const res = await apiManualRun(
                manualTarget.id,
                { entityId: manualEntityId.trim() },
                { projectId: pid },
            )
            if (res.status === 'skipped') {
                toast.push('Условия не выполнены — действия не запущены')
            } else {
                toast.push('Правило запущено')
            }
            setManualTarget(null)
            setManualEntityId('')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось запустить правило'))
        } finally {
            setManualRunning(false)
        }
    }

    // ST-19/20: проект не выбран
    if (!pid) {
        return (
            <Container>
                <NoProjectState />
            </Container>
        )
    }

    // ST-10: нет права на раздел
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права automation:read." />
            </Container>
        )
    }

    const renderBody = () => {
        // ST-1: первичная загрузка
        if (isLoading) {
            return (
                <div className="flex flex-col gap-3" {...qa('automation.list.skeleton')}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={96} className="rounded-lg" />
                    ))}
                </div>
            )
        }
        // ST-6: ошибка загрузки
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить правила')}
                    onRetry={() => mutate(swrKey)}
                />
            )
        }
        // ST-4: пусто по фильтру
        if (rules.length === 0 && hasActiveFilter) {
            return (
                <div className="text-center py-12" {...qa('automation.list.emptyFilter')}>
                    <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Ничего не найдено.</p>
                    <Button variant="plain" onClick={resetFilters} {...qa('automation.list.resetFilters')}>
                        Сбросить фильтры
                    </Button>
                </div>
            )
        }
        // ST-3: совсем пусто (FLOW-AUTOMATION-ONBOARDING)
        if (rules.length === 0) {
            return (
                <AdaptiveCard>
                    <div className="text-center py-12" {...qa('automation.list.empty')}>
                        <PiLightningDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Автоматизируйте рутинные действия.
                        </p>
                        <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                            Создавайте правила для автоматического выполнения
                            действий при наступлении событий в CRM.
                        </p>
                        {canWrite && (
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiPlusDuotone />}
                                onClick={() => navigate('/automation/new')}
                                {...qa('automation.list.createFirst')}
                            >
                                Создать первое правило
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>
            )
        }
        return (
            <div className="relative space-y-3">
                {/* ST-2: фоновая загрузка */}
                {isValidating && !isLoading && (
                    <div
                        className="absolute right-2 -top-6 text-xs text-gray-400"
                        {...qa('automation.list.validating')}
                    >
                        Обновление…
                    </div>
                )}
                {rules.map((rule) => {
                    const view = ruleStateView(rule)
                    const frozen = rule.state === 'frozen'
                    const toggleDisabled =
                        frozen ||
                        !!rule.unexecutable ||
                        // ST-12: тоггл — manage, либо write над своим (FR-MAUT-25)
                        !(canManage || canWrite) ||
                        pendingToggle === rule.id
                    return (
                        <Card key={rule.id} {...qa('automation.list.card', { rule: rule.id, state: rule.state })}>
                            <div className="flex items-start gap-4">
                                <div className="pt-1">
                                    <Switcher
                                        checked={rule.enabled}
                                        disabled={toggleDisabled}
                                        onChange={() => handleToggle(rule)}
                                        {...qa('automation.list.toggle', { rule: rule.id })}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h5
                                            className={`font-semibold cursor-pointer hover:text-blue-600 ${
                                                !rule.enabled
                                                    ? 'text-gray-400'
                                                    : 'heading-text'
                                            }`}
                                            onClick={() =>
                                                navigate(
                                                    `/automation/${rule.id}/edit`,
                                                )
                                            }
                                            {...qa('automation.list.title', { rule: rule.id })}
                                        >
                                            {rule.name}
                                        </h5>
                                        <Tag className={view.color} {...qa('automation.list.statusTag', { rule: rule.id })}>
                                            {view.label}
                                        </Tag>
                                        {/* EL-LIST-9a: причина disabled */}
                                        {!rule.enabled && rule.skipReason && (
                                            <Tooltip
                                                title={
                                                    SKIP_REASON_LABEL[
                                                        rule.skipReason
                                                    ] ?? rule.skipReason
                                                }
                                            >
                                                <PiWarningDuotone
                                                    className="w-4 h-4 text-amber-500"
                                                    {...qa('automation.list.skipReason', { rule: rule.id })}
                                                />
                                            </Tooltip>
                                        )}
                                        {pendingToggle === rule.id && (
                                            <span
                                                className="text-xs text-gray-400"
                                                {...qa('automation.list.togglePending', { rule: rule.id })}
                                            >
                                                применяется…
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-2">
                                        <div>
                                            <span className="text-gray-500">
                                                Триггер:{' '}
                                            </span>
                                            <span className="text-gray-700 dark:text-gray-300">
                                                {rule.triggerDescription ??
                                                    rule.triggerType}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">
                                                Действие:{' '}
                                            </span>
                                            <span className="text-gray-700 dark:text-gray-300">
                                                {rule.actionDescription ?? '—'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* EL-LIST-11: охват (stats) — ST-28 свежесть */}
                                    <div
                                        className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap"
                                        {...qa('automation.list.stats', { rule: rule.id })}
                                    >
                                        <span>
                                            Сработало (30д):{' '}
                                            {rule.stats?.executed30d ?? 0}
                                        </span>
                                        <span>
                                            Совпало (30д):{' '}
                                            {rule.stats?.matched30d ?? 0}
                                        </span>
                                        {rule.lastExecutedAt && (
                                            <span>
                                                Последнее:{' '}
                                                {dayjs(
                                                    rule.lastExecutedAt,
                                                ).format('DD.MM.YYYY HH:mm')}
                                            </span>
                                        )}
                                        {rule.stats?.lastError && (
                                            <span className="text-red-500">
                                                Ошибка: {rule.stats.lastError}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {/* EL-LIST-17: запустить вручную */}
                                    {canExecute && !frozen && (
                                        <Tooltip title="Запустить вручную">
                                            <button
                                                type="button"
                                                aria-label="Запустить вручную"
                                                title="Запустить вручную"
                                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                onClick={() => {
                                                    setManualTarget(rule)
                                                    setManualEntityId('')
                                                }}
                                                {...qa('automation.list.manualRun', { rule: rule.id })}
                                            >
                                                <PiPlayDuotone className="w-4 h-4" />
                                            </button>
                                        </Tooltip>
                                    )}
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<PiPencilDuotone />}
                                        onClick={() =>
                                            navigate(
                                                `/automation/${rule.id}/edit`,
                                            )
                                        }
                                        {...qa('automation.list.edit', { rule: rule.id })}
                                    >
                                        Редактировать
                                    </Button>
                                    {/* automation-v2: открыть в канве */}
                                    <Tooltip title="Открыть в редакторе v2">
                                        <button
                                            type="button"
                                            aria-label="Открыть в редакторе v2"
                                            title="Открыть в редакторе v2"
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            onClick={() =>
                                                navigate(
                                                    `/automation/v2/${rule.id}`,
                                                )
                                            }
                                            {...qa('automation.list.openV2', { rule: rule.id })}
                                        >
                                            <PiTreeStructureDuotone className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                    {/* EL-LIST-18: удалить (manage, либо self+write) */}
                                    {(canManage || canWrite) && !frozen && (
                                        <Tooltip title="Удалить">
                                            <button
                                                type="button"
                                                aria-label="Удалить правило"
                                                title="Удалить правило"
                                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500"
                                                onClick={() =>
                                                    setDeleteTarget(rule)
                                                }
                                                {...qa('automation.list.delete', { rule: rule.id })}
                                            >
                                                <PiTrashDuotone className="w-4 h-4" />
                                            </button>
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )
                })}

                {total > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-2" {...qa('automation.list.pagination')}>
                        <span className="text-sm text-gray-400">
                            {pageIndex * PAGE_SIZE + 1}–
                            {Math.min((pageIndex + 1) * PAGE_SIZE, total)} из{' '}
                            {total}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="default"
                                disabled={pageIndex === 0}
                                onClick={() => setPageIndex((p) => p - 1)}
                                {...qa('automation.list.pagePrev')}
                            >
                                Назад
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                disabled={
                                    (pageIndex + 1) * PAGE_SIZE >= total
                                }
                                onClick={() => setPageIndex((p) => p + 1)}
                                {...qa('automation.list.pageNext')}
                            >
                                Вперёд
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <h3 className="text-2xl font-bold" {...qa('automation.list.title')}>
                            Автоматизация
                        </h3>
                        <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {enabledCount} включено
                        </Tag>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* EL-LIST-14/15/16: под-экраны */}
                        {canManage && (
                            <>
                                <Link
                                    to="/automation/connections"
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    {...qa('automation.list.navConnections')}
                                >
                                    <PiPlugsConnectedDuotone /> Connections
                                </Link>
                                <Link
                                    to="/automation/dlq"
                                    className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    {...qa('automation.list.navDlq')}
                                >
                                    <PiQueueDuotone /> Приостановленные
                                </Link>
                            </>
                        )}
                        <Link
                            to="/automation/problems"
                            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            {...qa('automation.list.navProblems')}
                        >
                            <PiWarningDuotone /> Проблемы
                        </Link>
                        {/* automation-v2: визуальный редактор (канва) */}
                        <Link
                            to="/automation/v2/new"
                            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            {...qa('automation.list.navEditorV2')}
                        >
                            <PiTreeStructureDuotone /> Редактор v2
                        </Link>
                        {/* EL-LIST-3: создать */}
                        {canWrite && (
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiPlusDuotone />}
                                onClick={() => navigate('/automation/new')}
                                {...qa('automation.list.create')}
                            >
                                Правило
                            </Button>
                        )}
                    </div>
                </div>

                {/* EL-LIST-5 / EL-LIST-6: поиск + фильтры */}
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1 min-w-48">
                        <Input
                            placeholder="Поиск по имени правила…"
                            prefix={
                                <PiMagnifyingGlassDuotone className="w-4 h-4" />
                            }
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value)
                                setPageIndex(0)
                            }}
                            {...qa('automation.list.search')}
                        />
                    </div>
                    <div className="w-48" {...qa('automation.list.stateFilter')}>
                        <Select
                            options={stateFilterOptions}
                            value={
                                stateFilterOptions.find(
                                    (o) => o.value === stateFilter,
                                ) || stateFilterOptions[0]
                            }
                            onChange={(opt) => {
                                setStateFilter(opt?.value || '')
                                setPageIndex(0)
                            }}
                            placeholder="Статус"
                        />
                    </div>
                </div>

                {rules.length > 0 && (
                    <div className="flex items-center justify-end">
                        <FreshnessLabel />
                    </div>
                )}

                {renderBody()}
            </div>

            {/* ST-7: confirm удаления */}
            <Dialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
            >
                <div {...qa('automation.list.deleteDialog')}>
                <h5 className="mb-2">Удалить правило?</h5>
                <p className="text-sm text-gray-500 mb-6">
                    Правило «{deleteTarget?.name}» будет удалено. Данные
                    выполнений сохранятся.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="plain" onClick={() => setDeleteTarget(null)} {...qa('automation.list.deleteCancel')}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        loading={deleting}
                        onClick={confirmDelete}
                        {...qa('automation.list.deleteConfirm')}
                    >
                        Удалить
                    </Button>
                </div>
                </div>
            </Dialog>

            {/* FLOW-AUTOMATION-MANUAL-RUN: overlay выбора записи */}
            <Dialog
                isOpen={!!manualTarget}
                onClose={() => setManualTarget(null)}
                onRequestClose={() => setManualTarget(null)}
            >
                <div {...qa('automation.list.manualRunDialog')}>
                <h5 className="mb-2">Запустить правило вручную</h5>
                <p className="text-sm text-gray-500 mb-4">
                    «{manualTarget?.name}» будет прогнано на текущем состоянии
                    указанной записи.
                </p>
                <Input
                    placeholder="ID записи (например, deal_9)"
                    value={manualEntityId}
                    onChange={(e) => setManualEntityId(e.target.value)}
                    className="mb-6"
                    {...qa('automation.list.manualRunEntityId')}
                />
                <div className="flex justify-end gap-2">
                    <Button variant="plain" onClick={() => setManualTarget(null)} {...qa('automation.list.manualRunCancel')}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={manualRunning}
                        disabled={!manualEntityId.trim()}
                        onClick={confirmManualRun}
                        {...qa('automation.list.manualRunSubmit')}
                    >
                        Запустить
                    </Button>
                </div>
                </div>
            </Dialog>
        </Container>
    )
}

export default AutomationList
