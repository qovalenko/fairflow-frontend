import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useCompanyNames from '@/utils/hooks/useCompanyNames'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { AnimatePresence, motion } from 'framer-motion'
import {
    PiMagnifyingGlassDuotone,
    PiListChecksDuotone,
    PiListDuotone,
    PiKanbanDuotone,
    PiGearSixDuotone,
    PiWarningDuotone,
    PiPlusDuotone,
    PiSlidersHorizontalDuotone,
    PiDownloadDuotone,
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
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Checkbox from '@/components/ui/Checkbox'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import Segment from '@/components/ui/Segment'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import MultiCreateWizard from './MultiCreateWizard'
import HostSlot from '@/components/shared/HostSlot'
import usePermission from '@/utils/hooks/usePermission'
import type { OnSortParam, ColumnDef } from '@/components/shared/DataTable'
import type { Order, OrderType } from '@/@types/crm'
import { apiGetOrders, apiGetOrderTypes, apiExportOrders } from '@/services/CrmService'
import {
    orderStatusConfig,
    normalizeList,
    daysInStage,
    extractError,
    notifyError,
    isModuleDisabledError,
    ModuleDisabledNotice,
} from './orderUtils'
import { qa } from './qa'

const ORDER_COLUMN_CONFIG = [
    { id: 'companyName', label: 'Компания' },
    { id: 'productName', label: 'Продукт' },
    { id: 'status', label: 'Статус' },
    { id: 'stageName', label: 'Стадия' },
    { id: 'staleDays', label: 'Дней в этапе' },
    { id: 'assigneeName', label: 'Ответственный' },
] as const

const ORDER_LIST_TOOLBAR_ANIMATE_KEY = 'crm:orders:list-toolbar-animate'

const STATUS_FILTER_OPTIONS = [
    { value: 'ACTIVE', label: 'Активна' },
    { value: 'SENDING', label: 'Отправка' },
    { value: 'DONE', label: 'Оформлена' },
    { value: 'SEND_ERROR', label: 'Ошибка отправки' },
    { value: 'CANCELLED', label: 'Отменена' },
]

const OrderList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const can = usePermission()
    const canWrite = can('orders', 'write')
    const canExport = can('orders', 'export')
    const canTask = can('activities', 'write')
    const isKanbanView = location.pathname.includes('/kanban')
    const currentView = isKanbanView ? 'kanban' : 'list'
    const [orderDrawerOpen, setOrderDrawerOpen] = useState(false)
    const [multiWizardOpen, setMultiWizardOpen] = useState(false)
    const [multiWizardContext, setMultiWizardContext] = useState<{
        dealId: string
        contactId?: string
        companyId?: string
        productId?: string
    } | null>(null)
    const [orderInitialData, setOrderInitialData] = useState<
        { dealId?: string; contactId?: string; companyId?: string; productId?: string } | undefined
    >(undefined)
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
    const [exporting, setExporting] = useState(false)
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(ORDER_COLUMN_CONFIG.map((c) => [c.id, true])),
    )

    // TODO-272: drill из статистики (срез «Продажи по типам») приходит ссылкой
    // /p/:pid/orders?typeId=<id типа>. Раньше список читал из URL только
    // dealId/contactId/companyId, поэтому ссылка со срезом открывала ПОЛНЫЙ
    // список под видом среза. Фильтр снимается с URL один раз при монтировании
    // (лениво, до первого запроса) — так первый же GET /v1/orders уходит уже с
    // typeId, без мигания неотфильтрованной страницы. Статус/этап через URL
    // намеренно не принимаем: у среза статистики их нет.
    const [tableData, setTableData] = useState(() => ({
        pageIndex: 1,
        pageSize: 10,
        query: '',
        typeId: searchParams.get('typeId') || '',
        status: '',
        staleDays: '',
        sort: { order: '', key: '' },
    }))

    // BX-FIX-6 / FR-PRODUCTS-170: вход из won-сделки или карточки продукта.
    // /orders?dealId=…&contactId=…&companyId=… (DealDetails «Создать продажу»)
    // /orders?productId=… (ProductDetails «Создать продажу»).
    useEffect(() => {
        const dealId = searchParams.get('dealId')
        const productId = searchParams.get('productId') || undefined
        const contactId = searchParams.get('contactId') || undefined
        const companyId = searchParams.get('companyId') || undefined

        if (dealId && canWrite) {
            if (searchParams.get('multi') === '1') {
                setMultiWizardContext({ dealId, contactId, companyId, productId })
                setMultiWizardOpen(true)
            } else {
                setOrderInitialData({ dealId, contactId, companyId })
                setOrderDrawerOpen(true)
            }
            setSearchParams(new URLSearchParams(), { replace: true })
            return
        }

        if (productId && canWrite) {
            setOrderInitialData({ productId })
            setOrderDrawerOpen(true)
            setSearchParams(new URLSearchParams(), { replace: true })
        }
    }, [searchParams, setSearchParams, canWrite])

    const { data, isLoading, error, mutate } = useSWR(
        pid ? ['/api/v1/orders', tableData, pid] : null,
        () =>
            apiGetOrders<{ list: Order[]; total: number }, typeof tableData & { projectId: string }>({
                ...tableData,
                pageIndex: tableData.pageIndex - 1,
                projectId: pid!,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // Типы продаж — для фильтра (project-scoped; ST-3 под-случай «нет типов»).
    const { data: typesData } = useSWR(
        pid ? ['/api/v1/order-types', pid] : null,
        () => apiGetOrderTypes<OrderType[] | { list: OrderType[] }>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const typeOptions = useMemo(
        () => normalizeList<OrderType>(typesData).map((t) => ({ value: t.id, label: t.name })),
        [typesData],
    )

    const list = data?.list || []
    const total = data?.total || 0
    const { pageIndex, pageSize } = tableData

    // T-010: продажи возвращают companyId, но companyName пустой → резолвим
    // компанию-покупателя в название (переиспользуемый хук по проекту).
    const { companyName: resolveCompanyName } = useCompanyNames(pid ?? undefined)
    const orderCompanyName = (order: Order): string =>
        order.companyName || resolveCompanyName(order.companyId) || ''

    const hasActiveFilters = Boolean(
        tableData.query || tableData.typeId || tableData.status || tableData.staleDays,
    )

    const resetFilters = () =>
        setTableData((prev) => ({
            ...prev,
            query: '',
            typeId: '',
            status: '',
            staleDays: '',
            pageIndex: 1,
        }))

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

    const handleCheckBoxChange = (checked: boolean, order: Order) => {
        setSelectedOrders((prev) => {
            const next = new Set(prev)
            if (checked) next.add(order.id)
            else next.delete(order.id)
            return next
        })
    }

    const handleIndeterminateCheckBoxChange = (checked: boolean, rows: { original: Order }[]) => {
        setSelectedOrders((prev) => {
            const next = new Set(prev)
            rows.forEach((row) => {
                if (checked) next.add(row.original.id)
                else next.delete(row.original.id)
            })
            return next
        })
    }

    const exportData = useMemo(() => {
        const toExport = selectedOrders.size > 0 ? list.filter((o) => selectedOrders.has(o.id)) : list
        return toExport.map((o) => ({
            Номер: o.number ?? '',
            Компания: orderCompanyName(o),
            Продукт: o.productName ?? o.typeName ?? '',
            Статус: orderStatusConfig(o.status).label,
            Стадия: o.stageName ?? '',
            Ответственный: o.assigneeName ?? '',
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list, selectedOrders, resolveCompanyName])

    /**
     * TODO-409: серверный экспорт — GET /v1/orders/export (BFF `exportOrders`,
     * право `orders:export`, тот же visibility-scope, что у списка). Выгружается
     * весь отфильтрованный набор, а не текущая страница таблицы, но не больше
     * серверного потолка (ORDERS_EXPORT_MAX_ROWS = 10 000 строк).
     *
     * Усечение НЕ проглатываем: пользователь, скачавший обрезанный файл молча,
     * примет деловое решение по неполным данным. Сервер отдаёт признак в
     * заголовках `X-Export-*` (см. apiExportOrders) — показываем предупреждение.
     * `staleDays` серверная ручка не принимает — об этом честно предупреждаем в меню.
     */
    const handleServerExport = async () => {
        if (!pid || exporting) return
        setExporting(true)
        try {
            const { blob, truncated, rowCount, total } = await apiExportOrders({
                format: 'csv',
                query: tableData.query || undefined,
                typeId: tableData.typeId || undefined,
                status: tableData.status || undefined,
            })
            if (truncated) {
                toast.push(
                    <Notification title="Внимание" type="warning" {...qa('orders.list.exportTruncated')}>
                        {`В файл попали первые ${rowCount} строк из ${total}: сервер ограничивает ` +
                            'размер выгрузки. Уточните фильтры и выгрузите частями.'}
                    </Notification>,
                    { placement: 'top-center' },
                )
            }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `продажи_${dayjs().format('YYYY-MM-DD')}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (e) {
            const status = (e as { response?: { status?: number } })?.response?.status
            notifyError(
                status === 403
                    ? 'Нет права на экспорт продаж (orders:export).'
                    : extractError(e, 'Не удалось выгрузить продажи'),
            )
        } finally {
            setExporting(false)
        }
    }

    const handleSearch = (value: string) => {
        setTableData((prev) => ({ ...prev, query: value, pageIndex: 1 }))
    }

    const navigateToView = (value: string) => {
        if (value === 'kanban') navigate('/orders/kanban')
        else if (value === 'types') navigate('/orders/types')
        else navigate('/orders')
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(currentView, navigateToView)
    const shouldAnimateListToolbarRef = useRef(
        typeof window !== 'undefined' &&
            window.sessionStorage.getItem(ORDER_LIST_TOOLBAR_ANIMATE_KEY) === '1',
    )

    if (shouldAnimateListToolbarRef.current) {
        window.sessionStorage.removeItem(ORDER_LIST_TOOLBAR_ANIMATE_KEY)
    }

    const handleColumnVisibilityChange = (colId: string, checked: boolean) => {
        setVisibleColumns((prev) => {
            const next = { ...prev, [colId]: checked }
            const visibleCount = Object.values(next).filter(Boolean).length
            if (!checked && visibleCount <= 1) return prev
            return next
        })
    }

    const allColumns: ColumnDef<Order>[] = useMemo(
        () => [
            {
                id: 'companyName',
                header: 'Компания',
                accessorKey: 'companyName',
                cell: ({ row }) => {
                    const order = row.original
                    const companyName = orderCompanyName(order)
                    if (!companyName) {
                        return (
                            <span className="text-gray-400" {...qa('orders.list.row', { order: order.id })}>
                                —
                            </span>
                        )
                    }
                    const companyLink = order.companyId ? (
                        <span
                            className="text-primary cursor-pointer"
                            {...qa('orders.list.companyLink', { order: order.id })}
                            onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/companies/${order.companyId}`)
                            }}
                        >
                            {companyName}
                        </span>
                    ) : (
                        <span {...qa('orders.list.row', { order: order.id })}>{companyName}</span>
                    )
                    return (
                        <motion.div
                            layout
                            className="flex items-center gap-2"
                            transition={{ layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }}
                        >
                            {order.hasDrift && (
                                <Tooltip title="Реквизиты изменились — откройте продажу, чтобы принять">
                                    <span
                                        className="text-amber-500 inline-flex cursor-help shrink-0"
                                        {...qa('orders.list.driftIcon', { order: order.id })}
                                    >
                                        <PiWarningDuotone className="w-4 h-4" />
                                    </span>
                                </Tooltip>
                            )}
                            {companyLink}
                        </motion.div>
                    )
                },
            },
            {
                id: 'productName',
                header: 'Продукт',
                accessorKey: 'productName',
                cell: ({ row }) => {
                    const product = row.original.productName ?? row.original.typeName
                    if (!product) return <span className="text-gray-400">—</span>
                    return (
                        <Tag className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            {product}
                        </Tag>
                    )
                },
            },
            {
                id: 'status',
                header: 'Статус',
                accessorKey: 'status',
                cell: ({ row }) => {
                    const config = orderStatusConfig(row.original.status)
                    return <Tag className={config.className}>{config.label}</Tag>
                },
            },
            {
                id: 'stageName',
                header: 'Стадия',
                accessorKey: 'stageName',
                cell: ({ row }) => (
                    <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {row.original.stageName}
                    </Tag>
                ),
            },
            {
                // EL-LIST-COL-STALE (TO-BE FR-MORD-16): дней в этапе из stageChangedAt/updatedAt.
                id: 'staleDays',
                header: 'Дней в этапе',
                accessorKey: 'updatedAt',
                cell: ({ row }) => {
                    const o = row.original
                    // FE-гард (FR-MORD-16): orders отдаёт метку в мс; при null/невалиде/
                    // будущем — прочерк, а не отрицательные миллионы дней. См. daysInStage().
                    const days = daysInStage(o.stageChangedAt ?? o.updatedAt)
                    if (days == null) return <span className="text-gray-400">—</span>
                    const stale = days >= 7
                    return (
                        <span className={stale ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                            {days} дн.
                        </span>
                    )
                },
            },
            {
                id: 'assigneeName',
                header: 'Ответственный',
                accessorKey: 'assigneeName',
                cell: ({ row }) => {
                    const name = row.original.assigneeName
                    if (!name) return <span>—</span>
                    const initials = name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                    return (
                        <motion.div
                            layout
                            className="flex items-center gap-2"
                            transition={{ layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }}
                        >
                            <Avatar
                                size={28}
                                className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex-shrink-0"
                            >
                                {initials}
                            </Avatar>
                            <span className="truncate">{name}</span>
                        </motion.div>
                    )
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
                                    {...qa('orders.list.rowMenu', { order: row.original.id })}
                                />
                            }
                            placement="bottom-end"
                        >
                            <HostSlot
                                id="list.action.menu"
                                context={{
                                    entityType: 'order',
                                    recordId: row.original.id,
                                }}
                                pending={null}
                            />
                        </Dropdown>
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [navigate, resolveCompanyName],
    )

    const columns = useMemo(
        () =>
            allColumns.filter((col) => {
                const colId = (col as { id?: string }).id ?? (col as { accessorKey?: string }).accessorKey
                return colId ? visibleColumns[colId] !== false : true
            }),
        [allColumns, visibleColumns],
    )

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3>Продажи</h3>
                            <p className="text-sm text-gray-500 mt-1">Продажи создаются из карточки сделки</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedOrders.size > 0 && (
                                <span
                                    className="contents"
                                    {...qa('orders.list.selectedCount', { count: selectedOrders.size })}
                                >
                                    <HostSlot
                                        id="list.bulk.action"
                                        context={{
                                            entityType: 'order',
                                            selectedIds: Array.from(selectedOrders),
                                        }}
                                        pending={null}
                                        fallback={
                                            canTask ? (
                                                <Tooltip title="Поставить задачу">
                                                    <span className="inline-flex">
                                                        <Button
                                                            variant="solid"
                                                            size="sm"
                                                            className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                                            icon={<PiListChecksDuotone />}
                                                            {...qa('orders.list.bulkCreateTask')}
                                                            onClick={() => setTaskDrawerOpen(true)}
                                                        />
                                                    </span>
                                                </Tooltip>
                                            ) : null
                                        }
                                    />
                                </span>
                            )}
                            {canWrite && (
                                <Tooltip title="Создать продажу">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            {...qa('orders.list.create')}
                                            onClick={() => { setOrderInitialData(undefined); setOrderDrawerOpen(true) }}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            <AnimatePresence>
                                {segmentValue === 'list' && (
                                    <motion.div
                                        key="order-list-extra-actions"
                                        className="flex items-center gap-2"
                                        initial={
                                            shouldAnimateListToolbarRef.current
                                                ? { opacity: 0, x: 12, scale: 0.96 }
                                                : false
                                        }
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: 12, scale: 0.96 }}
                                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                        onAnimationComplete={() => {
                                            shouldAnimateListToolbarRef.current = false
                                        }}
                                    >
                                        {/* TODO-409: экспорт — явный выбор источника.
                                            «По фильтрам» уходит на серверную ручку
                                            GET /v1/orders/export (весь отфильтрованный набор
                                            под тем же visibility-scope), «выделенные» —
                                            локальный CSV по отмеченным строкам. */}
                                        {canExport && (
                                            <Dropdown
                                                renderTitle={
                                                    <Tooltip title="Экспорт продаж">
                                                        <span className="inline-flex" {...qa('orders.list.export')}>
                                                            <Button
                                                                variant="plain"
                                                                size="sm"
                                                                aria-label="Экспорт продаж"
                                                                loading={exporting}
                                                                icon={<PiDownloadDuotone />}
                                                            />
                                                        </span>
                                                    </Tooltip>
                                                }
                                                placement="bottom-end"
                                                menuClass="!min-w-[260px]"
                                            >
                                                <Dropdown.Item
                                                    eventKey="export-filtered"
                                                    disabled={exporting}
                                                    onClick={handleServerExport}
                                                    {...qa('orders.list.exportFiltered')}
                                                >
                                                    По текущим фильтрам (весь список, до
                                                    10 000 строк)
                                                </Dropdown.Item>
                                                <Dropdown.Item variant="custom" className="!p-0">
                                                    {selectedOrders.size > 0 ? (
                                                        <CSVLink
                                                            data={exportData}
                                                            filename={`продажи_${dayjs().format('YYYY-MM-DD')}.csv`}
                                                            className="block px-2 py-1.5 w-full hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                            {...qa('orders.list.exportSelected')}
                                                        >
                                                            {`Только выделенные (${selectedOrders.size})`}
                                                        </CSVLink>
                                                    ) : (
                                                        <span className="block px-2 py-1.5 w-full text-gray-400">
                                                            Только выделенные — отметьте строки
                                                        </span>
                                                    )}
                                                </Dropdown.Item>
                                                {tableData.staleDays ? (
                                                    <div className="px-2 pt-1 pb-2 text-xs text-amber-600 dark:text-amber-400 max-w-[260px]">
                                                        Фильтр «дней в этапе» сервер к выгрузке не
                                                        применяет — в файл попадут продажи по
                                                        остальным фильтрам.
                                                    </div>
                                                ) : null}
                                            </Dropdown>
                                        )}
                                        <Tooltip title="Колонки таблицы">
                                            <span className="inline-flex">
                                                <Dropdown
                                                    renderTitle={
                                                        <Button
                                                            variant="plain"
                                                            size="sm"
                                                            icon={<PiSlidersHorizontalDuotone />}
                                                            {...qa('orders.list.columnsToggle')}
                                                        />
                                                    }
                                                    placement="bottom-end"
                                                    menuClass="!min-w-[200px] !p-3"
                                                >
                                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                                        Видимость колонок
                                                    </div>
                                                    {ORDER_COLUMN_CONFIG.map((col) => (
                                                        <Dropdown.Item key={col.id} variant="custom" className="!p-0">
                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                {...qa('orders.list.columnToggle', { column: col.id })}
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
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <Tooltip title="Типы продаж">
                                <span className="inline-flex">
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        icon={<PiGearSixDuotone className="w-4 h-4" />}
                                        {...qa('orders.list.typesGear')}
                                        onClick={() => navigate('/orders/types')}
                                    />
                                </span>
                            </Tooltip>
                            <Segment value={segmentValue} onChange={(val) => handleViewToggle(val as string)} size="sm">
                                <Segment.Item value="list">
                                    <div className="flex items-center gap-1" {...qa('orders.list.viewList')}>
                                        <PiListDuotone className="w-4 h-4" />
                                        <span>Список</span>
                                    </div>
                                </Segment.Item>
                                <Segment.Item value="kanban">
                                    <div className="flex items-center gap-1" {...qa('orders.list.viewKanban')}>
                                        <PiKanbanDuotone className="w-4 h-4" />
                                        <span>Доска</span>
                                    </div>
                                </Segment.Item>
                            </Segment>
                        </div>
                    </div>

                    {/* EL-LIST-SEARCH + EL-LIST-FILTERS (FR-MORD-31/32) */}
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px] max-w-md">
                            <Input
                                placeholder="Поиск по номеру, контакту, компании..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={tableData.query}
                                onChange={(e) => handleSearch(e.target.value)}
                                {...qa('orders.list.search')}
                            />
                        </div>
                        <div className="w-[200px]" {...qa('orders.list.filterType')}>
                            <Select
                                placeholder="Тип продажи"
                                isClearable
                                options={typeOptions}
                                value={typeOptions.find((o) => o.value === tableData.typeId) || null}
                                onChange={(opt) =>
                                    setTableData((p) => ({ ...p, typeId: opt?.value || '', pageIndex: 1 }))
                                }
                            />
                        </div>
                        <div className="w-[180px]" {...qa('orders.list.filterStatus')}>
                            <Select
                                placeholder="Статус"
                                isClearable
                                options={STATUS_FILTER_OPTIONS}
                                value={STATUS_FILTER_OPTIONS.find((o) => o.value === tableData.status) || null}
                                onChange={(opt) =>
                                    setTableData((p) => ({ ...p, status: opt?.value || '', pageIndex: 1 }))
                                }
                            />
                        </div>
                        <div className="w-[180px]" {...qa('orders.list.filterStaleDays')}>
                            <Input
                                type="number"
                                placeholder="В этапе более (дней)"
                                value={tableData.staleDays}
                                onChange={(e) =>
                                    setTableData((p) => ({ ...p, staleDays: e.target.value, pageIndex: 1 }))
                                }
                            />
                        </div>
                    </div>

                    {/* ST-19: проект не выбран. */}
                    {!pid ? (
                        <div className="text-center py-10" {...qa('orders.list.noProject')}>
                            <p className="text-gray-500 mb-1">Проект не выбран</p>
                            <p className="text-sm text-gray-400">
                                Выберите или создайте проект, чтобы работать с продажами.
                            </p>
                        </div>
                    ) : error && !isLoading && isModuleDisabledError(error) ? (
                        /* TODO-416 / ST-17: раздел выключен в проекте (403 MODULE_DISABLED).
                           Ретрай бессмысленен — вместо «Повторить» CTA в настройки модулей. */
                        <div {...qa('orders.list.moduleDisabled')}>
                            <ModuleDisabledNotice text="Продажи станут доступны после включения модуля «Продажи» в настройках проекта." />
                        </div>
                    ) : error && !isLoading ? (
                        /* ST-6: ошибка загрузки → сообщение + retry. */
                        <div className="text-center py-10">
                            <p className="text-gray-500">Не удалось загрузить продажи</p>
                            <Button
                                variant="solid"
                                color="primary"
                                className="mt-4"
                                {...qa('orders.list.retry')}
                                onClick={() => mutate()}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : !isLoading && list.length === 0 ? (
                        /* ST-3 (нет продаж) vs ST-4 (отфильтровано). */
                        hasActiveFilters ? (
                            <div className="text-center py-10">
                                <p className="text-gray-500">По заданным фильтрам ничего не найдено</p>
                                <Button
                                    variant="plain"
                                    className="mt-3"
                                    {...qa('orders.list.resetFilters')}
                                    onClick={resetFilters}
                                >
                                    Сбросить фильтры
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center py-10" {...qa('orders.list.empty')}>
                                <p className="text-gray-500 mb-1">Продаж пока нет</p>
                                <p className="text-sm text-gray-400 mb-4">
                                    Продажи создаются из карточки сделки. Можно также создать вручную или
                                    импортировать.
                                </p>
                                {canWrite && (
                                    <div className="flex justify-center gap-2">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            icon={<PiPlusDuotone />}
                                            {...qa('orders.list.createEmpty')}
                                            onClick={() => { setOrderInitialData(undefined); setOrderDrawerOpen(true) }}
                                        >
                                            Создать продажу
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <DataTable
                            columns={columns}
                            data={list}
                            loading={isLoading}
                            pagingData={{ total, pageIndex, pageSize }}
                            onPaginationChange={handlePaginationChange}
                            onSelectChange={handleSelectChange}
                            onSort={handleSort}
                            selectable
                            checkboxChecked={(o) => selectedOrders.has(o.id)}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={handleIndeterminateCheckBoxChange}
                            indeterminateCheckboxChecked={(rows) =>
                                rows.length > 0 && rows.every((r) => selectedOrders.has((r.original as Order).id))
                            }
                            onRowClick={(order) => navigate(`/orders/${order.id}`)}
                            qaIdPrefix="orders.list"
                            rowQaKey="order"
                        />
                    )}
                </div>
            </AdaptiveCard>
            <EntityCreateDrawer
                entityType="order"
                isOpen={orderDrawerOpen}
                orderInitialData={orderInitialData}
                onClose={() => {
                    setOrderDrawerOpen(false)
                    setOrderInitialData(undefined)
                }}
                onSuccess={() => {
                    setOrderDrawerOpen(false)
                    setOrderInitialData(undefined)
                    setTableData((p) => ({ ...p, pageIndex: 1 }))
                    mutate()
                }}
            />
            {pid && multiWizardContext && (
                <MultiCreateWizard
                    isOpen={multiWizardOpen}
                    projectId={pid}
                    context={multiWizardContext}
                    onClose={() => {
                        setMultiWizardOpen(false)
                        setMultiWizardContext(null)
                    }}
                    onDone={() => {
                        setTableData((p) => ({ ...p, pageIndex: 1 }))
                        mutate()
                    }}
                />
            )}
            <EntityCreateDrawer
                entityType="task"
                isOpen={taskDrawerOpen}
                onClose={() => setTaskDrawerOpen(false)}
                onSuccess={() => {
                    setTaskDrawerOpen(false)
                    setSelectedOrders(new Set())
                }}
                taskInitialData={
                    selectedOrders.size > 0 ? { orderId: list.find((o) => selectedOrders.has(o.id))?.id } : undefined
                }
            />
        </Container>
    )
}

export default OrderList
