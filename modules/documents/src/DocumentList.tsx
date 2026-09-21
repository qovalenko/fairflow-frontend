import { useState, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useVisibilityScope } from '@/utils/hooks/usePermissionStatus'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiUploadDuotone,
    PiMagnifyingGlassDuotone,
    PiDownloadDuotone,
    PiFileDuotone,
    PiEyeDuotone,
    PiTrashDuotone,
    PiSparkleDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import type { ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiListDocuments,
    apiDeleteDocument,
    apiUploadDocument,
    apiDownloadVersion,
    contextRecordRoute,
    CONTEXT_LABELS,
    GENERATED_VIA_BADGE,
    mimeShort,
    type DocumentGroup,
    type GeneratedVia,
} from '@/services/DocumentsService'
import GenerateDialog from '@/components/shared/documents/GenerateDialog'
import { NoPermissionState, ErrorState, errMessage } from '@/components/shared/documents/shared'
import { qa } from './qa'

const fileTypeOptions = [
    { value: '', label: 'Все типы' },
    { value: 'DOCX', label: 'DOCX' },
    { value: 'PDF', label: 'PDF' },
    { value: 'XLSX', label: 'XLSX' },
    { value: 'PPTX', label: 'PPTX' },
]

const fileTypeColors: Record<string, string> = {
    DOCX: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    PDF: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    XLSX: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    PPTX: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
}

const viaBadgeColor: Record<GeneratedVia, string> = {
    manual: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    regenerate: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    automation: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    upload: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
}

const PAGE_SIZE = 25

const DocumentList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('documents', 'read')
    const canGenerate = can('documents.generate', 'execute')
    const canDelete = can('documents', 'delete')
    const scope = useVisibilityScope()
    // Переключатель «Мои / Отдела» виден руководящим ролям (FR-MDOC-31).
    const canSeeDept =
        !!scope &&
        ['own_and_subordinates', 'own_and_department', 'all'].includes(scope.level)

    const [activeTab, setActiveTab] = useState<'all' | 'generated' | 'uploaded'>('all')
    const [search, setSearch] = useState('')
    const [fileTypeFilter, setFileTypeFilter] = useState('')
    const [hasDriftOnly, setHasDriftOnly] = useState(false)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [pageIndex, setPageIndex] = useState(0)

    const [genOpen, setGenOpen] = useState(false)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<DocumentGroup | null>(null)
    const [deleting, setDeleting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const fromMs = dateFrom ? dayjs(dateFrom).startOf('day').valueOf() : undefined
    const toMs = dateTo ? dayjs(dateTo).endOf('day').valueOf() : undefined

    const swrKey =
        pid && canRead
            ? [
                  '/documents',
                  pid,
                  {
                      pageIndex,
                      hasDriftOnly,
                      fromMs,
                      toMs,
                      activeTab,
                      search,
                      fileTypeFilter,
                  },
              ]
            : null

    const { data, isLoading, error, isValidating } = useSWR(
        swrKey,
        () =>
            apiListDocuments({
                projectId: pid!,
                hasDrift: hasDriftOnly || undefined,
                from: fromMs,
                to: toMs,
                pageIndex,
                pageSize: PAGE_SIZE,
                search: search.trim() || undefined,
                sourceKind:
                    activeTab === 'generated'
                        ? 'generated'
                        : activeTab === 'uploaded'
                          ? 'uploaded'
                          : undefined,
                fileType: fileTypeFilter || undefined,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const filteredDocs = data?.list ?? []
    const total = data?.total ?? 0

    const hasActiveFilter =
        !!search || !!fileTypeFilter || hasDriftOnly || !!dateFrom || !!dateTo

    const resetFilters = () => {
        setSearch('')
        setFileTypeFilter('')
        setHasDriftOnly(false)
        setDateFrom('')
        setDateTo('')
    }

    const handleDownload = async (groupId: string, versionId?: string) => {
        if (!pid) return
        // currentVersion download: backend отдаёт presigned по versionId; при отсутствии
        // versionId переходим в карточку, где доступны конкретные версии.
        if (!versionId) {
            navigate(`/documents/${groupId}`)
            return
        }
        // Ручка JWT-защищена и отдаёт JSON {url}, а не файл — берём URL через axios
        // (перехватчик добавит Authorization) и только потом открываем вкладку.
        setDownloadingId(versionId)
        try {
            const { url } = await apiDownloadVersion(versionId, { projectId: pid })
            window.open(url, '_blank', 'noopener')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось скачать документ'))
        } finally {
            setDownloadingId(null)
        }
    }

    const handleUploadFile = async (file: File) => {
        if (!pid) return
        const form = new FormData()
        form.append('file', file)
        form.append('name', file.name)
        form.append('contextType', 'none')
        try {
            await apiUploadDocument(form, { projectId: pid })
            toast.push('Документ загружён')
            mutate((key) => Array.isArray(key) && key[0] === '/documents')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось загрузить документ'))
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget || !pid) return
        setDeleting(true)
        try {
            await apiDeleteDocument(deleteTarget.groupId, { projectId: pid })
            toast.push('Документ удалён')
            setDeleteTarget(null)
            mutate((key) => Array.isArray(key) && key[0] === '/documents')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить документ'))
        } finally {
            setDeleting(false)
        }
    }

    const columns: ColumnDef<DocumentGroup>[] = useMemo(
        () => [
            {
                header: 'Название',
                cell: ({ row }) => (
                    <div
                        {...qa('documents.list.rowName', { group: row.original.groupId })}
                        className="flex items-center gap-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                        onClick={() => navigate(`/documents/${row.original.groupId}`)}
                    >
                        <PiFileDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="font-medium">{row.original.name}</span>
                        {row.original.driftStale && (
                            <Tooltip title="Реквизиты могли измениться">
                                <span
                                    {...qa('documents.list.driftIcon', {
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
                header: 'Тип',
                cell: ({ row }) => {
                    const t = mimeShort(undefined)
                    return (
                        <div className="flex items-center gap-1.5">
                            <Tag className={fileTypeColors[t] || 'bg-gray-100 text-gray-700'}>
                                {t}
                            </Tag>
                            <Tag className={viaBadgeColor[row.original.generatedVia]}>
                                {GENERATED_VIA_BADGE[row.original.generatedVia]}
                            </Tag>
                        </div>
                    )
                },
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
                header: 'Автор',
                cell: ({ row }) => (
                    <span className="text-sm">{row.original.ownerId}</span>
                ),
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
                header: 'Действия',
                cell: ({ row }) => (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            {...qa('documents.list.download', { group: row.original.groupId })}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                            // В списке gateway не отдаёт versionId (documentGroupFe),
                            // поэтому кнопка ведёт в карточку, где версии известны.
                            title="Скачать (в карточке документа)"
                            disabled={!!downloadingId}
                            onClick={() => handleDownload(row.original.groupId)}
                        >
                            <PiDownloadDuotone className="w-4 h-4" />
                        </button>
                        <button
                            {...qa('documents.list.view', { group: row.original.groupId })}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            onClick={() => navigate(`/documents/${row.original.groupId}`)}
                        >
                            <PiEyeDuotone className="w-4 h-4" />
                        </button>
                        {canDelete && (
                            <button
                                {...qa('documents.list.delete', { group: row.original.groupId })}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500"
                                onClick={() => setDeleteTarget(row.original)}
                            >
                                <PiTrashDuotone className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [canDelete, pid, downloadingId],
    )

    // ── ST-10: нет права на раздел ──
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права documents:read." />
            </Container>
        )
    }

    const renderTable = () => {
        // ST-1: первичная загрузка
        if (isLoading) {
            return (
                <div className="flex flex-col gap-2" {...qa('documents.list.skeleton')}>
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
                    message={errMessage(error, 'Не удалось загрузить документы')}
                    onRetry={() => mutate(swrKey)}
                />
            )
        }
        // ST-4: пусто по фильтру (отличаем от ST-3)
        if (filteredDocs.length === 0 && (hasActiveFilter || activeTab !== 'all')) {
            return (
                <div className="text-center py-12" {...qa('documents.list.emptyFilter')}>
                    <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Ничего не найдено.</p>
                    <Button variant="plain" onClick={resetFilters} {...qa('documents.list.resetFilters')}>
                        Сбросить фильтры
                    </Button>
                </div>
            )
        }
        // ST-3: совсем пусто
        if (filteredDocs.length === 0) {
            return (
                <div className="text-center py-12" {...qa('documents.list.empty')}>
                    <PiFileDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">Нет документов.</p>
                    {canGenerate && (
                        <div className="flex items-center justify-center gap-2">
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiUploadDuotone />}
                                {...qa('documents.list.emptyUpload')}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Загрузить документ
                            </Button>
                            <Button
                                variant="default"
                                icon={<PiSparkleDuotone />}
                                {...qa('documents.list.emptyGenerate')}
                                onClick={() => setGenOpen(true)}
                            >
                                Сгенерировать
                            </Button>
                        </div>
                    )}
                </div>
            )
        }
        return (
            <div className="relative">
                {/* ST-2: фоновая загрузка */}
                {isValidating && !isLoading && (
                    <div
                        className="absolute right-2 top-2 text-xs text-gray-400"
                        {...qa('documents.list.refreshing')}
                    >
                        Обновление…
                    </div>
                )}
                <DataTable
                    {...qa('documents.list.table')}
                    columns={columns}
                    data={filteredDocs}
                    pagingData={{
                        total,
                        pageIndex: pageIndex + 1,
                        pageSize: PAGE_SIZE,
                    }}
                    paginationQaId="documents.list.paginationNext"
                    onPaginationChange={(p: number) => setPageIndex(p - 1)}
                />
            </div>
        )
    }

    return (
        <Container {...qa('documents.list.root')}>
            <input
                ref={fileInputRef}
                type="file"
                {...qa('documents.list.uploadInput')}
                aria-label="Загрузить документ"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUploadFile(f)
                    e.target.value = ''
                }}
            />
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold">Документы</h3>
                    <div className="flex items-center gap-2">
                        {canSeeDept && (
                            <Link
                                to="/documents/department"
                                {...qa('documents.list.deptLink')}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Документы отдела →
                            </Link>
                        )}
                        <Link
                            to="/documents/templates"
                            {...qa('documents.list.templatesLink')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Шаблоны документов →
                        </Link>
                        {/* EL-LIST-3 / EL-LIST-4 — ST-11: скрыты без права generate */}
                        {canGenerate && (
                            <>
                                <Button
                                    variant="default"
                                    icon={<PiUploadDuotone />}
                                    {...qa('documents.list.upload')}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Загрузить
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    icon={<PiSparkleDuotone />}
                                    {...qa('documents.list.generate')}
                                    onClick={() => setGenOpen(true)}
                                >
                                    Сгенерировать
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <AdaptiveCard>
                    <Tabs
                        value={activeTab}
                        onChange={(val) => {
                            setActiveTab(val as 'all' | 'generated' | 'uploaded')
                            setPageIndex(0)
                        }}
                    >
                        <Tabs.TabList>
                            <Tabs.TabNav value="all" {...qa('documents.list.tab', { tab: 'all' })}>
                                Все
                            </Tabs.TabNav>
                            <Tabs.TabNav value="generated" {...qa('documents.list.tab', { tab: 'generated' })}>
                                Сгенерированные
                            </Tabs.TabNav>
                            <Tabs.TabNav value="uploaded" {...qa('documents.list.tab', { tab: 'uploaded' })}>
                                Загруженные
                            </Tabs.TabNav>
                        </Tabs.TabList>
                        <div className="mt-4">
                            <div className="flex flex-col md:flex-row gap-3 mb-4 flex-wrap">
                                <div className="flex-1 min-w-48">
                                    <Input
                                        {...qa('documents.list.search')}
                                        placeholder="Поиск документов..."
                                        prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value)
                                            setPageIndex(0)
                                        }}
                                    />
                                </div>
                                <div className="w-40" {...qa('documents.list.fileType')}>
                                    <Select
                                        options={fileTypeOptions}
                                        value={
                                            fileTypeOptions.find(
                                                (o) => o.value === fileTypeFilter,
                                            ) || fileTypeOptions[0]
                                        }
                                        onChange={(opt) => {
                                            setFileTypeFilter(opt?.value || '')
                                            setPageIndex(0)
                                        }}
                                        placeholder="Тип файла"
                                    />
                                </div>
                                <Input
                                    type="date"
                                    aria-label="Дата от"
                                    {...qa('documents.list.dateFrom')}
                                    value={dateFrom}
                                    onChange={(e) => {
                                        setDateFrom(e.target.value)
                                        setPageIndex(0)
                                    }}
                                    className="w-36"
                                />
                                <Input
                                    type="date"
                                    aria-label="Дата до"
                                    {...qa('documents.list.dateTo')}
                                    value={dateTo}
                                    onChange={(e) => {
                                        setDateTo(e.target.value)
                                        setPageIndex(0)
                                    }}
                                    className="w-36"
                                />
                                <label
                                    className="flex items-center gap-1.5 text-sm cursor-pointer select-none"
                                    {...qa('documents.list.driftFilter')}
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
                            </div>
                            {renderTable()}
                        </div>
                    </Tabs>
                </AdaptiveCard>
            </div>

            {pid && (
                <GenerateDialog
                    isOpen={genOpen}
                    onClose={() => setGenOpen(false)}
                    projectId={pid}
                    onDone={(res) => navigate(`/documents/${res.group.groupId}`)}
                />
            )}

            {/* ST-7 confirm удаления */}
            <Dialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                {...qa('documents.list.deleteDialog')}
            >
                <h5 className="mb-2">Удалить документ?</h5>
                <p className="text-sm text-gray-500 mb-6">
                    Документ «{deleteTarget?.name}» будет перемещён в корзину.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="plain" onClick={() => setDeleteTarget(null)} {...qa('documents.list.deleteCancel')}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        loading={deleting}
                        {...qa('documents.list.deleteConfirm')}
                        onClick={confirmDelete}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default DocumentList
