import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiPencilDuotone,
    PiTrashDuotone,
    PiArchiveDuotone,
    PiArrowCounterClockwiseDuotone,
    PiTagDuotone,
    PiCurrencyRubDuotone,
    PiCalendarDuotone,
    PiPackageDuotone,
    PiReceiptDuotone,
    PiChartBarDuotone,
    PiWarningCircleDuotone,
    PiLockDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Loading from '@/components/shared/Loading'
import type { AxiosError } from 'axios'
import {
    apiGetProduct,
    apiGetProductUsage,
    apiArchiveProduct,
    apiRestoreProduct,
    apiDeleteProduct,
} from '@/services/CrmService'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import type { Product, ProductArchiveAffected } from '@/@types/crm'
import {
    categoryTagClass,
    unitLabel,
    formatPrice,
    notifySuccess,
    notifyError,
    extractApiError,
    isModuleDisabledError,
    ModuleDisabledState,
} from './productsUi'
import { qa } from './qa'

const ProductDetails = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()

    const can = usePermission()
    const canRead = can('products', 'read')
    const canWrite = can('products', 'write')
    const canDelete = can('products', 'delete')
    const canCreateSale = can('orders', 'write')

    const [archiveOpen, setArchiveOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [restoreOpen, setRestoreOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [affected, setAffected] = useState<ProductArchiveAffected | null>(null)
    const [usageLoading, setUsageLoading] = useState(false)
    const { departmentName } = useDepartmentOptions(archiveOpen)

    const { data: product, isLoading, error, mutate } = useSWR(
        id && pid && canRead ? [`/api/v1/products/${id}`, id, pid] : null,
        () => apiGetProduct<Product>(id!, pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const isArchived = product?.status === 'archived'
    const saleTypeConfigured = !!(product?.orderTypeId && !product.orderTypeDangling)
    const goCreateSale = () => {
        if (product?.id) navigate(`/orders?productId=${product.id}`)
    }

    const loadUsagePreview = async () => {
        if (!id || !pid) return
        setUsageLoading(true)
        try {
            const usage = await apiGetProductUsage(id, { projectId: pid })
            setAffected({
                deals: Number(usage.dealsCount ?? 0),
                orders: Number(usage.ordersCount ?? 0),
                activeDeals: Number(usage.activeDealsCount ?? 0),
                byDepartment: usage.byDepartment,
                byUser: usage.byUser,
            })
        } catch {
            setAffected({
                deals: product?.dealsCount ?? 0,
                orders: product?.ordersCount ?? 0,
            })
        } finally {
            setUsageLoading(false)
        }
    }

    const handleArchive = async () => {
        if (!id || !pid) return
        setBusy(true)
        try {
            const res = await apiArchiveProduct(id, { projectId: pid })
            setAffected(res?.affected ?? null)
            notifySuccess('Продукт перемещён в архив')
            setArchiveOpen(false)
            navigate('/products')
        } catch (e) {
            notifyError(extractApiError(e).message || 'Не удалось архивировать продукт')
        } finally {
            setBusy(false)
        }
    }

    const handleRestore = async () => {
        if (!id || !pid) return
        setBusy(true)
        try {
            await apiRestoreProduct<Product>(id, { projectId: pid })
            notifySuccess('Продукт восстановлен')
            setRestoreOpen(false)
            await mutate()
        } catch (e) {
            notifyError(extractApiError(e).message || 'Не удалось восстановить продукт')
        } finally {
            setBusy(false)
        }
    }

    const handleHardDelete = async () => {
        if (!id || !pid) return
        setBusy(true)
        try {
            await apiDeleteProduct(id, { projectId: pid, force: true })
            notifySuccess('Продукт удалён')
            setDeleteOpen(false)
            navigate('/products')
        } catch (e) {
            // FAILED_PRECONDITION («есть связанные сделки/продажи») доезжает как HTTP 422:
            // gateway маппит FAILED_PRECONDITION → 422 (shared/src/grpc/grpc-to-http.ts) —
            // это глобальная конвенция, 409 зарезервирован под ALREADY_EXISTS/ABORTED.
            // Проверка на 409 никогда не срабатывала, и автопереход «удалить → архив»
            // был недостижим. Код из конверта — самый надёжный признак; статус оставлен
            // как запасной (409 — на случай смены конвенции маппинга).
            const err = e as AxiosError<{
                error?: { code?: string; details?: ProductArchiveAffected }
            }>
            const status = err?.response?.status
            const code = err?.response?.data?.error?.code
            const details = err?.response?.data?.error?.details
            const blockedByRefs =
                code === 'FAILED_PRECONDITION' || status === 422 || status === 409
            if (blockedByRefs) {
                setAffected(
                    details ?? {
                        deals: product?.dealsCount ?? 0,
                        orders: product?.ordersCount ?? 0,
                    },
                )
                setDeleteOpen(false)
                setArchiveOpen(true)
                void loadUsagePreview()
                notifyError('Есть связанные сделки/продажи — архивируйте продукт')
            } else {
                notifyError(extractApiError(e).message || 'Не удалось удалить продукт')
            }
        } finally {
            setBusy(false)
        }
    }

    // ST-10 No-permission (route).
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-16 text-center gap-3"
                        {...qa('products.details.locked')}
                    >
                        <PiLockDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold">Раздел недоступен</p>
                        <p className="text-gray-500 text-sm">
                            У вас нет прав на просмотр продукта
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-1 Loading.
    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} {...qa('products.details.loading')} />
            </Container>
        )
    }

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

    // ST-6 Error загрузки — отделено от ST-9 Not found (closes OQ-UX-PRODUCTS-9).
    if (error) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-12 text-center gap-3"
                        {...qa('products.details.error')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                        <p className="text-gray-600 dark:text-gray-300">
                            Не удалось загрузить продукт
                        </p>
                        <div className="flex gap-2">
                            <Button variant="solid" onClick={() => mutate()} {...qa('products.details.retry')}>
                                Повторить
                            </Button>
                            <Button variant="plain" onClick={() => navigate('/products')} {...qa('products.details.errorBack')}>
                                К списку
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-9 Not found / cross-project (404, FR-MPRD-9).
    if (!product) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('products.details.notFound')}>
                        <p className="text-gray-500">Продукт не найден</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate('/products')}
                            {...qa('products.details.backToList')}
                        >
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4" {...qa('products.details')}>
                {isArchived && (
                    <div
                        className="flex items-center justify-between gap-3 rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3"
                        {...qa('products.details.archiveBanner')}
                    >
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <PiArchiveDuotone className="w-5 h-5" />
                            Продукт в архиве. Доступен только для чтения.
                        </div>
                        {canWrite && (
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<PiArrowCounterClockwiseDuotone />}
                                onClick={() => setRestoreOpen(true)}
                                {...qa('products.details.restore')}
                            >
                                Восстановить
                            </Button>
                        )}
                    </div>
                )}

                {product.orderTypeDangling && (
                    <div
                        className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-4 py-3"
                        {...qa('products.details.danglingBanner')}
                    >
                        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                            <PiWarningCircleDuotone className="w-5 h-5" />
                            Тип продажи не назначен — продажи по этому продукту недоступны.
                        </div>
                        {canWrite && !isArchived && (
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => navigate(`/products/${product.id}/edit`)}
                                {...qa('products.details.reassignType')}
                            >
                                Переназначить тип
                            </Button>
                        )}
                    </div>
                )}

                <AdaptiveCard {...qa('products.details.main')}>
                    <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <PiPackageDuotone className="w-8 h-8 text-blue-500" />
                                <div>
                                    <h3 className="text-2xl font-bold" {...qa('products.details.name')}>
                                        {product.name}
                                    </h3>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {product.category && (
                                            <Tag className={categoryTagClass(product.category)}>
                                                {product.category}
                                            </Tag>
                                        )}
                                        {isArchived && (
                                            <Tag className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                Архив
                                            </Tag>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* ST-11/12 element gating: actions hidden without rights / for archived */}
                        <div className="flex gap-2">
                            {canCreateSale && !isArchived && saleTypeConfigured && (
                                <Button
                                    variant="solid"
                                    color="primary"
                                    size="sm"
                                    icon={<PiReceiptDuotone />}
                                    onClick={goCreateSale}
                                    {...qa('products.details.createSale')}
                                >
                                    Создать продажу
                                </Button>
                            )}
                            {canWrite && !isArchived && (
                                <Button
                                    variant="solid"
                                    color="primary"
                                    size="sm"
                                    icon={<PiPencilDuotone />}
                                    onClick={() => navigate(`/products/${product.id}/edit`)}
                                    {...qa('products.details.edit')}
                                >
                                    Редактировать
                                </Button>
                            )}
                            {canWrite && !isArchived && (
                                <Button
                                    size="sm"
                                    icon={<PiArchiveDuotone />}
                                    onClick={() => {
                                        setAffected(null)
                                        setArchiveOpen(true)
                                        void loadUsagePreview()
                                    }}
                                    {...qa('products.details.archive')}
                                >
                                    В архив
                                </Button>
                            )}
                            {canDelete && (
                                <Button
                                    variant="solid"
                                    color="red"
                                    size="sm"
                                    icon={<PiTrashDuotone />}
                                    onClick={() => setDeleteOpen(true)}
                                    {...qa('products.details.delete')}
                                >
                                    Удалить
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <PiCurrencyRubDuotone className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <div className="text-sm text-gray-500">Цена</div>
                                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400" {...qa('products.details.price')}>
                                        {formatPrice(
                                            product.effectivePrice ?? product.price,
                                            product.currency,
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <PiReceiptDuotone className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <div className="text-sm text-gray-500">Тип оплаты</div>
                                    <div className="font-medium" {...qa('products.details.unit')}>{unitLabel(product.unit)}</div>
                                </div>
                            </div>
                            {product.orderTypeName && (
                                <div className="flex items-start gap-3">
                                    <PiTagDuotone className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <div className="text-sm text-gray-500">Тип продажи</div>
                                        <div className="font-medium" {...qa('products.details.orderType')}>{product.orderTypeName}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <PiCalendarDuotone className="w-5 h-5 text-gray-400 mt-0.5" />
                                <div>
                                    <div className="text-sm text-gray-500">Дата создания</div>
                                    <div className="font-medium" {...qa('products.details.createdAt')}>
                                        {dayjs.unix(product.createdAt).format('DD.MM.YYYY HH:mm')}
                                    </div>
                                </div>
                            </div>
                            {product.updatedAt !== product.createdAt && (
                                <div className="flex items-start gap-3">
                                    <PiCalendarDuotone className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <div className="text-sm text-gray-500">Дата обновления</div>
                                        <div className="font-medium">
                                            {dayjs.unix(product.updatedAt).format('DD.MM.YYYY HH:mm')}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </AdaptiveCard>

                {product.description && (
                    <AdaptiveCard {...qa('products.details.description')}>
                        <h5 className="mb-3">Описание</h5>
                        <div className="text-sm text-sky-800 dark:text-sky-100 whitespace-pre-wrap rounded-2xl p-4 flex flex-col justify-center bg-sky-100 dark:bg-sky-900/75">
                            {product.description}
                        </div>
                    </AdaptiveCard>
                )}

                {/* EL-PDET-13 prefill block (read-only) */}
                {product.prefill && Object.keys(product.prefill).length > 0 && (
                    <AdaptiveCard {...qa('products.details.prefill')}>
                        <h5 className="mb-3">Предзаполняемые поля продажи</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {Object.entries(product.prefill).map(([field, value]) => (
                                <div
                                    key={field}
                                    className="flex justify-between gap-2 text-sm border-b pb-1"
                                    {...qa('products.details.prefillItem', { field })}
                                >
                                    <span className="text-gray-500">{field}</span>
                                    <span className="font-medium">{String(value)}</span>
                                </div>
                            ))}
                        </div>
                    </AdaptiveCard>
                )}

                <AdaptiveCard {...qa('products.details.stats')}>
                    <h5 className="mb-4">Статистика использования</h5>
                    <p className="text-xs text-gray-400 mb-3">
                        Счётчики событийные — могут обновляться с задержкой.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Card {...qa('products.details.statsDeals')}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                                    <PiChartBarDuotone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Сделок с продуктом</div>
                                    <div className="text-2xl font-bold heading-text">
                                        {product.dealsCount}
                                    </div>
                                </div>
                            </div>
                        </Card>
                        <Card {...qa('products.details.statsOrders')}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                                    <PiReceiptDuotone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Продаж</div>
                                    <div className="text-2xl font-bold heading-text">
                                        {product.ordersCount}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>
                </AdaptiveCard>
            </div>

            {/* DLG-PRODUCTS-ARCHIVE */}
            <Dialog
                isOpen={archiveOpen}
                onClose={() => !busy && setArchiveOpen(false)}
                onRequestClose={() => !busy && setArchiveOpen(false)}
                {...qa('products.dialog.archive')}
            >
                <h5 className="mb-4">Архивировать продукт</h5>
                <p className="text-sm">
                    «{product.name}» уйдёт из выбора новых записей. История сохранится — связанные
                    сделки и продажи останутся читаемыми.
                </p>
                {usageLoading && (
                    <p className="mt-3 text-sm text-gray-500" {...qa('products.dialog.archive.usageLoading')}>
                        Считаем, кого затронет архив…
                    </p>
                )}
                {affected && (affected.deals > 0 || affected.orders > 0) && (
                    <div
                        className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-700 dark:text-amber-300"
                        {...qa('products.dialog.archive.affected')}
                    >
                        Затронуто: {affected.deals} сделок, {affected.orders} продаж.
                        {affected.byDepartment && affected.byDepartment.length > 0 && (
                            <ul className="mt-1 list-disc list-inside">
                                {affected.byDepartment.map((d) => (
                                    <li key={d.departmentId || 'none'}>
                                        {departmentName(d.departmentId) ||
                                            (d.departmentId ? d.departmentId : 'Без отдела')}
                                        : {d.deals} сделок, {d.orders} продаж
                                    </li>
                                ))}
                            </ul>
                        )}
                        {affected.byUser && affected.byUser.length > 0 && (
                            <ul className="mt-1 list-disc list-inside">
                                {affected.byUser.map((u) => (
                                    <li key={u.userId}>
                                        {u.userId}: {u.deals} сделок, {u.orders} продаж
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button variant="plain" disabled={busy} onClick={() => setArchiveOpen(false)} {...qa('products.dialog.archive.cancel')}>
                        Отмена
                    </Button>
                    <Button variant="solid" color="primary" loading={busy} onClick={handleArchive} {...qa('products.dialog.archive.confirm')}>
                        В архив
                    </Button>
                </div>
            </Dialog>

            {/* DLG-PRODUCTS-DELETE (hard) */}
            <Dialog
                isOpen={deleteOpen}
                onClose={() => !busy && setDeleteOpen(false)}
                onRequestClose={() => !busy && setDeleteOpen(false)}
                {...qa('products.dialog.delete')}
            >
                <h5 className="mb-4">Удалить продукт навсегда</h5>
                <p className="text-sm">
                    «{product.name}» будет удалён без возможности восстановления. Удаление возможно
                    только при отсутствии связанных сделок и продаж — иначе предложим архив.
                </p>
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button variant="plain" disabled={busy} onClick={() => setDeleteOpen(false)} {...qa('products.dialog.delete.cancel')}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        className="bg-red-500 hover:bg-red-600 text-white"
                        loading={busy}
                        onClick={handleHardDelete}
                        {...qa('products.dialog.delete.confirm')}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>

            {/* DLG-PRODUCTS-RESTORE */}
            <Dialog
                isOpen={restoreOpen}
                onClose={() => !busy && setRestoreOpen(false)}
                onRequestClose={() => !busy && setRestoreOpen(false)}
                {...qa('products.dialog.restore')}
            >
                <h5 className="mb-4">Восстановить продукт</h5>
                <p className="text-sm">
                    «{product.name}» вернётся в активный каталог и снова станет доступен для выбора.
                </p>
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button variant="plain" disabled={busy} onClick={() => setRestoreOpen(false)} {...qa('products.dialog.restore.cancel')}>
                        Отмена
                    </Button>
                    <Button variant="solid" color="primary" loading={busy} onClick={handleRestore} {...qa('products.dialog.restore.confirm')}>
                        Восстановить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default ProductDetails
