import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import useSWR from 'swr'
import { PiArrowLeftDuotone, PiChartBarDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import {
    apiCreateReport,
    apiGetReport,
    apiUpdateReport,
    type ReportSpecInput,
    type ReportVisibility,
    type VizType,
} from '@/services/ReportsService'
import { NoPermissionState, errMessage } from './shared'
import { qa } from './qa'

const allEntityOptions = [
    { value: 'deals', label: 'Сделки', module: 'deals' },
    { value: 'contacts', label: 'Контакты', module: 'contacts' },
    { value: 'orders', label: 'Продажи', module: 'orders' },
    { value: 'activities', label: 'Активности', module: 'activities' },
]

const metricOptions = [
    { value: 'count', label: 'Количество' },
    { value: 'sum', label: 'Сумма' },
    { value: 'avg', label: 'Среднее' },
    { value: 'min', label: 'Минимум' },
    { value: 'max', label: 'Максимум' },
]

const dealFieldOptions = [
    { value: 'amount', label: 'Сумма сделки' },
    { value: 'count', label: 'Количество сделок' },
]

const groupByOptions = [
    { value: 'month', label: 'По месяцам' },
    { value: 'manager', label: 'По менеджерам' },
    { value: 'stage', label: 'По стадиям' },
    { value: 'source', label: 'По источникам' },
    { value: 'type', label: 'По типам' },
]

const operatorOptions = [
    { value: 'eq', label: '=' },
    { value: 'ne', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'lt', label: '<' },
    { value: 'contains', label: 'содержит' },
]

const visualizationOptions = [
    { value: 'bar', label: 'Столбцы' },
    { value: 'line', label: 'Линия' },
    { value: 'pie', label: 'Круговая' },
    { value: 'table', label: 'Таблица' },
]

const ReportBuilder = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const editId = searchParams.get('edit')?.trim() || ''
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canManage = can('reports', 'manage')

    const currentProject = useProjectStore((s) => s.currentProject)
    const enabledModules = useMemo(
        () => getEnabledModules(currentProject),
        [currentProject],
    )
    // EL-BUILD-2 / ST-17: сущности-источники только из включённых модулей.
    const entityOptions = useMemo(
        () => allEntityOptions.filter((o) => enabledModules.includes(o.module)),
        [enabledModules],
    )

    const [entity, setEntity] = useState(entityOptions[0]?.value ?? 'deals')
    const [metric, setMetric] = useState('count')
    const [metricField, setMetricField] = useState('amount')
    const [groupBy, setGroupBy] = useState('month')
    const [dateFrom, setDateFrom] = useState('2025-01-01')
    const [dateTo, setDateTo] = useState('2025-06-30')
    const [visualization, setVisualization] = useState<
        'bar' | 'line' | 'pie' | 'table'
    >('bar')
    const [filters, setFilters] = useState<
        { field: string; operator: string; value: string }[]
    >([])
    const [saveDialogOpen, setSaveDialogOpen] = useState(false)
    const [reportName, setReportName] = useState('')
    // TODO-466: описание — это описание. Раньше сюда писался выбор
    // радиокнопки ('Личный'/'Проектный'), потому что уровня доступа не было ни
    // в контракте, ни в домене: «личный» отчёт видел весь проект.
    const [reportDescription, setReportDescription] = useState('')
    const [reportAccess, setReportAccess] = useState<ReportVisibility>(
        'personal'
    )
    const [nameError, setNameError] = useState('')
    const [saving, setSaving] = useState(false)
    // ST-30 dirty-state: любое изменение spec помечает форму грязной.
    const [dirty, setDirty] = useState(false)

    const { data: editingReport, isLoading: editingLoading } = useSWR(
        pid && editId ? ['/reports/edit', pid, editId] : null,
        () => apiGetReport(editId, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    // TODO-474: загрузка custom-отчёта для редактирования (?edit=<id>).
    useEffect(() => {
        if (!editingReport) return
        setReportName(editingReport.name)
        setReportDescription(editingReport.description ?? '')
        setReportAccess(editingReport.visibility ?? 'personal')
        const spec = editingReport.spec
        if (spec?.entity) setEntity(String(spec.entity))
        const measure = spec?.measures?.[0]
        if (measure?.fn) setMetric(measure.fn)
        if (measure?.field) setMetricField(measure.field)
        if (spec?.groupBy?.[0]?.field) setGroupBy(spec.groupBy[0].field)
        if (spec?.dateRange?.from) {
            setDateFrom(new Date(spec.dateRange.from).toISOString().slice(0, 10))
        }
        if (spec?.dateRange?.to) {
            setDateTo(new Date(spec.dateRange.to).toISOString().slice(0, 10))
        }
        if (spec?.viz?.type) setVisualization(spec.viz.type as 'bar' | 'line' | 'pie' | 'table')
        if (spec?.filters?.length) {
            setFilters(
                spec.filters.map((f) => ({
                    field: f.field,
                    operator: f.operator,
                    value: String(f.value ?? ''),
                })),
            )
        }
        setDirty(false)
    }, [editingReport])

    // ST-10/11: route-guard reports:manage.
    if (!canManage) {
        return (
            <Container>
                <NoPermissionState message="Нет права reports:manage — конструктор недоступен." />
            </Container>
        )
    }

    if (editId && editingLoading) {
        return (
            <Container>
                <AdaptiveCard className="p-6 text-sm text-gray-500">Загрузка отчёта…</AdaptiveCard>
            </Container>
        )
    }

    const goBack = () => {
        // ST-20/30 dirty-guard перед уходом.
        if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Выйти?')) {
            return
        }
        navigate('/reports')
    }

    const addFilter = () => {
        setDirty(true)
        setFilters((prev) => [
            ...prev,
            { field: 'stage', operator: 'eq', value: '' },
        ])
    }

    const removeFilter = (index: number) => {
        setDirty(true)
        setFilters((prev) => prev.filter((_, i) => i !== index))
    }

    // EL-BUILD-12 → POST /api/reports (FR-MREP-28/29). ST-7: inline-валидация + код.
    const handleSaveReport = async () => {
        const name = reportName.trim()
        if (!name) {
            setNameError('Введите название отчёта')
            return
        }
        if (!pid) {
            toast.push('Проект не выбран')
            return
        }
        const spec: ReportSpecInput = {
            entity,
            measures: [
                {
                    fn: metric,
                    field: metric === 'count' ? undefined : metricField,
                    alias: metric,
                },
            ],
            groupBy: [{ field: groupBy }],
            filters: filters
                .filter((f) => f.field && f.value)
                .map((f) => ({ field: f.field, operator: f.operator, value: f.value })),
            dateRange: {
                kind: 'custom',
                from: dateFrom ? new Date(dateFrom).getTime() : undefined,
                to: dateTo ? new Date(dateTo).getTime() : undefined,
            },
            viz: { type: visualization as VizType },
        }
        setSaving(true)
        try {
            if (editId) {
                await apiUpdateReport(
                    editId,
                    {
                        name,
                        description: reportDescription.trim(),
                        spec,
                        visibility: reportAccess,
                    },
                    { projectId: pid },
                )
                toast.push('Отчёт обновлён')
                setDirty(false)
                setSaveDialogOpen(false)
                navigate(`/reports?custom=${encodeURIComponent(editId)}`)
            } else {
                const created = await apiCreateReport(
                    {
                        name,
                        description: reportDescription.trim(),
                        spec,
                        kind: 'custom',
                        visibility: reportAccess,
                    },
                    { projectId: pid },
                )
                toast.push('Отчёт сохранён')
                setDirty(false)
                setSaveDialogOpen(false)
                setReportName('')
                setReportDescription('')
                navigate(`/reports?custom=${created.id}`)
            }
        } catch (e) {
            toast.push(errMessage(e, editId ? 'Не удалось обновить отчёт' : 'Не удалось сохранить отчёт'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Container {...qa('reports.builder.root')}>
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-[350px] flex-shrink-0">
                    <AdaptiveCard>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    title="Назад к отчётам"
                                    {...qa('reports.builder.back')}
                                >
                                    <PiArrowLeftDuotone className="w-5 h-5" />
                                </button>
                                <h2 className="text-xl font-bold">
                                    {editId ? 'Редактирование отчёта' : 'Конструктор отчётов'}
                                </h2>
                            </div>
                            <Button
                                variant="solid"
                                size="sm"
                                onClick={() => {
                                    setNameError('')
                                    setSaveDialogOpen(true)
                                }}
                                {...qa('reports.builder.save')}
                            >
                                Сохранить отчёт
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Сущность
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {entityOptions.map((opt) => (
                                        <label
                                            key={opt.value}
                                            className="flex items-center gap-1.5"
                                            {...qa('reports.builder.entity', { entity: opt.value })}
                                        >
                                            <input
                                                type="radio"
                                                name="entity"
                                                checked={entity === opt.value}
                                                onChange={() => {
                                                    setEntity(opt.value)
                                                    setDirty(true)
                                                }}
                                            />
                                            <span>{opt.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Метрика
                                </label>
                                <div {...qa('reports.builder.metric')}>
                                    <Select<{ value: string; label: string }>
                                    options={metricOptions}
                                    value={
                                        metricOptions.find((o) => o.value === metric) ??
                                        null
                                    }
                                    onChange={(opt) => {
                                        setMetric(opt?.value ?? 'count')
                                        setDirty(true)
                                    }}
                                />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Поле для метрики
                                </label>
                                <Select<{ value: string; label: string }>
                                    options={dealFieldOptions}
                                    value={
                                        dealFieldOptions.find(
                                            (o) => o.value === metricField
                                        ) ?? null
                                    }
                                    onChange={(opt) => {
                                        setMetricField(opt?.value ?? 'amount')
                                        setDirty(true)
                                    }}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Группировка
                                </label>
                                <div {...qa('reports.builder.groupBy')}>
                                    <Select<{ value: string; label: string }>
                                    options={groupByOptions}
                                    value={
                                        groupByOptions.find((o) => o.value === groupBy) ??
                                        null
                                    }
                                    onChange={(opt) => {
                                        setGroupBy(opt?.value ?? 'month')
                                        setDirty(true)
                                    }}
                                />
                                </div>
                            </div>

                            <div className="pt-4 border-t">
                                <h3 className="font-semibold mb-3">Фильтры</h3>
                                <div className="space-y-2 mb-2">
                                    <div className="flex gap-2">
                                        <Input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="flex-1"
                                        />
                                        <Input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="flex-1"
                                        />
                                    </div>
                                    {filters.map((f, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-2"
                                            {...qa('reports.builder.filterRow', { index: idx })}
                                        >
                                            <Select<{ value: string; label: string }>
                                                options={[
                                                    { value: 'stage', label: 'Стадия' },
                                                    { value: 'manager', label: 'Менеджер' },
                                                ]}
                                                value={
                                                    [
                                                        { value: 'stage', label: 'Стадия' },
                                                        { value: 'manager', label: 'Менеджер' },
                                                    ].find((o) => o.value === f.field) ?? null
                                                }
                                                onChange={(opt) => {
                                                    const val = opt?.value ?? ''
                                                    setFilters((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx ? { ...p, field: val } : p
                                                        )
                                                    )
                                                }}
                                                className="flex-1"
                                            />
                                            <Select<{ value: string; label: string }>
                                                options={operatorOptions}
                                                value={
                                                    operatorOptions.find(
                                                        (o) => o.value === f.operator
                                                    ) ?? null
                                                }
                                                onChange={(opt) => {
                                                    const val = opt?.value ?? ''
                                                    setFilters((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx ? { ...p, operator: val } : p
                                                        )
                                                    )
                                                }}
                                                className="w-24"
                                            />
                                            <Input
                                                value={f.value}
                                                onChange={(e) => {
                                                    const val = e.target.value
                                                    setFilters((prev) =>
                                                        prev.map((p, i) =>
                                                            i === idx ? { ...p, value: val } : p
                                                        )
                                                    )
                                                }}
                                                className="flex-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeFilter(idx)}
                                                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-500"
                                                {...qa('reports.builder.filterRemove', { index: idx })}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <Button
                                    variant="plain"
                                    size="sm"
                                    onClick={addFilter}
                                    {...qa('reports.builder.filterAdd')}
                                >
                                    + Добавить фильтр
                                </Button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Визуализация
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {visualizationOptions.map((opt) => (
                                        <label
                                            key={opt.value}
                                            className="flex items-center gap-1.5"
                                        >
                                            <input
                                                type="radio"
                                                name="viz"
                                                checked={
                                                    visualization === opt.value
                                                }
                                                onChange={() => {
                                                    setVisualization(
                                                        opt.value as
                                                            | 'bar'
                                                            | 'line'
                                                            | 'pie'
                                                            | 'table'
                                                    )
                                                    setDirty(true)
                                                }}
                                            />
                                            <span>{opt.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </AdaptiveCard>
                </div>

                <div className="flex-1 min-w-0">
                    <AdaptiveCard>
                        <h3 className="font-semibold mb-4">Предпросмотр</h3>
                        {/* Прогон спеки доступен только для сохранённого отчёта
                            (POST /api/reports/:id/run). До сохранения показываем
                            честную подпись вместо выдуманных данных. */}
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-500 dark:text-gray-400" {...qa('reports.builder.preview')}>
                            <PiChartBarDuotone className="text-4xl opacity-60" />
                            <p className="text-sm">
                                Предпросмотр с данными появится после сохранения
                                отчёта.
                            </p>
                        </div>
                    </AdaptiveCard>
                </div>
            </div>

            <Dialog
                isOpen={saveDialogOpen}
                onClose={() => setSaveDialogOpen(false)}
                onRequestClose={() => setSaveDialogOpen(false)}
                {...qa('reports.builder.saveDialog')}
            >
                <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Сохранить отчёт</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Название отчёта
                            </label>
                            <Input
                                value={reportName}
                                onChange={(e) => {
                                    setReportName(e.target.value)
                                    if (nameError) setNameError('')
                                }}
                                placeholder="Введите название"
                                {...qa('reports.builder.name')}
                            />
                            {nameError && (
                                <p className="text-xs text-red-500 mt-1" {...qa('reports.builder.nameError')}>{nameError}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Описание
                            </label>
                            <Input
                                value={reportDescription}
                                onChange={(e) =>
                                    setReportDescription(e.target.value)
                                }
                                placeholder="Необязательно"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Доступ
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2" {...qa('reports.builder.accessPersonal')}>
                                    <input
                                        type="radio"
                                        checked={reportAccess === 'personal'}
                                        onChange={() =>
                                            setReportAccess('personal')
                                        }
                                    />
                                    <span>Личный</span>
                                </label>
                                <label className="flex items-center gap-2" {...qa('reports.builder.accessProject')}>
                                    <input
                                        type="radio"
                                        checked={reportAccess === 'project'}
                                        onChange={() =>
                                            setReportAccess('project')
                                        }
                                    />
                                    <span>Для всего проекта</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button
                                variant="plain"
                                onClick={() => setSaveDialogOpen(false)}
                                {...qa('reports.builder.cancel')}
                            >
                                Отмена
                            </Button>
                            <Button
                                variant="solid"
                                loading={saving}
                                onClick={handleSaveReport}
                                {...qa('reports.builder.submit')}
                            >
                                Сохранить
                            </Button>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Container>
    )
}

export default ReportBuilder
