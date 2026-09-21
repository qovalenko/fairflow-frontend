import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiArrowLeftDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetOrder, apiGetOrderType, apiUpdateOrder, apiGetMembers } from '@/services/CrmService'
import type { Order, OrderTypeDetail, OrderTypeField, ProjectMember } from '@/@types/crm'
import { extractError, notifyError, notifySuccess, normalizeList } from './orderUtils'
import { qa } from './qa'

const OrderEdit = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const can = usePermission()
    const canWrite = can('orders', 'write')

    const { data: order, isLoading, error, mutate } = useSWR(
        id ? [`/api/v1/orders/${id}`, id] : null,
        () => apiGetOrder<Order>(id!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // FR-ORDERS-120: форма строится по ревизии типа, закреплённой за продажей
    // (`order.orderTypeVersion`) — сервер валидирует значения именно по ней.
    // Раньше бралась ТЕКУЩАЯ версия типа из `GET /order-types`, поэтому после
    // правки типа форма показывала поля, которых сервер уже (или ещё) не ждёт.
    const { data: typeDetail } = useSWR(
        order ? [`/api/v1/order-types/${order.typeId}`, order.typeId, order.orderTypeVersion] : null,
        () => apiGetOrderType<OrderTypeDetail>(order!.typeId, order!.orderTypeVersion),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: membersData } = useSWR(
        order ? ['/api/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // Поля закреплённой ревизии. `type` домен хранит как пришло из конструктора
    // (UPPER-case), а renderField различает регистр — без нормализации number/date/
    // select/checkbox молча вырождались в обычный текстовый инпут.
    const schemaFields = useMemo<OrderTypeField[]>(
        () =>
            (typeDetail?.revision?.fields || []).map((f) => ({
                ...f,
                type: String(f.type || 'text').toLowerCase() as OrderTypeField['type'],
            })),
        [typeDetail],
    )
    const memberOptions = useMemo(
        () => normalizeList<ProjectMember>(membersData).map((m) => ({ value: m.id, label: m.name })),
        [membersData],
    )

    // customFields редактируются по схеме типа продажи (FR-MORD-14).
    const [customFields, setCustomFields] = useState<Record<string, string>>({})
    const [assigneeId, setAssigneeId] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    useEffect(() => {
        if (!order) return
        const f: Record<string, string> = {}
        const src = (order.fields || {}) as Record<string, unknown>
        Object.entries(src).forEach(([k, v]) => {
            f[k] = v == null ? '' : String(v)
        })
        setCustomFields(f)
        setAssigneeId(order.assigneeId || '')
        setNotes(order.notes ?? '')
        setDirty(false)
    }, [order])

    const handleFieldChange = (key: string, value: string) => {
        setCustomFields((prev) => ({ ...prev, [key]: value }))
        setDirty(true)
    }

    const handleSave = async () => {
        if (!order) return
        setSaving(true)
        try {
            await apiUpdateOrder<Order>(order.id, {
                customFields,
                notes,
                ...(assigneeId ? { assigneeId } : {}),
            })
            notifySuccess('Продажа сохранена')
            mutate()
            navigate(-1)
        } catch (err) {
            notifyError(extractError(err, 'Не удалось сохранить продажу'))
        } finally {
            setSaving(false)
        }
    }

    const renderField = (field: OrderTypeField) => {
        const value = customFields[field.key] ?? ''
        switch (field.type) {
            case 'select':
                return (
                    <div {...qa('orders.edit.field', { key: field.key })}>
                        <Select
                            options={(field.options || []).map((o) => ({ value: o, label: o }))}
                            value={value ? { value, label: value } : null}
                            onChange={(opt) => handleFieldChange(field.key, opt?.value || '')}
                        />
                    </div>
                )
            case 'checkbox':
                return (
                    <label className="flex items-center gap-2 cursor-pointer" {...qa('orders.edit.field', { key: field.key })}>
                        <input
                            type="checkbox"
                            checked={value === 'true'}
                            onChange={(e) => handleFieldChange(field.key, e.target.checked ? 'true' : 'false')}
                            className="w-4 h-4 rounded"
                        />
                        <span className="text-sm">{value === 'true' ? 'Да' : 'Нет'}</span>
                    </label>
                )
            case 'date':
                return (
                    <Input
                        type="date"
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        {...qa('orders.edit.field', { key: field.key })}
                    />
                )
            case 'number':
                return (
                    <Input
                        type="number"
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        {...qa('orders.edit.field', { key: field.key })}
                    />
                )
            default:
                return (
                    <Input
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        {...qa('orders.edit.field', { key: field.key })}
                    />
                )
        }
    }

    const back = () => {
        if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return
        navigate(-1)
    }

    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ST-6 / ST-9.
    if (error || !order) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8">
                        <p className="text-gray-500">{error ? 'Не удалось загрузить продажу' : 'Продажа не найдена'}</p>
                        <Button variant="solid" color="primary" className="mt-4" onClick={() => navigate('/orders')}>
                            К списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={back}
                        title="Назад"
                        {...qa('orders.edit.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">Редактирование продажи</h3>
                </div>

                {/* ST-11: read-only, без права write. */}
                {!canWrite && (
                    <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-500">
                        Просмотр без права редактирования — изменения сохранить нельзя.
                    </div>
                )}

                <AdaptiveCard>
                    <h5 className="mb-4">Информация о продаже</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Номер</label>
                            <Input value={order.number} disabled />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Тип продажи</label>
                            <div className="flex items-center h-[38px]">
                                <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                    {order.typeName}
                                </Tag>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Этап</label>
                            <Input value={order.stageName} disabled {...qa('orders.edit.stageReadonly')} />
                        </div>
                        <div {...qa('orders.edit.assignee')}>
                            <label className="block text-sm font-medium mb-1">Ответственный</label>
                            <Select
                                isDisabled={!canWrite}
                                options={memberOptions}
                                value={memberOptions.find((o) => o.value === assigneeId) || null}
                                onChange={(opt) => {
                                    setAssigneeId(opt?.value || '')
                                    setDirty(true)
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Сделка</label>
                            <Input value={order.dealName || '—'} disabled />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Заметки</h5>
                    {canWrite ? (
                        <textarea
                            className="w-full min-h-[96px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                            value={notes}
                            {...qa('orders.edit.notes')}
                            onChange={(e) => {
                                setNotes(e.target.value)
                                setDirty(true)
                            }}
                            placeholder="Комментарий по продаже"
                        />
                    ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                            {notes.trim() ? notes : '—'}
                        </p>
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Поля продажи</h5>
                    {schemaFields.length === 0 ? (
                        <p className="text-sm text-gray-400">У типа продажи нет настраиваемых полей.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {schemaFields.map((field) => (
                                <div key={field.key}>
                                    <label className="block text-sm font-medium mb-1">
                                        {field.label}
                                        {field.required && <span className="text-red-500"> *</span>}
                                    </label>
                                    {canWrite ? (
                                        renderField(field)
                                    ) : (
                                        <Input value={customFields[field.key] ?? ''} disabled />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </AdaptiveCard>

                <div className="flex justify-end gap-3">
                    <Button variant="plain" onClick={back}>
                        Отмена
                    </Button>
                    {canWrite && (
                        <Button
                            variant="solid"
                            color="primary"
                            loading={saving}
                            {...qa('orders.edit.save')}
                            onClick={handleSave}
                        >
                            Сохранить
                        </Button>
                    )}
                </div>
            </div>
        </Container>
    )
}

export default OrderEdit
