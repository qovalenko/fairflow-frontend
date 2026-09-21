import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiPlusDuotone,
    PiListChecksDuotone,
    PiMagnifyingGlassDuotone,
    PiUploadDuotone,
    PiSlidersHorizontalDuotone,
    PiDownloadDuotone,
    PiAddressBookDuotone,
    PiWarningCircleDuotone,
    PiTrashDuotone,
    PiUsersThreeDuotone,
    PiArrowsLeftRightDuotone,
    PiDotsThreeVerticalDuotone,
} from 'react-icons/pi'
import { CSVLink } from 'react-csv'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Dialog from '@/components/ui/Dialog'
import Dropdown from '@/components/ui/Dropdown'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import HostSlot from '@/components/shared/HostSlot'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import DefaultOption from '@/components/ui/Select/Option'
import type { OptionProps as ReactSelectOptionProps } from 'react-select'
import type { OnSortParam, ColumnDef } from '@/components/shared/DataTable'
import type { Contact } from '@/@types/crm'
import {
    apiGetContacts,
    apiGetCompanies,
    apiGetMembers,
    apiGetDealSources,
    apiCreateContact,
    apiFindContactDuplicates,
    apiExportContacts,
    apiReassignContactsFromOwner,
    newIdempotencyKey,
    type DuplicateCandidate,
} from '@/services/CrmService'
import type { Company, ProjectMember, DealSource } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'

const CONTACT_COLUMN_CONFIG = [
    { id: 'firstName', label: 'Имя' },
    { id: 'phone', label: 'Телефон' },
    { id: 'email', label: 'Email' },
    { id: 'companyName', label: 'Компания' },
    { id: 'source', label: 'Источник' },
    { id: 'assigneeName', label: 'Ответственный' },
    { id: 'lastActivityAt', label: 'Последняя активность' },
] as const

const OWNER_SCOPE_UNASSIGNED = '__unassigned__'

const INACTIVE_DAYS_OPTIONS = [
    { value: '', label: 'Активность: любая' },
    { value: '7', label: 'Без активности > 7 дн.' },
    { value: '14', label: 'Без активности > 14 дн.' },
    { value: '30', label: 'Без активности > 30 дн.' },
    { value: '90', label: 'Без активности > 90 дн.' },
]

function makeSelectOption(qaBase: string) {
    return function QaSelectOption(
        props: ReactSelectOptionProps<{ value: string; label: string }>,
    ) {
        return (
            <DefaultOption
                {...props}
                innerProps={{
                    ...props.innerProps,
                    ...(qa(`${qaBase}.option`, { value: props.data.value }) as Record<
                        string,
                        string
                    >),
                }}
            />
        )
    }
}

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

const ContactList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // TODO-370: сервер гейтит чтение (GET /v1/contacts — contacts:read),
    // поэтому список тоже проверяет право явно, а не ловит 403 из SWR.
    const canRead = can('contacts', 'read')
    const canWrite = can('contacts', 'write')
    const canManage = can('contacts', 'manage')
    const canImport = can('contacts', 'import')
    const canExport = can('contacts', 'export')
    // W-6: справочник отделов для селекта «Отдел» в форме создания.
    const { options: departmentOptions, unavailable: departmentsUnavailable } =
        useDepartmentOptions(canWrite)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set())
    const [searchInput, setSearchInput] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(CONTACT_COLUMN_CONFIG.map((c) => [c.id, true])),
    )
    const [tableData, setTableData] = useState({
        pageIndex: 1,
        pageSize: 10,
        query: '',
        source: '',
        assigneeId: '',
        ownerScope: '',
        inactiveDays: '',
        filterTags: '',
        sort: { order: '', key: '' },
    })
    const [reassignFromOpen, setReassignFromOpen] = useState(false)
    const [reassignFromOwnerId, setReassignFromOwnerId] = useState('')
    const [reassignToOwnerId, setReassignToOwnerId] = useState('')
    const [reassignFromBusy, setReassignFromBusy] = useState(false)

    const { data, isLoading, error, mutate } = useSWR(
        pid && canRead ? ['/v1/contacts', pid, tableData] : null,
        () =>
            apiGetContacts<{ list: Contact[]; total: number; hiddenByPolicy?: number }, typeof tableData & { projectId: string }>({
                ...tableData,
                pageIndex: tableData.pageIndex - 1,
                projectId: pid!,
            }),
        { revalidateOnFocus: false },
    )

    const { data: companiesData } = useSWR(
        pid && canRead ? ['/v1/companies', pid, { pageSize: 1000 }] : null,
        () =>
            apiGetCompanies<{ list: Company[]; total: number }, { pageSize: number; projectId: string }>({
                pageSize: 1000,
                projectId: pid!,
            }),
        { revalidateOnFocus: false },
    )

    // TODO-173: BFF (`mapContact`) отдаёт по контакту только companyId/companyIds —
    // названия компании в ответе нет, поэтому колонка «Компания» и CSV всегда были
    // пустыми. Резолвим id → имя из того же справочника компаний, который список и
    // так грузит ради селекта в drawer'е (без второго запроса; тот же приём, что
    // useCompanyNames в карточке контакта).
    const companyNameById = useMemo(() => {
        const map = new Map<string, string>()
        for (const c of companiesData?.list ?? []) {
            if (c?.id && c?.name) map.set(c.id, c.name)
        }
        return map
    }, [companiesData])

    const contactCompanyName = useMemo(
        () =>
            (c: Contact): string => {
                const cid = c.companyId ?? c.companyIds?.[0]
                return (cid ? companyNameById.get(cid) : undefined) ?? c.companyName ?? ''
            },
        [companyNameById],
    )

    // pid — и в аргументе (без него BFF отдаёт пустой список), и в ключе SWR:
    // иначе кэш участников одного проекта переезжает в другой при смене проекта.
    const { data: membersData } = useSWR(
        pid ? ['/api/v1/members', pid] : null,
        () => apiGetMembers<ProjectMember[]>({ projectId: pid! }),
        { revalidateOnFocus: false },
    )

    const { data: sourcesData } = useSWR(
        ['/api/v1/deal-sources'],
        () => apiGetDealSources<DealSource[]>(),
        { revalidateOnFocus: false },
    )

    const list = data?.list || []
    const membersList = normalizeList<ProjectMember>(membersData)
    const dealSourcesList = normalizeList<DealSource>(sourcesData)
    const total = data?.total || 0
    const hiddenByPolicy = data?.hiddenByPolicy ?? 0
    const { pageIndex, pageSize } = tableData
    const hasFilters = Boolean(
        tableData.query ||
            tableData.source ||
            tableData.assigneeId ||
            tableData.ownerScope ||
            tableData.inactiveDays ||
            tableData.filterTags,
    )
    // ST-6 Error / ST-3 Empty / ST-4 Empty-filter — отличаем явно.
    const showError = Boolean(error) && !isLoading
    const showEmpty = !isLoading && !error && list.length === 0 && !hasFilters
    const showEmptyFilter = !isLoading && !error && list.length === 0 && hasFilters

    const resetFilters = () => {
        setSearchInput('')
        setTableData((prev) => ({
            ...prev,
            query: '',
            source: '',
            assigneeId: '',
            ownerScope: '',
            inactiveDays: '',
            filterTags: '',
            pageIndex: 1,
        }))
    }

    const handlePaginationChange = (page: number) => {
        setTableData((prev) => ({ ...prev, pageIndex: page }))
    }

    const handleSelectChange = (size: number) => {
        setTableData((prev) => ({ ...prev, pageSize: size, pageIndex: 1 }))
    }

    const handleSort = (sort: OnSortParam) => {
        setTableData((prev) => ({
            ...prev,
            sort: { order: sort.order, key: String(sort.key) },
            pageIndex: 1,
        }))
    }

    // Поиск с debounce 300мс (NFR-MCON-2).
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleSearch = (value: string) => {
        setSearchInput(value)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setTableData((prev) => ({ ...prev, query: value, pageIndex: 1 }))
        }, 300)
    }
    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
    }, [])

    const handleSourceFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, source: value, pageIndex: 1 }))
    }

    const handleAssigneeFilter = (value: string) => {
        if (value === OWNER_SCOPE_UNASSIGNED) {
            setTableData((prev) => ({
                ...prev,
                assigneeId: '',
                ownerScope: OWNER_SCOPE_UNASSIGNED,
                pageIndex: 1,
            }))
        } else {
            setTableData((prev) => ({
                ...prev,
                assigneeId: value,
                ownerScope: '',
                pageIndex: 1,
            }))
        }
    }

    const handleInactiveDaysFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, inactiveDays: value, pageIndex: 1 }))
    }

    const handleBulkReassignFromOwner = async () => {
        if (!pid || !reassignFromOwnerId || !reassignToOwnerId) return
        setReassignFromBusy(true)
        try {
            const res = await apiReassignContactsFromOwner(
                { fromOwnerId: reassignFromOwnerId, toOwnerId: reassignToOwnerId },
                { projectId: pid },
            )
            notifySuccess(`Переназначено контактов: ${res.reassigned}`)
            setReassignFromOpen(false)
            setReassignFromOwnerId('')
            setReassignToOwnerId('')
            await mutate()
        } catch (err) {
            notifyError(extractApiError(err).message)
        } finally {
            setReassignFromBusy(false)
        }
    }

    const handleTagsFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, filterTags: value, pageIndex: 1 }))
    }

    const handleCheckBoxChange = (checked: boolean, contact: Contact) => {
        setSelectedContacts((prev) => {
            const next = new Set(prev)
            if (checked) next.add(contact.id)
            else next.delete(contact.id)
            return next
        })
    }

    const handleIndeterminateCheckBoxChange = (
        checked: boolean,
        rows: { original: Contact }[],
    ) => {
        setSelectedContacts((prev) => {
            const next = new Set(prev)
            rows.forEach((row) => {
                if (checked) next.add(row.original.id)
                else next.delete(row.original.id)
            })
            return next
        })
    }

    // Клиентский CSV — только для ЯВНО выбранных строк текущей страницы
    // (пользователь видит ровно то, что отметил). Выгрузка «всего» идёт через
    // сервер, см. handleExportAll.
    const exportData = useMemo(() => {
        const toExport = list.filter((c) => selectedContacts.has(c.id))
        return toExport.map((c) => {
            const fullName = `${c.firstName} ${c.lastName}${c.middleName ? ` ${c.middleName}` : ''}`
            return {
                Имя: fullName,
                Телефон: c.phone ?? '',
                Email: c.email ?? '',
                Компания: contactCompanyName(c),
                Источник: c.source ?? '',
                Ответственный: c.assigneeName ?? '',
            }
        })
    }, [list, selectedContacts, contactCompanyName])

    /**
     * EXTRA-CONTACTS-1 — выгрузка всего набора СЕРВЕРОМ
     * (`GET /v1/contacts/export`, `contacts:export`, тот же visibility-scope,
     * что у списка). Раньше кнопка отдавала CSV из уже загруженной страницы —
     * «экспорт всего» превращался в 10 строк.
     */
    const handleExportAll = async () => {
        if (!pid) return
        setExporting(true)
        try {
            const blob = await apiExportContacts({
                projectId: pid,
                format: 'csv',
                query: tableData.query || undefined,
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `контакты_${dayjs().format('YYYY-MM-DD')}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            notifySuccess('Файл сформирован')
        } catch (err) {
            const { status, message } = extractApiError(err)
            notifyError(
                status === 403 ? 'Нет права на экспорт контактов (contacts:export)' : message,
            )
        } finally {
            setExporting(false)
        }
    }

    const handleColumnVisibilityChange = (colId: string, checked: boolean) => {
        setVisibleColumns((prev) => {
            const next = { ...prev, [colId]: checked }
            const visibleCount = Object.values(next).filter(Boolean).length
            if (!checked && visibleCount <= 1) return prev
            return next
        })
    }

    const allColumns: ColumnDef<Contact>[] = useMemo(
        () => [
            {
                id: 'firstName',
                header: () => <span {...qa('contacts.list.sort', { column: 'firstName' })}>Имя</span>,
                accessorKey: 'firstName',
                enableSorting: true,
                cell: ({ row }) => {
                    const contact = row.original
                    const fullName = `${contact.firstName} ${contact.lastName}${contact.middleName ? ` ${contact.middleName}` : ''}`
                    return (
                        <span
                            className="text-primary"
                            {...qa('contacts.list.row', { contact: contact.id })}
                        >
                            {fullName}
                        </span>
                    )
                },
            },
            {
                id: 'phone',
                header: 'Телефон',
                accessorKey: 'phone',
                cell: ({ row }) => <span>{row.original.phone}</span>,
            },
            {
                id: 'email',
                header: 'Email',
                accessorKey: 'email',
                cell: ({ row }) => <span>{row.original.email || '-'}</span>,
            },
            {
                id: 'companyName',
                header: 'Компания',
                accessorKey: 'companyName',
                cell: ({ row }) => {
                    const companyId = row.original.companyId ?? row.original.companyIds?.[0]
                    const companyName = contactCompanyName(row.original)
                    if (!companyName) return <span>-</span>
                    return companyId ? (
                        <span
                            className="text-primary cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/companies/${companyId}`)
                            }}
                            {...qa('contacts.list.companyLink', { company: companyId })}
                        >
                            {companyName}
                        </span>
                    ) : (
                        <span>{companyName}</span>
                    )
                },
            },
            {
                id: 'source',
                header: 'Источник',
                accessorKey: 'source',
                cell: ({ row }) => {
                    const source = row.original.source
                    if (!source) return <span>-</span>
                    const sourceData = dealSourcesList.find((s) => s.name === source)
                    const color = sourceData?.color
                    return (
                        <Tag
                            className={
                                !color
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : ''
                            }
                            style={
                                color
                                    ? {
                                          backgroundColor: `${color}20`,
                                          color: color,
                                      }
                                    : undefined
                            }
                        >
                            {source}
                        </Tag>
                    )
                },
            },
            {
                id: 'assigneeName',
                header: 'Ответственный',
                accessorKey: 'assigneeName',
                cell: ({ row }) => {
                    const name = row.original.assigneeName
                    if (!name) return <span>-</span>
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
                id: 'lastActivityAt',
                header: 'Последняя активность',
                accessorKey: 'lastActivityAt',
                cell: ({ row }) => {
                    const ts = row.original.lastActivityAt
                    if (!ts) return <span className="text-gray-400">—</span>
                    return <span>{dayjs.unix(ts).format('DD.MM.YYYY')}</span>
                },
            },
            {
                id: 'rowActions',
                header: '',
                cell: ({ row }) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                            renderTitle={
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiDotsThreeVerticalDuotone />}
                                    {...qa('contacts.list.rowMenu', { contact: row.original.id })}
                                />
                            }
                            placement="bottom-end"
                        >
                            <HostSlot
                                id="list.action.menu"
                                context={{
                                    entityType: 'contact',
                                    recordId: row.original.id,
                                }}
                                pending={null}
                            />
                        </Dropdown>
                    </div>
                ),
            },
        ],
        [navigate, dealSourcesList, contactCompanyName],
    )

    const columns = useMemo(
        () =>
            allColumns.filter((col) => {
                const colId = (col as { id?: string }).id ?? (col as { accessorKey?: string }).accessorKey
                return colId ? visibleColumns[colId] !== false : true
            }),
        [allColumns, visibleColumns],
    )

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        position: '',
        companyIds: [] as string[],
        source: '',
        assigneeId: '',
        departmentId: '',
    })

    const resetForm = () =>
        setFormData({
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            position: '',
            companyIds: [],
            source: '',
            assigneeId: '',
            departmentId: '',
        })

    /**
     * TODO-176: ключ идемпотентности живёт ровно столько, сколько ОДНА попытка
     * пользователя создать контакт (открытый drawer). Повтор сабмита после
     * таймаута/двойной клик переиспользуют тот же ключ, и домен реиграет первый
     * ответ вместо второго контакта. Закрытие drawer'а — успехом или отменой —
     * завершает попытку: следующая получит новый ключ.
     */
    const createKeyRef = useRef<string | null>(null)

    const closeDrawer = () => {
        setDrawerOpen(false)
        setDuplicates([])
        resetForm()
        createKeyRef.current = null
    }

    // Дедуп-радар при blur email/phone (FR-MCON-5; контракт §3.8).
    const handleDedupCheck = async () => {
        if (!pid) return
        if (!formData.email && !formData.phone) {
            setDuplicates([])
            return
        }
        try {
            const res = await apiFindContactDuplicates({
                projectId: pid,
                email: formData.email || undefined,
                phone: formData.phone || undefined,
            })
            setDuplicates(res?.candidates ?? [])
        } catch {
            // Радар деградирует молча — не блокирует создание.
            setDuplicates([])
        }
    }

    const handleCreateContact = async (opts?: {
        trashCollisionResolution?: 'restore' | 'create_new'
    }) => {
        if (!pid) return
        if (!createKeyRef.current) createKeyRef.current = newIdempotencyKey()
        setSubmitting(true)
        try {
            const created = await apiCreateContact(
                {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    phone: formData.phone || undefined,
                    email: formData.email || undefined,
                    position: formData.position || undefined,
                    companyIds: formData.companyIds.length ? formData.companyIds : undefined,
                    companyId: formData.companyIds[0] || undefined,
                    source: formData.source || undefined,
                    assigneeId: formData.assigneeId || undefined,
                    // W-6: отдел-владелец принимается ТОЛЬКО здесь, на создании —
                    // в update домен его вычёркивает, дальше только reassign.
                    departmentId: formData.departmentId || undefined,
                    trashCollisionResolution: opts?.trashCollisionResolution,
                },
                { projectId: pid },
                createKeyRef.current,
            )
            notifySuccess(
                opts?.trashCollisionResolution === 'restore'
                    ? 'Контакт восстановлен из корзины'
                    : 'Контакт создан',
            )
            closeDrawer()
            await mutate()
            if (created?.id) navigate(`/contacts/${created.id}`)
        } catch (err) {
            const { message, code } = extractApiError(err)
            if (code === 'TRASH_COLLISION') {
                const restore = window.confirm(
                    `${message}\n\nВосстановить контакт из корзины вместо создания нового?`,
                )
                if (restore) {
                    await handleCreateContact({ trashCollisionResolution: 'restore' })
                    return
                }
            }
            notifyError(message)
        } finally {
            setSubmitting(false)
        }
    }

    const companyOptions = useMemo(
        () =>
            companiesData?.list?.map((c) => ({
                value: c.id,
                label: c.name,
            })) || [],
        [companiesData],
    )

    const memberOptions = useMemo(
        () =>
            membersList.map((m) => ({
                value: m.id,
                label: m.name,
            })) || [],
        [membersList],
    )

    const assigneeFilterOptions = useMemo(
        () => [
            { value: OWNER_SCOPE_UNASSIGNED, label: 'Без ответственного' },
            ...memberOptions,
        ],
        [memberOptions],
    )

    const reassignFromOptions = useMemo(
        () => [
            { value: OWNER_SCOPE_UNASSIGNED, label: 'Без ответственного (осиротевшие)' },
            ...memberOptions,
        ],
        [memberOptions],
    )

    const sourceOptions = useMemo(
        () =>
            dealSourcesList.map((s) => ({
                value: s.name,
                label: s.name,
            })) || [],
        [dealSourcesList],
    )

    // ST-19: проект не выбран.
    if (!pid) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('contacts.list.noProject')}
                    >
                        <PiAddressBookDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Проект не выбран</h4>
                        <p className="text-gray-500 max-w-md">
                            Выберите проект, чтобы просмотреть его контакты.
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-10 No-permission (TODO-370): без contacts:read сервер отдаёт 403 на
    // GET /v1/contacts — показываем экран вместо ошибки загрузки.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Раздел «Контакты» недоступен</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Нужно право на просмотр контактов (contacts:read)
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3>Контакты</h3>
                        <div className="flex items-center gap-2">
                            {/* TODO-378: drawer принимает contactIds[] — одна задача
                                со связями на все выбранные контакты; выбор виден и
                                редактируем в самой форме. */}
                            {selectedContacts.size > 0 && (
                                <HostSlot
                                    id="list.bulk.action"
                                    context={{
                                        entityType: 'contact',
                                        selectedIds: Array.from(selectedContacts),
                                    }}
                                    pending={null}
                                    fallback={
                                        <Tooltip title="Поставить задачу по выбранным контактам">
                                            <span className="inline-flex">
                                                <Button
                                                    variant="solid"
                                                    size="sm"
                                                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                                    icon={<PiListChecksDuotone />}
                                                    onClick={() => setTaskDrawerOpen(true)}
                                                    {...qa('contacts.list.createTask')}
                                                />
                                            </span>
                                        </Tooltip>
                                    }
                                />
                            )}
                            {canWrite && (
                                <Tooltip title="Создать контакт">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => setDrawerOpen(true)}
                                            {...qa('contacts.list.create')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {canImport && (
                                <Tooltip title="Импорт контактов">
                                    <span className="inline-flex">
                                        <Link to="/contacts/import" {...qa('contacts.list.goImport')}>
                                            <Button variant="plain" size="sm" icon={<PiUploadDuotone />} />
                                        </Link>
                                    </span>
                                </Tooltip>
                            )}
                            {/* EL-LIST-18: очередь дублей (gated contacts:manage). */}
                            {canManage && (
                                <Tooltip title="Переназначить все контакты ушедшего ответственного">
                                    <span className="inline-flex">
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiArrowsLeftRightDuotone />}
                                            onClick={() => setReassignFromOpen(true)}
                                            {...qa('contacts.list.reassign')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {canManage && (
                                <Tooltip title="Очередь дублей">
                                    <span className="inline-flex">
                                        <Link to="/contacts/duplicates" {...qa('contacts.list.goDuplicates')}>
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiUsersThreeDuotone />}
                                            />
                                        </Link>
                                    </span>
                                </Tooltip>
                            )}
                            {/* EL-LIST-17: корзина (gated contacts:read). */}
                            <Tooltip title="Корзина">
                                <span className="inline-flex">
                                    <Link to="/contacts/trash" {...qa('contacts.list.goTrash')}>
                                        <Button variant="plain" size="sm" icon={<PiTrashDuotone />} />
                                    </Link>
                                </span>
                            </Tooltip>
                            {canExport && (
                            <Tooltip
                                title={
                                    selectedContacts.size > 0
                                        ? `Экспорт выбранных в CSV (${selectedContacts.size})`
                                        : tableData.query
                                          ? 'Экспорт в CSV по текущему поиску'
                                          : 'Экспорт всех контактов в CSV'
                                }
                            >
                                <span className="inline-flex">
                                    {selectedContacts.size > 0 ? (
                                        <CSVLink
                                            data={exportData}
                                            filename={`контакты_${dayjs().format('YYYY-MM-DD')}.csv`}
                                            className="inline-flex"
                                            {...qa('contacts.list.exportSelected')}
                                        >
                                            <Button variant="plain" size="sm" icon={<PiDownloadDuotone />} />
                                        </CSVLink>
                                    ) : (
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiDownloadDuotone />}
                                            loading={exporting}
                                            disabled={exporting || !pid}
                                            onClick={handleExportAll}
                                            {...qa('contacts.list.exportAll')}
                                        />
                                    )}
                                </span>
                            </Tooltip>
                            )}
                            <Tooltip title="Колонки таблицы">
                                <span className="inline-flex">
                                    <Dropdown
                                        renderTitle={
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiSlidersHorizontalDuotone />}
                                                {...qa('contacts.list.columns')}
                                            />
                                        }
                                        placement="bottom-end"
                                        menuClass="!min-w-[200px] !p-3"
                                    >
                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                            Видимость колонок
                                        </div>
                                        {CONTACT_COLUMN_CONFIG.map((col) => (
                                            <Dropdown.Item key={col.id} variant="custom" className="!p-0">
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleColumnVisibilityChange(
                                                            col.id,
                                                            visibleColumns[col.id] === false,
                                                        )
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            handleColumnVisibilityChange(
                                                                col.id,
                                                                visibleColumns[col.id] === false,
                                                            )
                                                        }
                                                    }}
                                                >
                                                    <Checkbox
                                                        checked={visibleColumns[col.id] !== false}
                                                        readOnly
                                                    />
                                                    <span className="text-sm">{col.label}</span>
                                                </div>
                                            </Dropdown.Item>
                                        ))}
                                    </Dropdown>
                                </span>
                            </Tooltip>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder="Поиск..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={searchInput}
                                onChange={(e) => handleSearch(e.target.value)}
                                {...qa('contacts.list.search')}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('contacts.list.filterSource')}>
                            <Select
                                placeholder="Источник"
                                isClearable
                                options={sourceOptions}
                                value={sourceOptions.find((o) => o.value === tableData.source) || null}
                                onChange={(option) => handleSourceFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('contacts.list.filterSource') }}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('contacts.list.filterAssignee')}>
                            <Select
                                placeholder="Ответственный"
                                isClearable
                                options={assigneeFilterOptions}
                                value={
                                    tableData.ownerScope === OWNER_SCOPE_UNASSIGNED
                                        ? assigneeFilterOptions.find(
                                              (o) => o.value === OWNER_SCOPE_UNASSIGNED,
                                          ) || null
                                        : assigneeFilterOptions.find(
                                              (o) => o.value === tableData.assigneeId,
                                          ) || null
                                }
                                onChange={(option) => handleAssigneeFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('contacts.list.filterAssignee') }}
                            />
                        </div>
                        <div className="w-[200px]" {...qa('contacts.list.filterInactive')}>
                            <Select
                                placeholder="Активность"
                                options={INACTIVE_DAYS_OPTIONS}
                                value={
                                    INACTIVE_DAYS_OPTIONS.find(
                                        (o) => o.value === tableData.inactiveDays,
                                    ) || INACTIVE_DAYS_OPTIONS[0]
                                }
                                onChange={(option) =>
                                    handleInactiveDaysFilter(option?.value || '')
                                }
                                components={{
                                    Option: makeSelectOption('contacts.list.filterInactive'),
                                }}
                                {...qa('contacts.list.filterInactive')}
                            />
                        </div>
                        <div className="w-[180px]">
                            <Input
                                placeholder="Теги (через запятую)"
                                value={tableData.filterTags}
                                onChange={(e) => handleTagsFilter(e.target.value)}
                                {...qa('contacts.list.filterTags')}
                            />
                        </div>
                    </div>

                    {hiddenByPolicy > 0 && !showError && (
                        <div
                            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                            {...qa('contacts.list.hiddenByPolicy')}
                        >
                            Ещё {hiddenByPolicy} контактов скрыто настройками доступа
                        </div>
                    )}

                    {showError ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('contacts.list.error')}
                        >
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">
                                Не удалось загрузить контакты
                            </p>
                            <Button
                                variant="solid"
                                onClick={() => mutate()}
                                {...qa('contacts.list.errorRetry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : showEmpty ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('contacts.list.empty')}
                        >
                            <PiAddressBookDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Контактов ещё нет</p>
                            <p className="text-gray-500 text-sm">
                                Добавьте первый контакт или импортируйте из CSV
                            </p>
                            {canWrite && (
                                <div className="flex items-center gap-2 mt-2">
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        icon={<PiPlusDuotone />}
                                        onClick={() => setDrawerOpen(true)}
                                        {...qa('contacts.list.createEmpty')}
                                    >
                                        Создать контакт
                                    </Button>
                                    {canImport && (
                                        <Link to="/contacts/import" {...qa('contacts.list.importEmpty')}>
                                            <Button icon={<PiUploadDuotone />}>Импорт</Button>
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : showEmptyFilter ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('contacts.list.emptyFilter')}
                        >
                            <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Ничего не найдено</p>
                            <p className="text-gray-500 text-sm">
                                Попробуйте изменить условия поиска
                            </p>
                            <Button
                                variant="plain"
                                onClick={resetFilters}
                                {...qa('contacts.list.resetFilters')}
                            >
                                Сбросить фильтры
                            </Button>
                        </div>
                    ) : (
                        <div {...qa('contacts.list.table')}>
                            <DataTable
                            columns={columns}
                            data={list}
                            loading={isLoading}
                            pagingData={{ total, pageIndex, pageSize }}
                            onPaginationChange={handlePaginationChange}
                            onSelectChange={handleSelectChange}
                            onSort={handleSort}
                            selectable
                            checkboxChecked={(c) => selectedContacts.has(c.id)}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={handleIndeterminateCheckBoxChange}
                            indeterminateCheckboxChecked={(rows) =>
                                rows.length > 0 &&
                                rows.every((r) => selectedContacts.has((r.original as Contact).id))
                            }
                            onRowClick={(c) => navigate(`/contacts/${c.id}`)}
                            paginationQaPrefix="contacts.list.pagination"
                            qaIdPrefix="contacts.list"
                            rowQaKey="contact"
                        />
                        </div>
                    )}
                </div>
            </AdaptiveCard>

            <Drawer
                isOpen={drawerOpen}
                onClose={closeDrawer}
                title="Создать контакт"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={closeDrawer}
                            disabled={submitting}
                            {...qa('contacts.create.cancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={submitting}
                            onClick={handleCreateContact}
                            disabled={
                                submitting ||
                                !formData.firstName ||
                                !formData.lastName ||
                                (!formData.phone && !formData.email)
                            }
                            {...qa('contacts.create.submit')}
                        >
                            Создать
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    {duplicates.length > 0 && (
                        <div
                            className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm"
                            {...qa('contacts.create.duplicateBanner')}
                        >
                            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400 mb-1">
                                <PiWarningCircleDuotone className="w-4 h-4" />
                                Возможные дубли
                            </div>
                            <ul className="space-y-1">
                                {duplicates.map((d) => (
                                    <li
                                        key={d.contactId}
                                        className="flex items-center justify-between gap-2"
                                    >
                                        <span>
                                            {d.displayName} ({d.maskedValue})
                                        </span>
                                        <button
                                            type="button"
                                            className="text-primary underline"
                                            onClick={() => navigate(`/contacts/${d.contactId}`)}
                                            {...qa('contacts.create.duplicateOpen', {
                                                contact: d.contactId,
                                            })}
                                        >
                                            Открыть
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Имя <span className="text-red-500">*</span>
                        </label>
                        <Input
                            {...qa('contacts.create.firstName')}
                            value={formData.firstName}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, firstName: e.target.value }))
                            }
                            placeholder="Введите имя"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Фамилия <span className="text-red-500">*</span>
                        </label>
                        <Input
                            {...qa('contacts.create.lastName')}
                            value={formData.lastName}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, lastName: e.target.value }))
                            }
                            placeholder="Введите фамилию"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Телефон <span className="text-gray-400 text-xs">(или email)</span>
                        </label>
                        <Input
                            {...qa('contacts.create.phone')}
                            value={formData.phone}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, phone: e.target.value }))
                            }
                            onBlur={handleDedupCheck}
                            placeholder="+7 900 000-00-00"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Эл. почта</label>
                        <Input
                            {...qa('contacts.create.email')}
                            type="email"
                            value={formData.email}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, email: e.target.value }))
                            }
                            onBlur={handleDedupCheck}
                            placeholder="email@example.com"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Должность</label>
                        <Input
                            value={formData.position}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, position: e.target.value }))
                            }
                            placeholder="Введите должность"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Компании</label>
                        <Select
                            isMulti
                            placeholder="Выберите компании"
                            options={companyOptions}
                            value={companyOptions.filter((o) => formData.companyIds.includes(o.value))}
                            onChange={(opts) => {
                                const ids = Array.isArray(opts) ? opts.map((o) => o.value) : []
                                setFormData((prev) => ({ ...prev, companyIds: ids }))
                            }}
                            components={{
                                Option: makeSelectOption('contacts.create.companies'),
                            }}
                            {...qa('contacts.create.companies')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Источник</label>
                        <Select
                            placeholder="Выберите источник"
                            isClearable
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === formData.source) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, source: option?.value || '' }))
                            }
                            components={{ Option: makeSelectOption('contacts.create.source') }}
                            {...qa('contacts.create.source')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            placeholder="Выберите ответственного"
                            isClearable
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === formData.assigneeId) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, assigneeId: option?.value || '' }))
                            }
                            components={{ Option: makeSelectOption('contacts.create.assignee') }}
                            {...qa('contacts.create.assignee')}
                        />
                    </div>
                    {/* W-6: отдел-владелец задаётся только при создании (домен
                        вычёркивает departmentId из update) — дальше карточка меняет
                        его через reassign. */}
                    <div>
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
                            value={
                                departmentOptions.find((o) => o.value === formData.departmentId) ||
                                null
                            }
                            onChange={(option) =>
                                setFormData((prev) => ({
                                    ...prev,
                                    departmentId: option?.value || '',
                                }))
                            }
                            components={{ Option: makeSelectOption('contacts.create.department') }}
                            {...qa('contacts.create.department')}
                        />
                    </div>
                </div>
            </Drawer>

            <EntityCreateDrawer
                entityType="task"
                isOpen={taskDrawerOpen}
                onClose={() => setTaskDrawerOpen(false)}
                onSuccess={() => {
                    setTaskDrawerOpen(false)
                    setSelectedContacts(new Set())
                }}
                taskInitialData={
                    selectedContacts.size > 0
                        ? { contactIds: [...selectedContacts] }
                        : undefined
                }
            />
            <Dialog
                isOpen={reassignFromOpen}
                onClose={() => !reassignFromBusy && setReassignFromOpen(false)}
                onRequestClose={() => !reassignFromBusy && setReassignFromOpen(false)}
            >
                <h5 className="mb-4" {...qa('contacts.reassign.heading')}>
                    Переназначение контактов
                </h5>
                <p className="text-sm text-gray-500 mb-4">
                    Все живые контакты, где указанный ответственный — «ушёл», будут переназначены
                    на нового.
                </p>
                <div className="flex flex-col gap-3 mb-4">
                    <div {...qa('contacts.reassign.from')}>
                        <Select
                            placeholder="Ушёл (от кого)"
                            options={reassignFromOptions}
                            value={reassignFromOptions.find((o) => o.value === reassignFromOwnerId) || null}
                            onChange={(o) => setReassignFromOwnerId(o?.value || '')}
                            components={{ Option: makeSelectOption('contacts.reassign.from') }}
                        />
                    </div>
                    <div {...qa('contacts.reassign.to')}>
                        <Select
                            placeholder="Новый ответственный"
                            options={memberOptions.filter((o) => o.value !== reassignFromOwnerId)}
                            value={memberOptions.find((o) => o.value === reassignToOwnerId) || null}
                            onChange={(o) => setReassignToOwnerId(o?.value || '')}
                            components={{ Option: makeSelectOption('contacts.reassign.to') }}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        disabled={reassignFromBusy}
                        onClick={() => setReassignFromOpen(false)}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        loading={reassignFromBusy}
                        disabled={
                            reassignFromBusy ||
                            !reassignFromOwnerId ||
                            !reassignToOwnerId ||
                            reassignFromOwnerId === reassignToOwnerId
                        }
                        onClick={handleBulkReassignFromOwner}
                        {...qa('contacts.reassign.submit')}
                    >
                        Переназначить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default ContactList
