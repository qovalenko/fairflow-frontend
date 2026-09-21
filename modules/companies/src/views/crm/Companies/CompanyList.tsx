import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import { useSessionUser } from '@/store/authStore'
import useSWR, { useSWRConfig } from 'swr'
import {
    PiPlusDuotone,
    PiListChecksDuotone,
    PiMagnifyingGlassDuotone,
    PiUploadDuotone,
    PiDownloadDuotone,
    PiSlidersHorizontalDuotone,
    PiTrashDuotone,
    PiWarningCircleDuotone,
    PiBuildingsDuotone,
    PiArrowsMergeDuotone,
    PiDotsThreeVerticalDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import HostSlot from '@/components/shared/HostSlot'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Dropdown from '@/components/ui/Dropdown'
import Switcher from '@/components/ui/Switcher'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import type { OnSortParam, ColumnDef } from '@/components/shared/DataTable'
import type { Company } from '@/@types/crm'
import {
    apiGetCompanies,
    apiGetMembers,
    apiCreateCompany,
    apiFindCompanyDuplicates,
    apiDeleteCompany,
    apiRestoreCompany,
    apiExportCompanies,
} from '@/services/CrmService'
import type { ProjectMember } from '@/@types/crm'
import RestoreCollisionDialog, {
    parseRestoreCollision,
    type RestoreCollision,
    type RestoreStrategy,
} from './RestoreCollisionDialog'
import {
    companiesOnlyMineForProject,
    mergeCompaniesOnlyMine,
} from '../../../companiesFilterStorage'
import { qa, QA_IDS_ENABLED } from '../../../qa'

// Колонка «Размер» (градация по числу сотрудников) убрана вместе с полем
// `employeeCount`: домен company его не хранит, gateway не отдаёт — тег никогда
// не отрисовывался, колонка была вечным «-» и лишним пунктом в переключателе.
// Вернуть вместе с `employee_count` в proto/домене/маппинге gateway.

const STATUS_META: Record<string, { label: string; color: string }> = {
    lead: { label: 'Лид', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    client: { label: 'Клиент', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    partner: { label: 'Партнёр', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    former: { label: 'Бывший', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}

const statusOptions = [
    { value: 'lead', label: 'Лид' },
    { value: 'client', label: 'Клиент' },
    { value: 'partner', label: 'Партнёр' },
    { value: 'former', label: 'Бывший' },
]

const COLUMN_CONFIG = [
    { id: 'name', label: 'Название компании' },
    { id: 'inn', label: 'ИНН' },
    { id: 'industry', label: 'Отрасль' },
    { id: 'status', label: 'Статус' },
    { id: 'assigneeName', label: 'Ответственный' },
] as const

const industryOptions = [
    { value: 'Производство', label: 'Производство' },
    { value: 'Финансы', label: 'Финансы' },
    { value: 'Торговля', label: 'Торговля' },
    { value: 'ИТ', label: 'ИТ' },
    { value: 'Услуги', label: 'Услуги' },
    { value: 'Энергетика', label: 'Энергетика' },
    { value: 'Строительство', label: 'Строительство' },
    { value: 'Логистика', label: 'Логистика' },
    { value: 'Телеком', label: 'Телеком' },
    { value: 'Образование', label: 'Образование' },
]

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

/**
 * Кандидат дедуп-подсказки (GET /v1/companies/duplicates, контракт §3.12).
 * `deleted` — запись лежит в КОРЗИНЕ. Ключ идентичности она при этом не держит:
 * soft-delete снимает identityHash, поэтому 409 на сохранении не будет. Показываем
 * её, чтобы пользователь восстановил свою же запись, а не завёл третью копию;
 * открывать и тем более сливать её нельзя — сперва восстановление.
 */
type DupCandidate = {
    id: string
    name: string
    inn?: string
    matchReason?: string
    deleted?: boolean
}

const MATCH_REASON_LABELS: Record<string, string> = {
    inn: 'по ИНН',
    domain: 'по домену',
    name: 'по названию',
}

const EMPTY_FORM = {
    name: '',
    inn: '',
    kpp: '',
    legalAddress: '',
    phone: '',
    email: '',
    website: '',
    industry: '',
    status: 'lead',
    assigneeId: '',
    departmentId: '',
}

const CompanyList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const user = useSessionUser((s) => s.user)
    const currentUserId = user?.userId ?? undefined

    const canRead = can('companies', 'read')
    const canWrite = can('companies', 'write')
    const canExport = can('companies', 'export')
    const canImport = can('companies', 'import')
    const canDelete = can('companies', 'delete')
    // Право на объединение — то же, что проверяет gateway: companies:manage
    // (@RequirePermission('companies','manage') на merge/preview и merge, TODO-153).
    // Ключа companies:execute в каталоге прав нет, как и субъекта 'companies.merge',
    // поэтому оба прежних варианта давали deny у любой роли.
    const canMerge = can('companies', 'manage')
    const canTaskWrite = can('activities', 'write')
    // W-6: справочник отделов для селекта «Отдел» в форме создания компании.
    const { options: departmentOptions, unavailable: departmentsUnavailable } =
        useDepartmentOptions(canWrite)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [bulkDeleting, setBulkDeleting] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set())
    const [onlyMine, setOnlyMine] = useState(() => companiesOnlyMineForProject(pid))

    useEffect(() => {
        if (!pid) {
            setOnlyMine(false)
            return
        }
        setOnlyMine(companiesOnlyMineForProject(pid))
    }, [pid])

    const handleOnlyMineChange = (checked: boolean) => {
        setOnlyMine(checked)
        mergeCompaniesOnlyMine(pid, checked)
        setTableData((prev) => ({ ...prev, pageIndex: 1 }))
    }
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(COLUMN_CONFIG.map((c) => [c.id, true]))
    )
    const [tableData, setTableData] = useState({
        pageIndex: 1,
        pageSize: 10,
        query: '',
        industry: '',
        status: '',
        assigneeId: '',
        sort: { order: '', key: '' },
    })

    // ── создание ──
    const [formData, setFormData] = useState(EMPTY_FORM)
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [dupCandidates, setDupCandidates] = useState<DupCandidate[]>([])
    // Восстановление кандидата-дубля прямо из подсказки (TODO-362): без этого
    // «дубль в корзине» — тупик (открыть нельзя, сохранить нельзя).
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [restoreTarget, setRestoreTarget] = useState<DupCandidate | null>(null)
    const [restoreCollision, setRestoreCollision] = useState<RestoreCollision | null>(null)
    const [restoreStrategy, setRestoreStrategy] = useState<RestoreStrategy | null>(null)

    const filterOwnerId = onlyMine ? currentUserId : tableData.assigneeId || undefined

    const swrKey =
        pid && canRead
            ? ['/v1/companies', pid, { ...tableData, filterOwnerId }]
            : null

    const { data, isLoading, error, isValidating } = useSWR(
        swrKey,
        () =>
            apiGetCompanies<{ list: Company[]; total: number; hiddenByPolicy?: number }, Record<string, unknown>>({
                pageIndex: tableData.pageIndex - 1,
                pageSize: tableData.pageSize,
                query: tableData.query,
                filterIndustry: tableData.industry || undefined,
                filterStatus: tableData.status || undefined,
                filterOwnerId,
                sortBy: tableData.sort.key || undefined,
                sortDir: tableData.sort.order || undefined,
                projectId: pid!,
            }),
        { revalidateOnFocus: false, keepPreviousData: true }
    )

    const { data: membersData } = useSWR(
        canRead ? ['/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false }
    )

    const list = data?.list || []
    const membersList = normalizeList<ProjectMember>(membersData)
    const total = data?.total || 0
    const hiddenByPolicy = data?.hiddenByPolicy ?? 0
    const { pageIndex, pageSize } = tableData

    const hasActiveFilter =
        !!tableData.query ||
        !!tableData.industry ||
        !!tableData.status ||
        !!tableData.assigneeId ||
        onlyMine

    const handlePaginationChange = (page: number) =>
        setTableData((prev) => ({ ...prev, pageIndex: page }))
    const handleSelectChange = (size: number) =>
        setTableData((prev) => ({ ...prev, pageSize: size, pageIndex: 1 }))
    const handleSort = (sort: OnSortParam) =>
        setTableData((prev) => ({
            ...prev,
            sort: { order: sort.order, key: String(sort.key) },
            pageIndex: 1,
        }))
    const handleSearch = (value: string) =>
        setTableData((prev) => ({ ...prev, query: value, pageIndex: 1 }))
    const handleIndustryFilter = (value: string) =>
        setTableData((prev) => ({ ...prev, industry: value, pageIndex: 1 }))
    const handleStatusFilter = (value: string) =>
        setTableData((prev) => ({ ...prev, status: value, pageIndex: 1 }))
    const handleAssigneeFilter = (value: string) =>
        setTableData((prev) => ({ ...prev, assigneeId: value, pageIndex: 1 }))

    const resetFilters = () => {
        setOnlyMine(false)
        setTableData((prev) => ({
            ...prev,
            query: '',
            industry: '',
            status: '',
            assigneeId: '',
            pageIndex: 1,
        }))
    }

    const handleCheckBoxChange = (checked: boolean, company: Company) => {
        setSelectedCompanies((prev) => {
            const newSet = new Set(prev)
            if (checked) newSet.add(company.id)
            else newSet.delete(company.id)
            return newSet
        })
    }

    const handleIndeterminateCheckBoxChange = (checked: boolean, rows: unknown[]) => {
        setSelectedCompanies((prev) => {
            const newSet = new Set(prev)
            rows.forEach((row) => {
                const original = (row as { original?: Company }).original
                if (original?.id) {
                    if (checked) newSet.add(original.id)
                    else newSet.delete(original.id)
                }
            })
            return newSet
        })
    }

    const allColumns: ColumnDef<Company>[] = useMemo(
        () => [
            {
                id: 'name',
                header: 'Название компании',
                accessorKey: 'name',
                cell: ({ row }) => (
                    <span
                        className="text-primary"
                        {...qa('companies.list.row', { company: row.original.id })}
                    >
                        {row.original.name}
                    </span>
                ),
            },
            {
                id: 'inn',
                header: 'ИНН',
                accessorKey: 'inn',
                cell: ({ row }) => <span>{row.original.inn || '-'}</span>,
            },
            {
                id: 'industry',
                header: 'Отрасль',
                accessorKey: 'industry',
                cell: ({ row }) => {
                    const industry = row.original.industry
                    if (!industry) return <span>-</span>
                    return (
                        <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                            {industry}
                        </Tag>
                    )
                },
            },
            {
                id: 'status',
                header: 'Статус',
                accessorKey: 'status',
                cell: ({ row }) => {
                    const meta = row.original.status ? STATUS_META[row.original.status] : undefined
                    if (!meta) return <span>-</span>
                    return <Tag className={meta.color}>{meta.label}</Tag>
                },
            },
            {
                id: 'assigneeName',
                header: 'Ответственный',
                accessorKey: 'assigneeName',
                cell: ({ row }) => {
                    const name = row.original.assigneeName
                    if (!name) return <span className="text-gray-400">Без ответственного</span>
                    const initials = name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                    return (
                        <div className="flex items-center gap-2">
                            <Avatar
                                size={28}
                                className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex-shrink-0"
                            >
                                {initials}
                            </Avatar>
                            <span className="truncate">{name}</span>
                        </div>
                    )
                },
            },
            {
                id: 'rowActions',
                header: '',
                cell: ({ row }) => (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        {...qa('companies.list.rowActions', { company: row.original.id })}
                    >
                        <Dropdown
                            renderTitle={
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiDotsThreeVerticalDuotone />}
                                />
                            }
                            placement="bottom-end"
                        >
                            <HostSlot
                                id="list.action.menu"
                                context={{
                                    entityType: 'company',
                                    recordId: row.original.id,
                                }}
                            />
                        </Dropdown>
                    </div>
                ),
            },
        ],
        []
    )

    const columns = useMemo(
        () =>
            allColumns.filter((col) => {
                const colId = (col as { id?: string }).id ?? (col as { accessorKey?: string }).accessorKey
                return colId ? visibleColumns[colId] !== false : true
            }),
        [allColumns, visibleColumns]
    )

    const handleColumnVisibilityChange = (colId: string, checked: boolean) => {
        setVisibleColumns((prev) => {
            const next = { ...prev, [colId]: checked }
            const visibleCount = Object.values(next).filter(Boolean).length
            if (!checked && visibleCount <= 1) return prev
            return next
        })
    }

    const closeDrawer = () => {
        setDrawerOpen(false)
        setFormData(EMPTY_FORM)
        setCreateError(null)
        setDupCandidates([])
        setRestoreTarget(null)
        setRestoreCollision(null)
        setRestoreStrategy(null)
    }

    // Дедуп-подсказка (FR-MCOM-3/5, не блокирует). TODO-362: ключ идентичности
    // компании — ИНН ИЛИ домен, а домен домен-сервис выводит из e-mail/сайта
    // (deriveDomain). Поэтому подсказку триггерят все три поля, а не один ИНН,
    // и все три уходят в запрос.
    const runDupCheck = async () => {
        const inn = formData.inn.replace(/\D/g, '')
        const email = formData.email.trim()
        const website = formData.website.trim()
        const hasInn = inn.length >= 10
        if (!pid || (!hasInn && !email && !website)) {
            setDupCandidates([])
            return
        }
        try {
            const res = await apiFindCompanyDuplicates<{ candidates: DupCandidate[] }>({
                projectId: pid,
                inn: hasInn ? inn : undefined,
                email: email || undefined,
                website: website || undefined,
            })
            setDupCandidates(res?.candidates ?? [])
        } catch {
            // дедуп — не критичный путь, тихо игнорируем
            setDupCandidates([])
        }
    }

    // Восстановление кандидата из корзины прямо из подсказки. Коллизия ключа
    // (живой дубль занял ИНН/домен) разрешается тем же диалогом стратегий, что и
    // в корзине/карточке — контракт §3.11.
    const handleRestoreCandidate = async (c: DupCandidate, strategy?: RestoreStrategy) => {
        if (!pid) return
        setRestoringId(c.id)
        try {
            await apiRestoreCompany<Company>(c.id, strategy ? { strategy } : undefined, {
                projectId: pid,
            })
            toast.push(`Компания «${c.name}» восстановлена из корзины`)
            setRestoreTarget(null)
            setRestoreCollision(null)
            setRestoreStrategy(null)
            // Стратегия merge/clear_key меняет ключ, поэтому подсказку не «чиним»
            // локально, а перезапрашиваем — заодно уйдут исчезнувшие кандидаты.
            void runDupCheck()
            mutate(
                (key) => Array.isArray(key) && key[0] === '/v1/companies',
                undefined,
                { revalidate: true }
            )
        } catch (e) {
            const conflict = parseRestoreCollision(e)
            if (conflict) {
                setRestoreTarget(c)
                setRestoreCollision(conflict)
                setRestoreStrategy(conflict.options[0] ?? null)
            } else {
                const err = e as { response?: { data?: { error?: { message?: string } } } }
                toast.push(
                    err?.response?.data?.error?.message ?? 'Не удалось восстановить компанию'
                )
            }
        } finally {
            setRestoringId(null)
        }
    }

    const handleCreateCompany = async (opts?: {
        trashCollisionResolution?: 'restore' | 'create_new'
    }) => {
        if (!formData.name.trim()) {
            setCreateError('Название обязательно')
            return
        }
        setCreating(true)
        setCreateError(null)
        try {
            await apiCreateCompany<Company>({
                name: formData.name.trim(),
                inn: formData.inn.replace(/\D/g, '') || undefined,
                kpp: formData.kpp || undefined,
                legalAddress: formData.legalAddress || undefined,
                phone: formData.phone || undefined,
                email: formData.email || undefined,
                website: formData.website || undefined,
                industry: formData.industry || undefined,
                status: formData.status || undefined,
                assigneeId: formData.assigneeId || currentUserId || undefined,
                // W-6: отдел-владелец записи (ABAC-атрибут видимости).
                departmentId: formData.departmentId || undefined,
                trashCollisionResolution: opts?.trashCollisionResolution,
            }, { projectId: pid })
            toast.push(
                opts?.trashCollisionResolution === 'restore'
                    ? 'Компания восстановлена из корзины'
                    : 'Компания создана',
            )
            closeDrawer()
            mutate(
                (key) => Array.isArray(key) && key[0] === '/v1/companies',
                undefined,
                { revalidate: true }
            )
        } catch (e) {
            const err = e as {
                response?: { data?: { error?: { message?: string; code?: string } } }
            }
            const message = err?.response?.data?.error?.message ?? 'Не удалось создать компанию'
            const code = err?.response?.data?.error?.code
            if (code === 'TRASH_COLLISION' && !opts?.trashCollisionResolution) {
                const restore = window.confirm(
                    `${message}\n\nВосстановить компанию из корзины вместо создания новой?`,
                )
                if (restore) {
                    await handleCreateCompany({ trashCollisionResolution: 'restore' })
                    return
                }
            }
            setCreateError(message)
        } finally {
            setCreating(false)
        }
    }

    const memberOptions = useMemo(
        () =>
            membersList
                .filter((m) => m && m.id)
                .map((m) => ({ value: String(m.id), label: m.name ? String(m.name) : 'Без имени' })),
        [membersList]
    )

    // ── Экспорт (FR-MCOM-17 / FR-COMPANIES-240, TODO-158) ──
    // Файл собирает gateway: GET /v1/companies/export листает домен страницами по
    // 100 (домен режет page_size до 100) под ТОЙ ЖЕ visibility/ABAC, что и список,
    // и отдаёт готовый CSV. Прежний клиентский CSV строился из выделенных строк
    // ТЕКУЩЕЙ страницы, то есть физически не мог выгрузить больше pageSize записей,
    // а серверная ручка не имела ни одного вызывающего.
    // Выгружаем текущий отфильтрованный НАБОР — те же query/фильтры/сортировка, что
    // у таблицы (иначе файл и экран расходятся составом и порядком). Выделение строк
    // на состав выгрузки не влияет — это выбор для массовых действий.
    const handleExport = async () => {
        if (!pid) return
        setExporting(true)
        try {
            const res = await apiExportCompanies({
                projectId: pid,
                format: 'csv',
                query: tableData.query || undefined,
                filterStatus: tableData.status || undefined,
                filterOwnerId,
                filterIndustry: tableData.industry || undefined,
                sortBy: tableData.sort.key || undefined,
                sortDir: tableData.sort.order || undefined,
            })
            const url = URL.createObjectURL(res.blob)
            const a = document.createElement('a')
            a.href = url
            a.download = res.filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            // Усечение по потолку выгрузки нельзя проглатывать: пользователь получил
            // бы неполный файл и не узнал об этом (gateway отдаёт X-Export-Truncated).
            toast.push(
                res.truncated
                    ? `Выгружено ${res.count ?? 0} — достигнут потолок выгрузки, файл неполный. Сузьте фильтры.`
                    : `Экспортировано: ${res.count ?? 0}`
            )
        } catch {
            toast.push('Не удалось сформировать файл экспорта')
        } finally {
            setExporting(false)
        }
    }

    // ── Bulk soft-delete (EL-LIST-22, FR-MCOM-1). Частичный успех — ST-31. ──
    const handleBulkDelete = async () => {
        const ids = Array.from(selectedCompanies)
        if (ids.length === 0) return
        setBulkDeleting(true)
        const results = await Promise.allSettled(ids.map((cid) => apiDeleteCompany(cid, { projectId: pid })))
        const failed = results.filter((r) => r.status === 'rejected').length
        const ok = ids.length - failed
        setBulkDeleting(false)
        setBulkDeleteOpen(false)
        setSelectedCompanies(new Set())
        if (failed === 0) {
            toast.push(`Перемещено в корзину: ${ok}`)
        } else {
            toast.push(`Удалено: ${ok}, не удалось: ${failed}`)
        }
        mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, { revalidate: true })
    }

    // ── Bulk merge (EL-LIST-21, ровно 2 выбраны → SCR-COMPANIES-MERGE). ──
    const handleBulkMerge = () => {
        const ids = Array.from(selectedCompanies)
        if (ids.length !== 2) return
        navigate(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
    }

    // ── ST-10: нет права на чтение раздела ──
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.list.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Раздел недоступен</h4>
                        <p className="text-gray-500 max-w-md">
                            У вас нет доступа к компаниям этого проекта. Обратитесь к администратору.
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ── ST-19: проект не выбран ──
    if (!pid) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.list.noProject')}
                    >
                        <PiBuildingsDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Проект не выбран</h4>
                        <p className="text-gray-500 max-w-md">
                            Выберите проект, чтобы просмотреть его компании.
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    const emptyState =
        !isLoading && list.length === 0 ? (hasActiveFilter ? 'filter' : 'none') : null

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3>Компании</h3>
                        <div className="flex items-center gap-2">
                            {selectedCompanies.size > 0 && (
                                <HostSlot
                                    id="list.bulk.action"
                                    context={{
                                        entityType: 'company',
                                        selectedIds: Array.from(selectedCompanies),
                                    }}
                                    fallback={
                                        canTaskWrite ? (
                                            <Tooltip title="Поставить задачу">
                                                <span className="inline-flex">
                                                    <Button
                                                        variant="solid"
                                                        size="sm"
                                                        className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                                        icon={<PiListChecksDuotone />}
                                                        onClick={() => setTaskDrawerOpen(true)}
                                                        {...qa('companies.list.bulkCreateTask')}
                                                    />
                                                </span>
                                            </Tooltip>
                                        ) : null
                                    }
                                />
                            )}
                            {selectedCompanies.size > 0 && (
                                <span
                                    className="text-sm text-gray-500 mr-1"
                                    {...qa('companies.list.selectedCount')}
                                >
                                    Выбрано: {selectedCompanies.size}
                                </span>
                            )}
                            {selectedCompanies.size === 2 && canMerge && (
                                <Tooltip title="Объединить дубли (выбрано 2)">
                                    <span className="inline-flex">
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiArrowsMergeDuotone />}
                                            onClick={handleBulkMerge}
                                            {...qa('companies.list.bulkMerge')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {selectedCompanies.size > 0 && canDelete && (
                                <Tooltip title={`Удалить выбранные (${selectedCompanies.size})`}>
                                    <span className="inline-flex">
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            className="text-red-500"
                                            icon={<PiTrashDuotone />}
                                            onClick={() => setBulkDeleteOpen(true)}
                                            {...qa('companies.list.bulkDelete')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {canWrite && (
                                <Tooltip title="Создать компанию">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => setDrawerOpen(true)}
                                            {...qa('companies.list.create')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {canImport && (
                                <Tooltip title="Импорт компаний из CSV или Excel">
                                    <span className="inline-flex">
                                        <Link to={`/companies/import`} {...qa('companies.list.import')}>
                                            <Button variant="plain" size="sm" icon={<PiUploadDuotone />} />
                                        </Link>
                                    </span>
                                </Tooltip>
                            )}
                            {canExport && (
                                <Tooltip
                                    title={
                                        hasActiveFilter
                                            ? 'Выгрузить CSV по текущим фильтрам'
                                            : 'Выгрузить CSV: все доступные компании'
                                    }
                                >
                                    <span className="inline-flex">
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiDownloadDuotone />}
                                            loading={exporting}
                                            onClick={() => void handleExport()}
                                            {...qa('companies.list.export')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            <Tooltip title="Корзина">
                                <span className="inline-flex">
                                    <Link to={`/companies/trash`} {...qa('companies.list.trash')}>
                                        <Button variant="plain" size="sm" icon={<PiTrashDuotone />} />
                                    </Link>
                                </span>
                            </Tooltip>
                            <Tooltip title="Колонки таблицы">
                                <span className="inline-flex">
                                    <Dropdown
                                        renderTitle={
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiSlidersHorizontalDuotone />}
                                                {...qa('companies.list.columns')}
                                            />
                                        }
                                        placement="bottom-end"
                                        menuClass="!min-w-[200px] !p-3"
                                    >
                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                            Видимость колонок
                                        </div>
                                        {COLUMN_CONFIG.map((col) => (
                                            <Dropdown.Item key={col.id} variant="custom" className="!p-0">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleColumnVisibilityChange(
                                                            col.id,
                                                            visibleColumns[col.id] === false
                                                        )
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            handleColumnVisibilityChange(
                                                                col.id,
                                                                visibleColumns[col.id] === false
                                                            )
                                                        }
                                                    }}
                                                    {...qa('companies.list.columnToggle', {
                                                        column: col.id,
                                                    })}
                                                >
                                                    <Checkbox checked={visibleColumns[col.id] !== false} readOnly />
                                                    <span className="text-sm">{col.label}</span>
                                                </div>
                                            </Dropdown.Item>
                                        ))}
                                    </Dropdown>
                                </span>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder="Поиск по названию, ИНН, email..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={tableData.query}
                                onChange={(e) => handleSearch(e.target.value)}
                                {...qa('companies.list.search')}
                            />
                        </div>
                        {/* Select — react-select, произвольные data-атрибуты внутрь DOM
                            не доходят: qa-id вешаем на обёртку поля. */}
                        <div className="w-[160px]" {...qa('companies.list.filterIndustry')}>
                            <Select
                                placeholder="Отрасль"
                                isClearable
                                options={industryOptions}
                                value={industryOptions.find((o) => o.value === tableData.industry) || null}
                                onChange={(option) => handleIndustryFilter(option?.value || '')}
                            />
                        </div>
                        <div className="w-[150px]" {...qa('companies.list.filterStatus')}>
                            <Select
                                placeholder="Статус"
                                isClearable
                                options={statusOptions}
                                value={statusOptions.find((o) => o.value === tableData.status) || null}
                                onChange={(option) => handleStatusFilter(option?.value || '')}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('companies.list.filterAssignee')}>
                            <Select
                                placeholder="Ответственный"
                                isClearable
                                isDisabled={onlyMine}
                                options={memberOptions}
                                value={memberOptions.find((o) => o.value === tableData.assigneeId) || null}
                                onChange={(option) => handleAssigneeFilter(option?.value || '')}
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <Switcher
                                checked={onlyMine}
                                onChange={handleOnlyMineChange}
                                {...qa('companies.list.onlyMine')}
                            />
                            Только мои
                        </label>
                    </div>

                    {/* ненавязчивый индикатор refetch (ST-2) */}
                    {isValidating && !isLoading && (
                        <div className="text-xs text-gray-400" {...qa('companies.list.refetching')}>
                            Обновление списка…
                        </div>
                    )}

                    {hiddenByPolicy > 0 && !error && (
                        <div
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                            {...qa('companies.list.hiddenByPolicy', { count: hiddenByPolicy })}
                        >
                            Ещё {hiddenByPolicy} компаний скрыто настройками доступа
                        </div>
                    )}

                    {/* ST-6: ошибка загрузки */}
                    {error ? (
                        <div
                            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                            {...qa('companies.list.error')}
                        >
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-500">Не удалось загрузить список компаний</p>
                            <Button
                                variant="solid"
                                size="sm"
                                onClick={() => mutate(swrKey)}
                                {...qa('companies.list.retry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : emptyState === 'none' ? (
                        // ST-3: пусто (нет компаний)
                        <div
                            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                            {...qa('companies.list.emptyNone')}
                        >
                            <PiBuildingsDuotone className="w-12 h-12 text-gray-300" />
                            <h5>Компаний ещё нет</h5>
                            <p className="text-gray-500 max-w-md">
                                Добавьте первую компанию вручную или импортируйте список из файла.
                            </p>
                            <div className="flex gap-2">
                                {canWrite && (
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        size="sm"
                                        icon={<PiPlusDuotone />}
                                        onClick={() => setDrawerOpen(true)}
                                        {...qa('companies.list.createEmpty')}
                                    >
                                        Создать компанию
                                    </Button>
                                )}
                                {canImport && (
                                    <Link to={`/companies/import`} {...qa('companies.list.importEmpty')}>
                                        <Button variant="plain" size="sm" icon={<PiUploadDuotone />}>
                                            Импорт
                                        </Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    ) : emptyState === 'filter' ? (
                        // ST-4: пусто по фильтру
                        <div
                            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                            {...qa('companies.list.emptyFilter')}
                        >
                            <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300" />
                            <h5>Ничего не найдено</h5>
                            <p className="text-gray-500">Попробуйте изменить условия поиска или фильтры.</p>
                            <Button
                                variant="plain"
                                size="sm"
                                onClick={resetFilters}
                                {...qa('companies.list.resetFilters')}
                            >
                                Сбросить фильтры
                            </Button>
                        </div>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={list}
                            loading={isLoading}
                            qaScope={QA_IDS_ENABLED ? 'companies.list' : undefined}
                            qaIdPrefix={QA_IDS_ENABLED ? 'companies.list' : undefined}
                            rowQaKey="company"
                            pagingData={{ total, pageIndex, pageSize }}
                            onPaginationChange={handlePaginationChange}
                            onSelectChange={handleSelectChange}
                            onSort={handleSort}
                            selectable={true}
                            checkboxChecked={(company) => selectedCompanies.has(company.id)}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={handleIndeterminateCheckBoxChange}
                            onRowClick={(company) => navigate(`/companies/${company.id}`)}
                        />
                    )}
                </div>
            </AdaptiveCard>

            <Drawer
                isOpen={drawerOpen}
                onClose={closeDrawer}
                title="Создать компанию"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={closeDrawer}
                            disabled={creating}
                            {...qa('companies.create.cancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={() => void handleCreateCompany()}
                            loading={creating}
                            disabled={!formData.name || creating}
                            {...qa('companies.create.submit')}
                        >
                            Создать
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    {createError && (
                        <div
                            className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 text-sm"
                            {...qa('companies.create.error')}
                        >
                            {createError}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Название компании <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Введите название компании"
                            {...qa('companies.create.name')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">ИНН</label>
                        <Input
                            value={formData.inn}
                            onChange={(e) => setFormData((prev) => ({ ...prev, inn: e.target.value }))}
                            onBlur={() => void runDupCheck()}
                            placeholder="Введите ИНН"
                            {...qa('companies.create.inn')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">КПП</label>
                        <Input
                            value={formData.kpp}
                            onChange={(e) => setFormData((prev) => ({ ...prev, kpp: e.target.value }))}
                            placeholder="Введите КПП"
                            {...qa('companies.create.kpp')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Юридический адрес</label>
                        <Input
                            value={formData.legalAddress}
                            onChange={(e) => setFormData((prev) => ({ ...prev, legalAddress: e.target.value }))}
                            placeholder="Введите юридический адрес"
                            {...qa('companies.create.legalAddress')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Телефон</label>
                        <Input
                            value={formData.phone}
                            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                            placeholder="+7 900 000-00-00"
                            {...qa('companies.create.phone')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Эл. почта</label>
                        <Input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                            onBlur={() => void runDupCheck()}
                            placeholder="email@example.com"
                            {...qa('companies.create.email')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Веб-сайт</label>
                        <Input
                            value={formData.website}
                            onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
                            onBlur={() => void runDupCheck()}
                            placeholder="example.com"
                            {...qa('companies.create.website')}
                        />
                    </div>
                    {/* Дедуп-подсказка (§3.12): общая для ИНН/e-mail/сайта, поэтому
                        стоит после всех трёх полей, а не внутри блока ИНН. Кандидат
                        из корзины открывается не «переходом», а восстановлением. */}
                    {dupCandidates.length > 0 && (
                        <div
                            className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm"
                            {...qa('companies.create.dupHint', { count: dupCandidates.length })}
                        >
                            <div className="text-amber-700 dark:text-amber-400 font-medium mb-1">
                                Возможные дубли:
                            </div>
                            <ul className="space-y-1">
                                {dupCandidates.map((c) => (
                                    <li
                                        key={c.id}
                                        className="flex flex-wrap items-center gap-x-2 gap-y-1"
                                        {...qa('companies.create.dupCandidate', {
                                            company: c.id,
                                            deleted: c.deleted ? 'true' : 'false',
                                        })}
                                    >
                                        {c.deleted ? (
                                            <span className="text-gray-600 dark:text-gray-300">
                                                {c.name}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="text-primary hover:underline"
                                                onClick={() => navigate(`/companies/${c.id}`)}
                                                {...qa('companies.create.dupLink', { company: c.id })}
                                            >
                                                {c.name}
                                            </button>
                                        )}
                                        {c.deleted && (
                                            <span
                                                className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                                {...qa('companies.create.dupTrashedBadge', {
                                                    company: c.id,
                                                })}
                                            >
                                                в корзине
                                            </span>
                                        )}
                                        {c.inn ? (
                                            <span className="text-gray-500">· ИНН {c.inn}</span>
                                        ) : null}
                                        {c.matchReason && MATCH_REASON_LABELS[c.matchReason] ? (
                                            <span className="text-gray-500">
                                                · совпадение {MATCH_REASON_LABELS[c.matchReason]}
                                            </span>
                                        ) : null}
                                        {c.deleted && canWrite && (
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                loading={restoringId === c.id}
                                                onClick={() => void handleRestoreCandidate(c)}
                                                {...qa('companies.create.dupRestore', { company: c.id })}
                                            >
                                                Восстановить
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div {...qa('companies.create.industry')}>
                        <label className="block text-sm font-medium mb-1">Отрасль</label>
                        <Select
                            placeholder="Выберите отрасль"
                            isClearable
                            options={industryOptions}
                            value={industryOptions.find((o) => o.value === formData.industry) || null}
                            onChange={(option) => setFormData((prev) => ({ ...prev, industry: option?.value || '' }))}
                        />
                    </div>
                    <div {...qa('companies.create.status')}>
                        <label className="block text-sm font-medium mb-1">Статус</label>
                        <Select
                            placeholder="Выберите статус"
                            options={statusOptions}
                            value={statusOptions.find((o) => o.value === formData.status) || null}
                            onChange={(option) => setFormData((prev) => ({ ...prev, status: option?.value || 'lead' }))}
                        />
                    </div>
                    <div {...qa('companies.create.assignee')}>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            placeholder="Выберите ответственного"
                            isClearable
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === formData.assigneeId) || null}
                            onChange={(option) => setFormData((prev) => ({ ...prev, assigneeId: option?.value || '' }))}
                        />
                    </div>
                    {/* W-6: отдел-владелец записи (department_id в CreateCompanyRequest). */}
                    <div {...qa('companies.create.department')}>
                        <label className="block text-sm font-medium mb-1">Отдел</label>
                        <Select
                            placeholder={
                                departmentsUnavailable
                                    ? 'Справочник отделов недоступен'
                                    : 'Выберите отдел'
                            }
                            isClearable
                            isDisabled={departmentsUnavailable}
                            options={departmentOptions}
                            value={departmentOptions.find((o) => o.value === formData.departmentId) || null}
                            onChange={(option) => setFormData((prev) => ({ ...prev, departmentId: option?.value || '' }))}
                        />
                    </div>
                </div>
            </Drawer>

            {/* DLG-COMPANIES-DELETE (batch) */}
            <Dialog
                isOpen={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                onRequestClose={() => setBulkDeleteOpen(false)}
            >
                <h5 className="mb-2" {...qa('companies.list.bulkDeleteDialog')}>
                    Удалить выбранные компании?
                </h5>
                <p className="text-gray-500">
                    {selectedCompanies.size} компани
                    {selectedCompanies.size === 1 ? 'я' : selectedCompanies.size < 5 ? 'и' : 'й'} будут
                    перемещены в корзину. Их можно восстановить позже.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setBulkDeleteOpen(false)}
                        disabled={bulkDeleting}
                        {...qa('companies.list.bulkDeleteCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        onClick={handleBulkDelete}
                        loading={bulkDeleting}
                        {...qa('companies.list.bulkDeleteConfirm')}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>

            <EntityCreateDrawer
                entityType="task"
                isOpen={taskDrawerOpen}
                onClose={() => setTaskDrawerOpen(false)}
                onSuccess={() => {
                    setTaskDrawerOpen(false)
                    setSelectedCompanies(new Set())
                }}
                taskInitialData={
                    selectedCompanies.size > 0
                        ? { companyId: list.find((c) => selectedCompanies.has(c.id))?.id }
                        : undefined
                }
            />

            {/* DLG: коллизия ключа при восстановлении дубля из подсказки (§3.11) */}
            <RestoreCollisionDialog
                isOpen={!!restoreCollision}
                companyName={restoreTarget?.name}
                collision={restoreCollision}
                value={restoreStrategy}
                submitting={restoringId !== null}
                onChange={setRestoreStrategy}
                onConfirm={() => {
                    if (restoreTarget && restoreStrategy) {
                        void handleRestoreCandidate(restoreTarget, restoreStrategy)
                    }
                }}
                onClose={() => {
                    setRestoreCollision(null)
                    setRestoreTarget(null)
                    setRestoreStrategy(null)
                }}
            />
        </Container>
    )
}

export default CompanyList
