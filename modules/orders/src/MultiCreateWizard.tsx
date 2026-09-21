import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import type { Order, Product } from '@/@types/crm'
import {
    apiCreateOrdersBatch,
    apiGetOrderTypes,
    apiGetProducts,
} from '@/services/CrmService'
import { normalizeList, extractError } from './orderUtils'
import { qa } from './qa'

export type MultiCreateContext = {
    dealId: string
    contactId?: string
    companyId?: string
    productId?: string
}

type Row = {
    key: string
    productId: string
    orderTypeId: string
    blocked: boolean
    blockReason?: string
}

interface MultiCreateWizardProps {
    isOpen: boolean
    onClose: () => void
    projectId: string
    context: MultiCreateContext
    onDone?: (created: Order[]) => void
}

/**
 * FLOW-ORDERS-CREATE-MULTI — мастер пакетного создания продаж из сделки (FR-ORDERS-135).
 */
const MultiCreateWizard = ({
    isOpen,
    onClose,
    projectId,
    context,
    onDone,
}: MultiCreateWizardProps) => {
    const [rows, setRows] = useState<Row[]>([])
    const [submitting, setSubmitting] = useState(false)

    const { data: productsData, isLoading: productsLoading } = useSWR(
        isOpen && projectId ? ['/api/v1/products', projectId, 'multi-create'] : null,
        () => apiGetProducts<{ list: Product[]; total: number }, { pageSize: number; projectId: string }>({
            pageSize: 1000,
            projectId,
        }),
        { revalidateOnFocus: false },
    )

    const { data: typesData } = useSWR(
        isOpen && projectId ? ['/api/v1/order-types', projectId, 'multi-create'] : null,
        () => apiGetOrderTypes<Order[] | { list: Order[] }>(),
        { revalidateOnFocus: false },
    )

    const products = productsData?.list ?? []
    const types = normalizeList(typesData)

    const productOptions = useMemo(
        () => products.map((p) => ({ value: p.id, label: p.name })),
        [products],
    )

    const newRowKey = () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `row-${Date.now()}-${Math.random()}`

    const resolveRow = (productId: string, key?: string): Row => {
        const product = products.find((p) => p.id === productId)
        const orderTypeId = product?.orderTypeId ?? ''
        const dangling = !!product?.orderTypeDangling
        const blocked = !productId || !orderTypeId || dangling
        const blockReason = !productId
            ? 'Выберите продукт'
            : dangling
              ? 'Тип продажи удалён'
              : !orderTypeId
                ? 'У продукта не настроен тип продажи'
                : undefined
        return {
            key: key ?? newRowKey(),
            productId,
            orderTypeId,
            blocked,
            blockReason,
        }
    }

    const ensureInitialRows = () => {
        const initial = context.productId ? [context.productId, ''] : ['', '']
        setRows(initial.map((pid) => resolveRow(pid)))
    }

    useEffect(() => {
        if (!isOpen) {
            setRows([])
            return
        }
        if (!productsLoading && products.length >= 0 && rows.length === 0) {
            ensureInitialRows()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, productsLoading, products.length, context.productId])

    const addRow = () => setRows((prev) => [...prev, resolveRow('')])

    const updateProduct = (index: number, productId: string) => {
        setRows((prev) => prev.map((r, i) => (i === index ? resolveRow(productId, r.key) : r)))
    }

    const removable = rows.length > 1
    const validRows = rows.filter((r) => !r.blocked)
    const canSubmit = validRows.length > 0 && !submitting

    const submit = async () => {
        if (!canSubmit) return
        setSubmitting(true)
        try {
            const res = await apiCreateOrdersBatch<{ created: Order[]; errors: { index: number; code: string; message: string }[] }>({
                dealId: context.dealId,
                contactId: context.contactId,
                companyId: context.companyId,
                items: validRows.map((r) => ({
                    productId: r.productId,
                    orderTypeId: r.orderTypeId,
                })),
            })
            const created = res.created ?? []
            const errors = res.errors ?? []
            if (created.length > 0) {
                toast.push(
                    <Notification title="Готово" type="success" {...qa('orders.multiCreate.success')}>
                        {`Создано продаж: ${created.length}`}
                    </Notification>,
                    { placement: 'top-center' },
                )
            }
            if (errors.length > 0) {
                const detail = errors
                    .map((e) => e.message)
                    .filter(Boolean)
                    .join('; ')
                toast.push(
                    <Notification title="Ошибка" type="danger" {...qa('orders.multiCreate.partialError')}>
                        {detail || `Не создано строк: ${errors.length}`}
                    </Notification>,
                    { placement: 'top-center' },
                )
            }
            onDone?.(created)
            onClose()
        } catch (e) {
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('orders.multiCreate.submitError')}>
                    {extractError(e, 'Не удалось создать продажи')}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} width={640}>
            <div {...qa('orders.multiCreate.dialog')}>
            <h5 className="mb-2">Создать несколько продаж из сделки</h5>
            <p className="text-sm text-gray-500 mb-4">
                По одной продаже на продукт. Тип продажи подставляется из каталога (FR-ORDERS-110).
            </p>

            {productsLoading ? (
                <div className="flex items-center gap-2 py-6 text-gray-500" {...qa('orders.multiCreate.loading')}>
                    <Spinner size={20} /> Загрузка продуктов…
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {rows.map((row, index) => (
                        <div
                            key={row.key}
                            className="flex flex-col gap-1 border rounded-lg p-3 dark:border-gray-700"
                            {...qa('orders.multiCreate.row', { index })}
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex-1" {...qa('orders.multiCreate.productSelect', { index })}>
                                    <label className="text-xs text-gray-500">Продукт</label>
                                    <Select
                                        options={productOptions}
                                        value={productOptions.find((o) => o.value === row.productId) || null}
                                        onChange={(o) => updateProduct(index, o?.value || '')}
                                        placeholder="Выберите продукт"
                                    />
                                </div>
                                {removable && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        className="mt-4"
                                        {...qa('orders.multiCreate.removeRow')}
                                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                                    >
                                        Убрать
                                    </Button>
                                )}
                            </div>
                            <div
                                className="text-xs text-gray-500"
                                {...(row.blocked ? qa('orders.multiCreate.rowBlocked', { index }) : {})}
                            >
                                Тип продажи:{' '}
                                {row.blocked
                                    ? row.blockReason
                                    : types.find((t) => t.id === row.orderTypeId)?.name || row.orderTypeId}
                            </div>
                        </div>
                    ))}
                    <Button size="sm" variant="default" {...qa('orders.multiCreate.addRow')} onClick={addRow}>
                        Добавить продукт
                    </Button>
                </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
                <Button variant="plain" onClick={onClose} disabled={submitting}>
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={submitting}
                    disabled={!canSubmit}
                    {...qa('orders.multiCreate.submit')}
                    onClick={submit}
                >
                    Создать все ({validRows.length})
                </Button>
            </div>
            </div>
        </Dialog>
    )
}

export default MultiCreateWizard
