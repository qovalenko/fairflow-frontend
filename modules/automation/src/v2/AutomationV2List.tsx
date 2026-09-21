import { useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiPlusDuotone,
    PiTreeStructureDuotone,
    PiMagnifyingGlassDuotone,
    PiLightningDuotone,
    PiListDuotone,
} from 'react-icons/pi'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import toast from '@/components/ui/toast'
import {
    apiListRules,
    apiSetRuleEnabled,
    ruleStateView,
    type AutomationRule,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    FreshnessLabel,
    errMessage,
} from '../shared'
import { qa } from '../qa'

const PAGE_SIZE = 25

const stateFilterOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'enabled', label: 'Включено' },
    { value: 'disabled', label: 'Выключено' },
    { value: 'frozen', label: 'Заморожено' },
]

const engineFilterOptions = [
    { value: '', label: 'Все сценарии' },
    { value: 'v2', label: 'Только v2 (граф)' },
]

/**
 * AutomationV2List — точка входа «Автоматизация v2» (T-020).
 * Список правил/сценариев; конструктор (канва) открывается по «Создать» или
 * клику на правило. Ранее /automation/v2 сразу открывал WorkflowEditor.
 *
 * Данные — общий эндпоинт `GET /v1/automation/rules` (apiListRules). Признак v2 —
 * `engineVersion === 2`. Серверный фильтр `engineVersion=2` (FR-AUTOM-540).
 */
export default function AutomationV2List() {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('automation', 'read')
    const canWrite = can('automation', 'write')
    const canManage = can('automation', 'manage')

    const [search, setSearch] = useState('')
    const [stateFilter, setStateFilter] = useState('')
    const [engineFilter, setEngineFilter] = useState('')
    const [pageIndex, setPageIndex] = useState(0)
    const [pendingToggle, setPendingToggle] = useState<string | null>(null)

    const swrKey =
        pid && canRead
            ? ['/automation/rules/v2-list', pid, { search, stateFilter, engineFilter, pageIndex }]
            : null

    const { data, isLoading, error, isValidating } = useSWR(
        swrKey,
        () =>
            apiListRules({
                projectId: pid!,
                query: search || undefined,
                state: (stateFilter || undefined) as never,
                engineVersion: engineFilter === 'v2' ? 2 : undefined,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const rules = data?.list ?? []
    const total = data?.total ?? 0
    const hasActiveFilter = !!search || !!stateFilter || !!engineFilter

    const refresh = () =>
        mutate((key) => Array.isArray(key) && key[0] === '/automation/rules/v2-list')

    const resetFilters = () => {
        setSearch('')
        setStateFilter('')
        setEngineFilter('')
        setPageIndex(0)
    }

    // Toggle вкл/выкл — optimistic + откат при ошибке.
    const handleToggle = async (rule: AutomationRule) => {
        if (!pid) return
        const next = !rule.enabled
        setPendingToggle(rule.id)
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
            mutate(swrKey)
            toast.push(errMessage(e, 'Не удалось изменить состояние правила'))
        } finally {
            setPendingToggle(null)
        }
    }

    // ST-19/20: проект не выбран
    if (!pid) return <NoProjectState />
    // ST-10: нет права на раздел
    if (!canRead)
        return <NoPermissionState message="Нет права automation:read." />

    const renderBody = () => {
        // ST-1: первичная загрузка
        if (isLoading) {
            return (
                <div className="flex flex-col gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={88} className="rounded-lg" />
                    ))}
                </div>
            )
        }
        // ST-6: ошибка загрузки
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить сценарии')}
                    onRetry={() => mutate(swrKey)}
                />
            )
        }
        // ST-4: пусто по фильтру
        if (rules.length === 0 && hasActiveFilter) {
            return (
                <div className="text-center py-12" {...qa('automation.v2list.emptyFilter')}>
                    <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Ничего не найдено.</p>
                    <Button variant="plain" onClick={resetFilters} {...qa('automation.v2list.resetFilters')}>
                        Сбросить фильтры
                    </Button>
                </div>
            )
        }
        // ST-3: совсем пусто
        if (rules.length === 0) {
            return (
                <AdaptiveCard>
                    <div className="text-center py-12" {...qa('automation.v2list.empty')}>
                        <PiTreeStructureDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Ещё нет сценариев автоматизации.
                        </p>
                        <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                            Соберите сценарий в визуальном редакторе: триггер,
                            условия, ветвления и действия на одной канве.
                        </p>
                        {canWrite && (
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiPlusDuotone />}
                                onClick={() => navigate('/automation/v2/new')}
                                {...qa('automation.v2list.createFirst')}
                            >
                                Создать сценарий
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
                    <div className="absolute right-2 -top-6 text-xs text-gray-400">
                        Обновление…
                    </div>
                )}
                {rules.map((rule) => {
                    const view = ruleStateView(rule)
                    const frozen = rule.state === 'frozen'
                    const isV2 = rule.engineVersion === 2
                    const toggleDisabled =
                        frozen ||
                        !!rule.unexecutable ||
                        !(canManage || canWrite) ||
                        pendingToggle === rule.id
                    return (
                        <Card key={rule.id} {...qa('automation.v2list.card', { rule: rule.id })}>
                            <div className="flex items-start gap-4">
                                <div className="pt-1">
                                    <Switcher
                                        checked={rule.enabled}
                                        disabled={toggleDisabled}
                                        onChange={() => handleToggle(rule)}
                                        {...qa('automation.v2list.toggle', { rule: rule.id })}
                                    />
                                </div>
                                <div
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() =>
                                        navigate(`/automation/v2/${rule.id}`)
                                    }
                                >
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <h5
                                            className={`font-semibold hover:text-blue-600 ${
                                                !rule.enabled
                                                    ? 'text-gray-400'
                                                    : 'heading-text'
                                            }`}
                                        >
                                            {rule.name}
                                        </h5>
                                        <Tag className={view.color}>
                                            {view.label}
                                        </Tag>
                                        <Tag
                                            className={
                                                isV2
                                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                            }
                                        >
                                            {isV2 ? 'Граф v2' : 'Классическое'}
                                        </Tag>
                                        {pendingToggle === rule.id && (
                                            <span className="text-xs text-gray-400">
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
                                                    rule.triggerType ??
                                                    '—'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">
                                                Изменено:{' '}
                                            </span>
                                            <span className="text-gray-700 dark:text-gray-300">
                                                {rule.updatedAt
                                                    ? dayjs
                                                          .unix(rule.updatedAt)
                                                          .format(
                                                              'DD.MM.YYYY HH:mm',
                                                          )
                                                    : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<PiTreeStructureDuotone />}
                                        onClick={() =>
                                            navigate(
                                                `/automation/v2/${rule.id}`,
                                            )
                                        }
                                        {...qa('automation.v2list.open', { rule: rule.id })}
                                    >
                                        Открыть
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )
                })}

                {!hasActiveFilter && total > PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-2" {...qa('automation.v2list.pagination')}>
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
                                {...qa('automation.v2list.pagePrev')}
                            >
                                Назад
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                disabled={(pageIndex + 1) * PAGE_SIZE >= total}
                                onClick={() => setPageIndex((p) => p + 1)}
                                {...qa('automation.v2list.pageNext')}
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
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <PiTreeStructureDuotone className="w-6 h-6 text-indigo-500" />
                    <h3 className="text-2xl font-bold" {...qa('automation.v2list.title')}>
                        Автоматизация v2
                    </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant="default"
                        icon={<PiListDuotone />}
                        onClick={() => navigate('/automation')}
                    >
                        Классический список
                    </Button>
                    {/* Создать — открывает конструктор (канву) */}
                    {canWrite && (
                        <Button
                            variant="solid"
                            color="primary"
                            icon={<PiPlusDuotone />}
                            onClick={() => navigate('/automation/v2/new')}
                            {...qa('automation.v2list.create')}
                        >
                            Создать сценарий
                        </Button>
                    )}
                </div>
            </div>

            {/* Поиск + фильтры */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 min-w-48">
                    <Input
                        placeholder="Поиск по имени сценария…"
                        prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPageIndex(0)
                        }}
                        {...qa('automation.v2list.search')}
                    />
                </div>
                <div className="w-48" {...qa('automation.v2list.stateFilter')}>
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
                <div className="w-48" {...qa('automation.v2list.engineFilter')}>
                    <Select
                        options={engineFilterOptions}
                        value={
                            engineFilterOptions.find(
                                (o) => o.value === engineFilter,
                            ) || engineFilterOptions[0]
                        }
                        onChange={(opt) => {
                            setEngineFilter(opt?.value || '')
                            setPageIndex(0)
                        }}
                        placeholder="Тип"
                    />
                </div>
            </div>

            {rules.length > 0 && (
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <PiLightningDuotone /> Клик по сценарию открывает
                        визуальный редактор.
                    </span>
                    <FreshnessLabel />
                </div>
            )}

            {renderBody()}
        </div>
    )
}
