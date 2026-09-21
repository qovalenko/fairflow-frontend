import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useVisibilityScope } from '@/utils/hooks/usePermissionStatus'
import useProjectMemberNames from '@/utils/hooks/useProjectMemberNames'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    apiGetProjectMembers,
    type ProjectMember,
} from '@/services/CrmService'
import {
    PiArrowLeftDuotone,
    PiDownloadDuotone,
    PiEyeDuotone,
    PiWarningDuotone,
    PiFileDuotone,
    PiMagnifyingGlassDuotone,
    PiUsersThreeDuotone,
    PiClipboardTextDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import type { ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import {
    apiListDocuments,
    apiListTemplates,
    contextRecordRoute,
    CONTEXT_LABELS,
    type DocumentGroup,
} from '@/services/DocumentsService'
import { NoPermissionState, ErrorState, errMessage } from '@/components/shared/documents/shared'
import { qa } from './qa'

const PAGE_SIZE = 25

/** Уровни видимости, при которых руководящий срез доступен (FR-MDOC-16/31). */
const DEPT_LEVELS = ['own_and_subordinates', 'own_and_department', 'all']

/**
 * SCR-DOCUMENTS-DEPT — сводный журнал документов отдела/региона.
 *
 * Управленческий срез: документы подчинённых/отдела в пределах visibility
 * руководителя + KPI-кластер + фильтры (менеджер, шаблон, период, drift,
 * пустые переменные). Тот же `GET /documents` с preset-scope руководителя
 * (FR-MDOC-31). Виден только ролям с visibility own_and_subordinates+.
 */
const DocumentsDept = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('documents', 'read')
    const scope = useVisibilityScope()

    // Менеджеры (own_and_subordinates+) видят срез; Viewer/Member (only_own) — нет.
    // Если движок не вернул scope (fallback), не блокируем по visibility —
    // backend-guard остаётся источником истины (BR-SHELL-4).
    const scopeAllowsDept = !scope || DEPT_LEVELS.includes(scope.level)

    const [ownerId, setOwnerId] = useState('')
    const [templateId, setTemplateId] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [hasDriftOnly, setHasDriftOnly] = useState(false)
    const [emptyVarsOnly, setEmptyVarsOnly] = useState(false)
    const [pageIndex, setPageIndex] = useState(0)

    const fromMs = dateFrom ? dayjs(dateFrom).startOf('day').valueOf() : undefined
    const toMs = dateTo ? dayjs(dateTo).endOf('day').valueOf() : undefined

    const swrKey =
        pid && canRead && scopeAllowsDept
            ? [
                  '/documents/department',
                  pid,
                  {
                      ownerId,
                      templateId,
                      hasDriftOnly,
                      emptyVarsOnly,
                      fromMs,
                      toMs,
                      pageIndex,
                  },
              ]
            : null

    const { data, isLoading, error, isValidating, mutate } = useSWR(
        swrKey,
        () =>
            apiListDocuments({
                projectId: pid!,
                ownerId: ownerId || undefined,
                templateId: templateId || undefined,
                hasDrift: hasDriftOnly || undefined,
                emptyVarsOnly: emptyVarsOnly || undefined,
                from: fromMs,
                to: toMs,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    // Шаблоны проекта для фильтра по шаблону (project-wide, FR-MDOC-18).
    const { data: tplData } = useSWR(
        pid && canRead && scopeAllowsDept ? ['/document-templates', pid, 'dept'] : null,
        () => apiListTemplates({ projectId: pid! }),
        { revalidateOnFocus: false },
    )

    const serverList = data?.list ?? []
    const total = data?.total ?? 0
    const rows = serverList

    const { userName } = useProjectMemberNames(pid)
    const { data: membersData } = useSWR(
        pid && canRead && scopeAllowsDept ? ['project-members', pid, 'dept-filter'] : null,
        () => apiGetProjectMembers<ProjectMember[]>(pid!),
        { revalidateOnFocus: false },
    )

    const hasActiveFilter =
        !!ownerId || !!templateId || !!dateFrom || !!dateTo || hasDriftOnly || emptyVarsOnly

    const resetFilters = () => {
        setOwnerId('')
        setTemplateId('')
        setDateFrom('')
        setDateTo('')
        setHasDriftOnly(false)
        setEmptyVarsOnly(false)
        setPageIndex(0)
    }

    // KPI-кластер (EL-DEPT-0): агрегаты по текущей странице scope.
    // Точные COUNT — TO-BE серверные (reports); здесь срез видимой страницы.
    const kpiDrift = serverList.filter((d) => d.driftStale).length

    const managerOptions = useMemo(() => {
        const members = Array.isArray(membersData) ? membersData : []
        return [
            { value: '', label: 'Все менеджеры' },
            ...members.map((m) => ({
                value: m.id,
                label: m.name || m.email || m.id,
            })),
        ]
    }, [membersData])

    const templateOptions = useMemo(
        () => [
            { value: '', label: 'Все шаблоны' },
            ...(tplData?.items ?? []).map((t) => ({ value: t.id, label: t.name })),
        ],
        [tplData],
    )

    const handleDownload = (groupId: string) => {
        if (!pid) return
        // Скачивание текущей версии: backend отдаёт presigned по versionId;
        // без versionId открываем карточку, где доступны конкретные версии.
        navigate(`/documents/${groupId}`)
    }

    const columns: ColumnDef<DocumentGroup>[] = useMemo(
        () => [
            {
                header: 'Название',
                cell: ({ row }) => (
                    <div
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                        {...qa('documents.dept.rowName', { group: row.original.groupId })}
                        onClick={() => navigate(`/documents/${row.original.groupId}`)}
                        {...qa('documents.dept.rowName', { group: row.original.groupId })}
                    >
                        <PiFileDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium">{row.original.name}</span>
                        {row.original.driftStale && (
                            <Tooltip title="Реквизиты могли измениться">
                                <span
                                    {...qa('documents.dept.driftIcon', {
                                        group: row.original.groupId,
                                    })}
                                >
                                    <PiWarningDuotone className="w-4 h-4 text-amber-500" />
                                </span>
                            </Tooltip>
                        )}
                    </div>
                ),
            },
            {
                header: 'Менеджер',
                cell: ({ row }) => (
                    <span className="text-sm">
                        {userName(row.original.ownerId) ?? row.original.ownerId}
                    </span>
                ),
            },
            {
                header: 'Сущность',
                cell: ({ row }) => {
                    const route = contextRecordRoute(
                        row.original.contextType,
                        row.original.contextRecordId,
                    )
                    if (!route) return <span className="text-gray-400">—</span>
                    return (
                        <div
                            className="cursor-pointer hover:underline text-blue-600 dark:text-blue-400"
                            onClick={() => navigate(route)}
                        >
                            <span className="text-xs text-gray-500">
                                {CONTEXT_LABELS[row.original.contextType]}:{' '}
                            </span>
                            <span className="text-sm">{row.original.contextRecordId}</span>
                        </div>
                    )
                },
            },
            {
                header: 'Дата',
                cell: ({ row }) => dayjs(row.original.createdAt).format('DD.MM.YYYY'),
            },
            {
                header: 'Версия',
                cell: ({ row }) => (
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        v{row.original.currentVersion}
                    </span>
                ),
            },
            {
                header: 'Drift',
                cell: ({ row }) =>
                    row.original.driftStale ? (
                        <Tag
                            className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                            {...qa('documents.dept.driftTag', { group: row.original.groupId })}
                        >
                            есть
                        </Tag>
                    ) : (
                        <span className="text-gray-400 text-sm">—</span>
                    ),
            },
            {
                header: 'Действия',
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Скачать"
                            {...qa('documents.dept.download', { group: row.original.groupId })}
                            onClick={() => handleDownload(row.original.groupId)}
                        >
                            <PiDownloadDuotone className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Открыть"
                            {...qa('documents.dept.open', { group: row.original.groupId })}
                            onClick={() => navigate(`/documents/${row.original.groupId}`)}
                        >
                            <PiEyeDuotone className="w-4 h-4" />
                        </button>
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pid, userName],
    )

    // ── ST-10: нет права documents:read ──
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права documents:read." />
            </Container>
        )
    }

    // ── ST-10/ST-13: роль без подчинённых — управленческий срез недоступен ──
    if (!scopeAllowsDept) {
        return (
            <Container {...qa('documents.dept.noPermission')}>
                <NoPermissionState message="Сводный журнал доступен руководящим ролям с подчинёнными." />
            </Container>
        )
    }

    const renderTable = () => {
        // ST-1: первичная загрузка
        if (isLoading) {
            return (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} height={44} className="rounded-lg" />
                    ))}
                </div>
            )
        }
        // ST-6: ошибка загрузки
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить документы отдела')}
                    onRetry={() => mutate()}
                />
            )
        }
        // ST-4: пусто по фильтру
        if (rows.length === 0 && hasActiveFilter) {
            return (
                <div className="text-center py-12" {...qa('documents.dept.emptyFilter')}>
                    <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Ничего не найдено.</p>
                    <Button
                        variant="plain"
                        onClick={resetFilters}
                        {...qa('documents.dept.resetFilters')}
                    >
                        Сбросить фильтры
                    </Button>
                </div>
            )
        }
        // ST-3: пусто
        if (rows.length === 0) {
            return (
                <div className="text-center py-12" {...qa('documents.dept.empty')}>
                    <PiUsersThreeDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">За период нет документов отдела.</p>
                </div>
            )
        }
        return (
            <div className="relative">
                {/* ST-2: фоновая загрузка */}
                {isValidating && !isLoading && (
                    <div
                        className="absolute right-2 top-2 text-xs text-gray-400"
                        {...qa('documents.dept.updating')}
                    >
                        Обновление…
                    </div>
                )}
                <DataTable
                    {...qa('documents.dept.table')}
                    columns={columns}
                    data={rows}
                    pagingData={{
                        total,
                        pageIndex: pageIndex + 1,
                        pageSize: PAGE_SIZE,
                    }}
                    paginationQaId="documents.dept.paginationNext"
                    onPaginationChange={(p: number) => setPageIndex(p - 1)}
                />
            </div>
        )
    }

    return (
        <Container {...qa('documents.dept.root')}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            to="/documents"
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title="Мои документы"
                        >
                            <PiArrowLeftDuotone className="w-5 h-5" />
                        </Link>
                        <h3 className="text-2xl font-bold">Документы отдела</h3>
                    </div>
                    <Link
                        to="/documents"
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        ← Мои документы
                    </Link>
                </div>

                {/* EL-DEPT-0: KPI-кластер */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                        type="button"
                        className="text-left"
                        {...qa('documents.dept.kpiDrift')}
                        onClick={() => {
                            setHasDriftOnly(true)
                            setPageIndex(0)
                        }}
                    >
                        <AdaptiveCard className="hover:ring-1 hover:ring-amber-300 transition">
                            <div className="flex items-center gap-3">
                                <PiWarningDuotone className="w-8 h-8 text-amber-500" />
                                <div>
                                    <div className="text-2xl font-bold">{kpiDrift}</div>
                                    <div className="text-xs text-gray-500">
                                        с устаревшими реквизитами (drift)
                                    </div>
                                </div>
                            </div>
                        </AdaptiveCard>
                    </button>
                    <AdaptiveCard>
                        <div className="flex items-center gap-3">
                            <PiClipboardTextDuotone className="w-8 h-8 text-indigo-500" />
                            <div>
                                <div className="text-2xl font-bold">{total}</div>
                                <div className="text-xs text-gray-500">
                                    выпущено за период (в scope)
                                </div>
                            </div>
                        </div>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <div className="flex items-center gap-3">
                            <PiUsersThreeDuotone className="w-8 h-8 text-emerald-500" />
                            <div>
                                <div className="text-2xl font-bold">
                                    {new Set(serverList.map((d) => d.ownerId)).size}
                                </div>
                                <div className="text-xs text-gray-500">менеджеров в выборке</div>
                            </div>
                        </div>
                    </AdaptiveCard>
                </div>

                <AdaptiveCard>
                    <div className="flex flex-col md:flex-row gap-3 mb-4 flex-wrap items-end">
                        <div className="w-48" {...qa('documents.dept.managerFilter')}>
                            <label className="block text-xs text-gray-500 mb-1">Менеджер</label>
                            <Select
                                options={managerOptions}
                                value={managerOptions.find((o) => o.value === ownerId) || managerOptions[0]}
                                onChange={(opt) => {
                                    setOwnerId(opt?.value || '')
                                    setPageIndex(0)
                                }}
                            />
                        </div>
                        <div className="w-48" {...qa('documents.dept.templateFilter')}>
                            <label className="block text-xs text-gray-500 mb-1">Шаблон</label>
                            <Select
                                options={templateOptions}
                                value={templateOptions.find((o) => o.value === templateId) || templateOptions[0]}
                                onChange={(opt) => {
                                    setTemplateId(opt?.value || '')
                                    setPageIndex(0)
                                }}
                            />
                        </div>
                        <div className="w-36">
                            <label className="block text-xs text-gray-500 mb-1">Дата от</label>
                            <Input
                                type="date"
                                aria-label="Дата от"
                                {...qa('documents.dept.dateFrom')}
                                value={dateFrom}
                                onChange={(e) => {
                                    setDateFrom(e.target.value)
                                    setPageIndex(0)
                                }}
                            />
                        </div>
                        <div className="w-36">
                            <label className="block text-xs text-gray-500 mb-1">Дата до</label>
                            <Input
                                type="date"
                                aria-label="Дата до"
                                {...qa('documents.dept.dateTo')}
                                value={dateTo}
                                onChange={(e) => {
                                    setDateTo(e.target.value)
                                    setPageIndex(0)
                                }}
                            />
                        </div>
                        <label
                            className="flex items-center gap-1.5 text-sm cursor-pointer select-none h-9"
                            {...qa('documents.dept.driftFilter')}
                        >
                            <input
                                type="checkbox"
                                checked={hasDriftOnly}
                                onChange={(e) => {
                                    setHasDriftOnly(e.target.checked)
                                    setPageIndex(0)
                                }}
                                className="w-4 h-4"
                            />
                            Есть drift
                        </label>
                        <label
                            className="flex items-center gap-1.5 text-sm cursor-pointer select-none h-9"
                            {...qa('documents.dept.emptyVarsFilter')}
                        >
                            <input
                                type="checkbox"
                                checked={emptyVarsOnly}
                                onChange={(e) => {
                                    setEmptyVarsOnly(e.target.checked)
                                    setPageIndex(0)
                                }}
                                className="w-4 h-4"
                            />
                            Пустые переменные
                        </label>
                    </div>
                    {renderTable()}
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default DocumentsDept
