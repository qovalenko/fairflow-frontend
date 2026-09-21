import {
    Children,
    useMemo,
    useRef,
    useEffect,
    useState,
    useImperativeHandle,
} from 'react'
import classNames from 'classnames'
import Table from '@/components/ui/Table'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import TableRowSkeleton from './loaders/TableRowSkeleton'
import Loading from './Loading'
import FileNotFound from '@/assets/svg/FileNotFound'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
    ColumnDef,
    ColumnSort,
    Row,
    CellContext,
} from '@tanstack/react-table'
import type { TableProps } from '@/components/ui/Table'
import type { SkeletonProps } from '@/components/ui/Skeleton'
import type { Ref, ChangeEvent, ReactNode, MouseEvent } from 'react'
import type { CheckboxProps } from '@/components/ui/Checkbox'
import { nextColumnSortState } from './list-sort-cycle'
import { qa } from '@/shared/qa'
import type { QaAttributes } from '@/shared/qa'
import type { Column } from '@tanstack/react-table'

export type OnSortParam = { order: 'asc' | 'desc' | ''; key: string | number }

type DataTableProps<T> = {
    columns: ColumnDef<T>[]
    customNoDataIcon?: ReactNode
    data?: unknown[]
    onRowClick?: (row: T) => void
    loading?: boolean
    noData?: boolean
    instanceId?: string
    onCheckBoxChange?: (checked: boolean, row: T) => void
    onIndeterminateCheckBoxChange?: (checked: boolean, rows: Row<T>[]) => void
    onPaginationChange?: (page: number) => void
    onSelectChange?: (num: number) => void
    onSort?: (sort: OnSortParam) => void
    pageSizes?: number[]
    selectable?: boolean
    skeletonAvatarColumns?: number[]
    skeletonAvatarProps?: SkeletonProps
    pagingData?: {
        total: number
        pageIndex: number
        pageSize: number
    }
    checkboxChecked?: (row: T) => boolean
    indeterminateCheckboxChecked?: (row: Row<T>[]) => boolean
    /** E2e qa-id prefix for pagination controls (e.g. `deals.list.pagination`). */
    paginationQaPrefix?: string
    /**
     * Префикс data-qa-id для пагинации (T-028), например `companies.list` →
     * `companies.list.pagination.next`. Экран-владелец передаёт его сам: DataTable
     * живёт в host, но собирается внутри каждого ремоута, а `__QA_IDS_ENABLED__`
     * определён не у всех — флаг здесь не читаем, гейтит вызывающая сторона.
     */
    qaScope?: string
    /**
     * Префикс data-qa-id для управляющих элементов таблицы (`<prefix>.selectAll`,
     * `<prefix>.rowCheckbox`, `<prefix>.pagination`, `<prefix>.pageSize`).
     * Не задан — атрибуты не проставляются, поведение прежнее.
     */
    qaIdPrefix?: string
    /**
     * Имя сущности строки: `rowQaKey="activity"` добавляет к чекбоксу строки
     * `data-qa-activity="<row.id>"`, чтобы e2e адресовал строку по id, a не по
     * позиции. Работает только вместе с `qaIdPrefix`.
     */
    rowQaKey?: string
    /** When set, adds data-qa-id on pagination next control (e2e). */
    paginationQaId?: string
    ref?: Ref<DataTableResetHandle | HTMLTableElement>
} & TableProps

type CheckBoxChangeEvent = ChangeEvent<HTMLInputElement>

interface IndeterminateCheckboxProps extends Omit<CheckboxProps, 'onChange'> {
    onChange: (event: CheckBoxChangeEvent) => void
    indeterminate: boolean
    onCheckBoxChange?: (event: CheckBoxChangeEvent) => void
    onIndeterminateCheckBoxChange?: (event: CheckBoxChangeEvent) => void
}

const { Tr, Th, Td, THead, TBody, Sorter } = Table

const NO_QA: QaAttributes = {}

const toSafeNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    if (
        value &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        'unsigned' in value
    ) {
        const raw = value as { low?: unknown; high?: unknown }
        const low = typeof raw.low === 'number' ? raw.low : Number(raw.low)
        const high = typeof raw.high === 'number' ? raw.high : Number(raw.high)
        if (Number.isFinite(low) && Number.isFinite(high)) {
            const lo = low >>> 0
            const n = high * 0x1_0000_0000 + lo
            if (Number.isFinite(n)) return n
        }
    }
    return fallback
}

const IndeterminateCheckbox = (props: IndeterminateCheckboxProps) => {
    const {
        indeterminate,
        onChange,
        onCheckBoxChange,
        onIndeterminateCheckBoxChange,
        ...rest
    } = props

    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (typeof indeterminate === 'boolean' && ref.current) {
            ref.current.indeterminate = !rest.checked && indeterminate
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, indeterminate])

    const handleChange = (e: CheckBoxChangeEvent) => {
        onChange(e)
        onCheckBoxChange?.(e)
        onIndeterminateCheckBoxChange?.(e)
    }

    return (
        <Checkbox
            ref={ref}
            className="mb-0"
            onChange={(_, e) => handleChange(e)}
            {...rest}
        />
    )
}

export type DataTableResetHandle = {
    resetSorting: () => void
    resetSelected: () => void
}

function DataTable<T>(props: DataTableProps<T>) {
    const {
        skeletonAvatarColumns,
        columns: columnsProp = [],
        data = [],
        onRowClick,
        customNoDataIcon,
        loading,
        noData,
        onCheckBoxChange,
        onIndeterminateCheckBoxChange,
        onPaginationChange,
        onSelectChange,
        onSort,
        pageSizes = [10, 25, 50, 100],
        selectable = false,
        skeletonAvatarProps,
        pagingData = {
            total: 0,
            pageIndex: 1,
            pageSize: 10,
        },
        checkboxChecked,
        indeterminateCheckboxChecked,
        paginationQaPrefix,
        instanceId = 'data-table',
        qaScope,
        qaIdPrefix,
        rowQaKey,
        paginationQaId,
        ref,
        ...rest
    } = props

    const paginationQaScope = qaScope ? `${qaScope}.pagination` : undefined

    const qaId = (element: string) =>
        qaIdPrefix ? qa(`${qaIdPrefix}.${element}`) : NO_QA

    const rowQaId = (element: string, original: unknown) => {
        if (!qaIdPrefix) return NO_QA
        const id = (original as { id?: unknown } | null)?.id
        return qa(
            `${qaIdPrefix}.${element}`,
            rowQaKey && id !== undefined && id !== null
                ? { [rowQaKey]: String(id) }
                : undefined,
        )
    }

    const pageSize = toSafeNumber(pagingData.pageSize, 10)
    const pageIndex = toSafeNumber(pagingData.pageIndex, 1)
    const total = toSafeNumber(pagingData.total, 0)
    const pageCount = pageSize > 0 ? Math.ceil(total / pageSize) : 0

    const [sorting, setSorting] = useState<ColumnSort[] | null>(null)

    const pageSizeOption = useMemo(
        () =>
            pageSizes.map((number) => ({
                value: number,
                label: String(number),
            })),
        [pageSizes],
    )

    useEffect(() => {
        if (Array.isArray(sorting)) {
            const sortOrder =
                sorting.length > 0 ? (sorting[0].desc ? 'desc' : 'asc') : ''
            const id = sorting.length > 0 ? sorting[0].id : ''
            onSort?.({ order: sortOrder, key: id })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sorting])

    const handleIndeterminateCheckBoxChange = (
        checked: boolean,
        rows: Row<T>[],
    ) => {
        if (!loading) {
            onIndeterminateCheckBoxChange?.(checked, rows)
        }
    }

    const handleCheckBoxChange = (checked: boolean, row: T) => {
        if (!loading) {
            onCheckBoxChange?.(checked, row)
        }
    }

    const finalColumns: ColumnDef<T>[] = useMemo(() => {
        const columns = columnsProp

        if (selectable) {
            return [
                {
                    id: 'select',
                    size: 50,
                    maxSize: 50,
                    enableResizing: false,
                    header: ({ table }) => (
                        <IndeterminateCheckbox
                            {...qaId('selectAll')}
                            checked={
                                indeterminateCheckboxChecked
                                    ? indeterminateCheckboxChecked(
                                          table.getRowModel().rows,
                                      )
                                    : table.getIsAllRowsSelected()
                            }
                            indeterminate={table.getIsSomeRowsSelected()}
                            onChange={table.getToggleAllRowsSelectedHandler()}
                            onIndeterminateCheckBoxChange={(e) => {
                                handleIndeterminateCheckBoxChange(
                                    e.target.checked,
                                    table.getRowModel().rows,
                                )
                            }}
                        />
                    ),
                    cell: ({ row }) => (
                        <div onClick={(e) => e.stopPropagation()}>
                            <IndeterminateCheckbox
                            {...rowQaId('rowCheckbox', row.original)}
                            checked={
                                checkboxChecked
                                    ? checkboxChecked(row.original)
                                    : row.getIsSelected()
                            }
                            disabled={!row.getCanSelect()}
                            indeterminate={row.getIsSomeSelected()}
                            onChange={row.getToggleSelectedHandler()}
                            onCheckBoxChange={(e) =>
                                handleCheckBoxChange(
                                    e.target.checked,
                                    row.original,
                                )
                            }
                        />
                        </div>
                    ),
                },
                ...columns,
            ]
        }
        return columns
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnsProp, selectable, loading, checkboxChecked, qaIdPrefix, rowQaKey])

    const table = useReactTable({
        data,
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        columns: finalColumns as ColumnDef<unknown | object | any[], any>[],
        enableColumnResizing: false,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualPagination: true,
        manualSorting: true,
        onSortingChange: (sorter) => {
            setSorting(sorter as ColumnSort[])
        },
        state: {
            sorting: sorting as ColumnSort[],
        },
    })

    const resetSorting = () => {
        table.resetSorting()
    }

    const resetSelected = () => {
        table.resetRowSelection(true)
    }

    useImperativeHandle(ref, () => ({
        resetSorting,
        resetSelected,
    }))

    const handlePaginationChange = (page: number) => {
        if (!loading) {
            resetSelected()
            onPaginationChange?.(page)
        }
    }

    const handleSelectChange = (value?: number) => {
        if (!loading) {
            onSelectChange?.(Number(value))
        }
    }

    const handleHeaderSort =
        (column: Column<unknown, unknown>) => (e: MouseEvent) => {
            if (!column.getCanSort() || loading) return
            const current = column.getIsSorted() as false | 'asc' | 'desc'
            const next = nextColumnSortState(current)
            if (next === false) {
                setSorting([])
            } else {
                setSorting([{ id: column.id, desc: next === 'desc' }])
            }
            e.preventDefault()
        }

    const renderWithKeys = (node: ReactNode) => Children.toArray(node)

    return (
        <Loading loading={Boolean(loading && data.length !== 0)} type="cover">
            {/* Колонки имеют minWidth = getSize(); когда их сумма шире карточки, скроллим
                по горизонтали, а не обрезаем правые колонки. */}
            <div className="overflow-x-auto">
            <Table {...rest} style={{ tableLayout: 'fixed', ...(rest as { style?: React.CSSProperties }).style }}>
                <THead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <Tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <Th
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        style={{
                                            width: header.getSize(),
                                            minWidth: header.getSize(),
                                            position: 'relative',
                                        }}
                                    >
                                        {header.isPlaceholder ? null : (
                                            <>
                                                <div
                                                    className={classNames(
                                                        header.column.getCanSort() &&
                                                            'cursor-pointer select-none point',
                                                        loading &&
                                                            'pointer-events-none',
                                                        header.column.getIsSorted() &&
                                                            'text-primary font-semibold',
                                                    )}
                                                    onClick={handleHeaderSort(header.column)}
                                                    {...(header.column.getCanSort() &&
                                                    qaIdPrefix
                                                        ? qa(`${qaIdPrefix}.sort`, {
                                                              column: header.column.id,
                                                          })
                                                        : NO_QA)}
                                                >
                                                    {renderWithKeys(
                                                        flexRender(
                                                            header.column
                                                                .columnDef
                                                                .header,
                                                            header.getContext(),
                                                        ),
                                                    )}
                                                    {header.column.getCanSort() && (
                                                        <Sorter
                                                            sort={header.column.getIsSorted()}
                                                        />
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </Th>
                                )
                            })}
                        </Tr>
                    ))}
                </THead>
                {loading && data.length === 0 ? (
                    <TableRowSkeleton
                        {...qaId('loading')}
                        columns={(finalColumns as Array<T>).length}
                        rows={pagingData.pageSize}
                        avatarInColumns={skeletonAvatarColumns}
                        avatarProps={skeletonAvatarProps}
                    />
                ) : (
                    <TBody>
                        {noData ? (
                            <Tr>
                                <Td
                                    className="hover:bg-transparent"
                                    colSpan={finalColumns.length}
                                >
                                    <div className="flex flex-col items-center gap-4">
                                        {customNoDataIcon ? (
                                            customNoDataIcon
                                        ) : (
                                            <>
                                                <FileNotFound />
                                                <span className="font-semibold">
                                                    Нет данных
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </Td>
                            </Tr>
                        ) : (
                            table
                                .getRowModel()
                                .rows.slice(0, pageSize)
                                .map((row) => {
                                    return (
                                        <Tr
                                            key={row.id}
                                            className={
                                                onRowClick
                                                    ? 'cursor-pointer hover:bg-primary-subtle'
                                                    : undefined
                                            }
                                            onClick={
                                                onRowClick
                                                    ? () => onRowClick(row.original as T)
                                                    : undefined
                                            }
                                        >
                                            {row
                                                .getVisibleCells()
                                                .map((cell) => {
                                                    return (
                                                        <Td
                                                            key={cell.id}
                                                            style={{
                                                                width: cell.column.getSize(),
                                                                minWidth: cell.column.getSize(),
                                                            }}
                                                        >
                                                            {renderWithKeys(
                                                                flexRender(
                                                                    cell.column
                                                                        .columnDef
                                                                        .cell,
                                                                    cell.getContext(),
                                                                ),
                                                            )}
                                                        </Td>
                                                    )
                                                })}
                                        </Tr>
                                    )
                                })
                        )}
                    </TBody>
                )}
            </Table>
            </div>
            <div className="flex items-center justify-between mt-4">
                {/* Обёртка нужна только под data-qa-id: Pagination своих
                    DOM-пропсов не принимает, кнопки prev/next e2e ищет внутри. */}
                <div {...qaId('pagination')}>
                    <Pagination
                        displayTotal
                        pageSize={pageSize}
                        currentPage={pageIndex}
                        total={total}
                        qaScope={paginationQaScope}
                        onChange={handlePaginationChange}
                        qaPrefix={paginationQaPrefix}
                        nextQa={paginationQaId ? qa(paginationQaId) : undefined}
                    />
                    {qaIdPrefix && pageCount > pageIndex ? (
                        <button
                            type="button"
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden
                            {...qaId('pageNext')}
                            onClick={() => handlePaginationChange(pageIndex + 1)}
                        />
                    ) : null}
                    {qaIdPrefix && pageIndex > 1 ? (
                        <button
                            type="button"
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden
                            {...qaId('pagePrev')}
                            onClick={() => handlePaginationChange(pageIndex - 1)}
                        />
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        Показывать по:
                    </span>
                    {/* Select — react-select: data-атрибуты внутрь DOM не доходят,
                        qa-id вешаем на обёртку. */}
                    <div
                        style={{ minWidth: 70 }}
                        {...qaId('pageSize')}
                        data-qa-id={
                            paginationQaScope
                                ? `${paginationQaScope}.pageSize`
                                : undefined
                        }
                    >
                        <Select
                            instanceId={instanceId}
                            size="sm"
                            menuPlacement="top"
                            isSearchable={false}
                            value={pageSizeOption.filter(
                                (option) => option.value === pageSize,
                            )}
                            options={pageSizeOption}
                            onChange={(option) => handleSelectChange(option?.value)}
                        />
                    </div>
                </div>
            </div>
        </Loading>
    )
}

export type { ColumnDef, Row, CellContext }
export default DataTable
