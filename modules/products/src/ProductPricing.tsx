import { useState, useEffect } from 'react'
import {
    PiWarningCircleDuotone,
    PiPackageDuotone,
    PiLockDuotone,
} from 'react-icons/pi'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import Pagination from '@/components/ui/Pagination'
import { apiGetProducts, apiUpdateProduct } from '@/services/CrmService'
import type { Product } from '@/@types/crm'
import {
    categoryTagClass,
    unitLabel,
    toUnitEnum,
    formatPrice,
    notifySuccess,
    notifyError,
    isModuleDisabledError,
    ModuleDisabledState,
} from './productsUi'
import ProductsTabs from './ProductsTabs'
import { qa, QA_IDS_ENABLED } from './qa'

interface PricingRow {
    id: string
    name: string
    category?: string
    price: number
    unit: string
    currency?: string
    description?: string
    orderTypeId?: string
    orderTypeName?: string
    orderTypeDangling?: boolean
}

const toRow = (p: Product): PricingRow => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.effectivePrice ?? p.price,
    unit: p.unit,
    currency: p.currency,
    description: p.description,
    orderTypeId: p.orderTypeId,
    orderTypeName: p.orderTypeName,
    orderTypeDangling: p.orderTypeDangling,
})

// GAP-PRODUCTS-030 / NFR-720: домен клампит page_size до 100 — фиксированная страница
// молча обрезала прайс-лист на 100 позициях (и «Всего продуктов» врало).
const PAGE_SIZE = 50

const ProductPricing = () => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()

    const can = usePermission()
    const canRead = can('products', 'read')
    const canWrite = can('products', 'write')

    const [page, setPage] = useState(1)

    const tableData = {
        pageIndex: page - 1, // gateway ждёт 0-based page_index
        pageSize: PAGE_SIZE,
        query: '',
        category: '',
        status: 'active',
        sort: 'name',
    }

    const { data, isLoading, error, mutate } = useSWR(
        pid && canRead ? ['/api/v1/products/pricing', pid, page] : null,
        () =>
            apiGetProducts<{ list: Product[]; total: number }, typeof tableData & { projectId: string }>({
                ...tableData,
                projectId: pid!,
            }),
        // shouldRetryOnError:false — не ретраим 403 MODULE_DISABLED и прочие сбои.
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [rows, setRows] = useState<PricingRow[]>([])
    const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)

    const total = data?.total ?? 0

    useEffect(() => {
        if (data?.list) {
            setRows(data.list.map(toRow))
            setDirtyIds(new Set())
        }
    }, [data])

    const handleCellClick = (id: string, field: string) => {
        if (!canWrite) return
        setEditingCell({ id, field })
    }

    const handleCellChange = (id: string, field: keyof PricingRow, value: string | number) => {
        setRows((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
        setDirtyIds((prev) => new Set(prev).add(id))
    }

    const handleBlur = () => setEditingCell(null)

    const handleSave = async () => {
        if (!pid || dirtyIds.size === 0) return
        setSaving(true)
        const changed = rows.filter((r) => dirtyIds.has(r.id))
        const failed: string[] = []
        // ST-31 bulk: per-row PUT, partial-success tolerated, failed rows kept dirty.
        await Promise.all(
            changed.map(async (r) => {
                try {
                    // Шлём только то, что этот экран реально редактирует (имя и цена).
                    // Раньше сюда же уезжали category/description/orderType из
                    // снапшота строки — лишний шанс затереть чужую параллельную
                    // правку (lost update); домен пропускает undefined-поля.
                    await apiUpdateProduct(
                        r.id,
                        {
                            name: r.name,
                            price: Number(r.price) || 0,
                            unit: toUnitEnum(r.unit),
                        },
                        { projectId: pid },
                    )
                } catch {
                    failed.push(r.id)
                }
            }),
        )
        setEditingCell(null)
        if (failed.length === 0) {
            notifySuccess('Цены сохранены')
            setDirtyIds(new Set())
            await mutate()
        } else {
            notifyError(
                `Не удалось сохранить ${failed.length} из ${changed.length}. Проверьте отмеченные строки.`,
            )
            setDirtyIds(new Set(failed))
        }
        setSaving(false)
    }

    // Гейт переключения таба «Цены»→«Каталог» при несохранённых правках цен.
    const confirmLeaveDirty = () =>
        dirtyIds.size === 0 ||
        window.confirm('Есть несохранённые изменения. Выйти без сохранения?')

    // Тот же гейт на смену страницы: правки живут только в пределах загруженной страницы.
    const changePage = (next: number) => {
        if (next === page || !confirmLeaveDirty()) return
        setDirtyIds(new Set())
        setEditingCell(null)
        setPage(next)
    }

    const currency = rows[0]?.currency

    // Graceful degradation: модуль «Продукты» выключен в проекте (403).
    if (error && isModuleDisabledError(error)) {
        return (
            <Container>
                <AdaptiveCard>
                    <ModuleDisabledState />
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-10 No-permission (route requires products:write).
    if (!canWrite && !canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-16 text-center gap-3"
                        {...qa('products.pricing.locked')}
                    >
                        <PiLockDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold">Раздел недоступен</p>
                        <p className="text-gray-500 text-sm">
                            У вас нет прав на работу с прайс-листом
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4" {...qa('products.pricing')}>
                <ProductsTabs beforeLeave={confirmLeaveDirty} />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-gray-500">
                        Массовое редактирование цен каталога
                    </p>
                    {/* ST-11 read-only: save hidden without write */}
                    {canWrite && (
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={handleSave}
                            loading={saving}
                            disabled={dirtyIds.size === 0}
                            {...qa('products.pricing.save')}
                        >
                            {dirtyIds.size > 0
                                ? `Сохранить изменения (${dirtyIds.size})`
                                : 'Сохранить изменения'}
                        </Button>
                    )}
                </div>

                <AdaptiveCard>
                    {error ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('products.pricing.error')}
                        >
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">
                                Не удалось загрузить прайс-лист
                            </p>
                            <Button variant="solid" onClick={() => mutate()} {...qa('products.pricing.retry')}>
                                Повторить
                            </Button>
                        </div>
                    ) : !isLoading && total === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('products.pricing.empty')}
                        >
                            <PiPackageDuotone className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Каталог пуст</p>
                            <p className="text-gray-500 text-sm">
                                Создайте продукты, чтобы редактировать цены
                            </p>
                            <Button variant="solid" color="primary" onClick={() => navigate('/products')} {...qa('products.pricing.goCatalog')}>
                                К каталогу
                            </Button>
                        </div>
                    ) : (
                        <Loading loading={isLoading} {...qa('products.pricing.loading')}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" {...qa('products.pricing.table')}>
                                    <thead>
                                        <tr className="border-b">
                                            <th className="text-left py-3 px-2 font-semibold">Продукт</th>
                                            <th className="text-left py-3 px-2 font-semibold">Категория</th>
                                            <th className="text-right py-3 px-2 font-semibold">Цена</th>
                                            <th className="text-center py-3 px-2 font-semibold">Единица</th>
                                            <th className="text-center py-3 px-2 font-semibold">Тип продажи</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((product) => (
                                            <tr
                                                key={product.id}
                                                className={`border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                                    dirtyIds.has(product.id)
                                                        ? 'bg-amber-50/60 dark:bg-amber-900/20'
                                                        : ''
                                                }`}
                                                {...qa('products.pricing.row', {
                                                    product: product.id,
                                                    ...(dirtyIds.has(product.id) ? { dirty: 'true' } : {}),
                                                })}
                                            >
                                                <td className="py-2 px-2">
                                                    {editingCell?.id === product.id &&
                                                    editingCell.field === 'name' ? (
                                                        <Input
                                                            size="sm"
                                                            value={product.name}
                                                            onChange={(e) =>
                                                                handleCellChange(product.id, 'name', e.target.value)
                                                            }
                                                            onBlur={handleBlur}
                                                            autoFocus
                                                            {...qa('products.pricing.nameInput', { product: product.id })}
                                                        />
                                                    ) : (
                                                        <span
                                                            className={`font-medium ${
                                                                canWrite
                                                                    ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400'
                                                                    : ''
                                                            }`}
                                                            onClick={() => handleCellClick(product.id, 'name')}
                                                            {...qa('products.pricing.nameCell', { product: product.id })}
                                                        >
                                                            {product.name}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2">
                                                    {product.category && (
                                                        <Tag className={categoryTagClass(product.category)}>
                                                            {product.category}
                                                        </Tag>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2 text-right">
                                                    {editingCell?.id === product.id &&
                                                    editingCell.field === 'price' ? (
                                                        <Input
                                                            size="sm"
                                                            type="number"
                                                            value={String(product.price)}
                                                            onChange={(e) =>
                                                                handleCellChange(
                                                                    product.id,
                                                                    'price',
                                                                    Number(e.target.value),
                                                                )
                                                            }
                                                            onBlur={handleBlur}
                                                            autoFocus
                                                            {...qa('products.pricing.priceInput', { product: product.id })}
                                                        />
                                                    ) : (
                                                        <span
                                                            className={
                                                                canWrite
                                                                    ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400'
                                                                    : ''
                                                            }
                                                            onClick={() => handleCellClick(product.id, 'price')}
                                                            {...qa('products.pricing.priceCell', { product: product.id })}
                                                        >
                                                            {formatPrice(product.price, product.currency)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2 text-center text-gray-600 dark:text-gray-400">
                                                    {unitLabel(product.unit)}
                                                </td>
                                                <td className="py-2 px-2 text-center">
                                                    {product.orderTypeDangling ? (
                                                        <Tag
                                                            className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                                            {...qa('products.pricing.danglingTag', { product: product.id })}
                                                        >
                                                            Битая привязка
                                                        </Tag>
                                                    ) : (
                                                        <span className="text-gray-500">
                                                            {product.orderTypeName || '—'}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot {...qa('products.pricing.footer')}>
                                        <tr className="border-t-2">
                                            <td colSpan={2} className="py-3 px-2 font-semibold">
                                                Всего продуктов: {total}
                                                {total > rows.length && (
                                                    <span className="ml-2 font-normal text-xs text-gray-500">
                                                        (сумма — по текущей странице,{' '}
                                                        {rows.length})
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-2 text-right font-bold text-lg">
                                                {formatPrice(
                                                    rows.reduce((sum, p) => sum + (Number(p.price) || 0), 0),
                                                    currency,
                                                )}
                                            </td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            {total > PAGE_SIZE && (
                                <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
                                    <span className="text-sm text-gray-500">
                                        {(page - 1) * PAGE_SIZE + 1}–
                                        {Math.min(page * PAGE_SIZE, total)} из {total}
                                    </span>
                                    <Pagination
                                        currentPage={page}
                                        total={total}
                                        pageSize={PAGE_SIZE}
                                        onChange={changePage}
                                        qaScope={
                                            QA_IDS_ENABLED ? 'products.pricing.pagination' : undefined
                                        }
                                    />
                                </div>
                            )}
                            {canWrite && (
                                <p className="text-xs text-gray-500 mt-3">
                                    Нажмите на ячейку «Продукт» или «Цена» для редактирования
                                </p>
                            )}
                        </Loading>
                    )}
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default ProductPricing
