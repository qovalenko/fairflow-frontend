import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import useSWR from 'swr'
import {
    PiArrowLeftDuotone,
    PiPlusDuotone,
    PiXBold,
    PiWarningCircleDuotone,
    PiLockDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import {
    apiGetProduct,
    apiUpdateProduct,
    apiGetProductCategories,
    apiGetOrderTypes,
} from '@/services/CrmService'
import type { Product, OrderType } from '@/@types/crm'
import {
    unitOptions,
    toUnitEnum,
    notifySuccess,
    notifyError,
    extractApiError,
    isModuleDisabledError,
    ModuleDisabledState,
} from './productsUi'
import { qa } from './qa'
import { makeQaClearIndicator, makeQaSelectOption } from './qaSelectOption'

interface PrefillRow {
    id: string
    field: string
    value: string
}

type FormState = {
    name: string
    description: string
    category: string
    price: string
    unit: string
    orderTypeId: string
}

const ProductEdit = () => {
    const orderTypeClear = makeQaClearIndicator('products.edit.orderTypeClear')
    const orderTypeOption = makeQaSelectOption<{ value: string; label: string }>(
        'products.edit.orderTypeOption',
        'orderType',
    )
    const categoryOption = makeQaSelectOption<{ value: string; label: string }>(
        'products.edit.categoryOption',
        'category',
    )
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()

    const can = usePermission()
    const canWrite = can('products', 'write')
    // W-6: только для показа текущего отдела-владельца — менять его нельзя
    // (`product.service.ts` S6: ownerDepartmentId не переписывается через update).
    const { departmentName } = useDepartmentOptions(canWrite)

    const { data: product, isLoading, error, mutate } = useSWR(
        id && pid && canWrite ? [`/api/v1/products/${id}/edit`, id, pid] : null,
        () => apiGetProduct<Product>(id!, pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: categories } = useSWR(
        pid && canWrite ? ['/api/v1/products/categories', pid] : null,
        () => apiGetProductCategories(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // Order Types from the orders domain (FR-MPRD-8); degrade silently if unavailable.
    const { data: orderTypes } = useSWR(
        canWrite ? ['/api/v1/order-types'] : null,
        () => apiGetOrderTypes<OrderType[]>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [form, setForm] = useState<FormState>({
        name: '',
        description: '',
        category: '',
        price: '',
        unit: 'ONE_TIME',
        orderTypeId: '',
    })
    const [prefillFields, setPrefillFields] = useState<PrefillRow[]>([])
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)

    // Hydrate form once product loads.
    useEffect(() => {
        if (!product) return
        setForm({
            name: product.name ?? '',
            description: product.description ?? '',
            category: product.category ?? '',
            price: String(product.price ?? ''),
            unit: toUnitEnum(product.unit),
            orderTypeId: product.orderTypeId ?? '',
        })
        setPrefillFields(
            Object.entries(product.prefill ?? {}).map(([field, value], i) => ({
                id: `pf_${i}`,
                field,
                value: String(value),
            })),
        )
        setDirty(false)
    }, [product])

    const categoryOptions = useMemo(
        () => (categories || []).filter(Boolean).map((c) => ({ value: c, label: c })),
        [categories],
    )
    const orderTypeOptions = useMemo(
        () => (orderTypes || []).map((ot) => ({ value: ot.id, label: ot.name })),
        [orderTypes],
    )

    /**
     * GAP-PRODUCTS-121: `orderTypeName` — денормализованная копия имени, и домен
     * при переданном `order_type_id` перезаписывает её значением из запроса
     * (`order_type_name ?? ''` — omitted и '' на proto3 неразличимы). Поэтому
     * отправлять id без разрешённого имени нельзя: продукт сохранился бы с
     * валидным id и ПУСТЫМ именем, причём `orderTypeDangling` домен при этом
     * сбрасывает в false — битую связь не поймал бы никто.
     *
     * Правило: связь (id + name) уезжает в запрос только когда она разрешена
     * (тип найден в справочнике) либо очищена пользователем ('' = отвязка).
     * Не разрешена — поля вообще не отправляем (домен трактует omitted как «не
     * трогать»), а если пользователь при этом СМЕНИЛ тип — блокируем сохранение,
     * потому что его выбор молча не применился бы.
     */
    const selectedOrderType = useMemo(
        () =>
            form.orderTypeId
                ? (orderTypes || []).find((ot) => ot.id === form.orderTypeId)
                : undefined,
        [orderTypes, form.orderTypeId],
    )
    const orderTypesLoaded = Array.isArray(orderTypes)
    const orderTypeUnresolved = Boolean(form.orderTypeId) && !selectedOrderType
    const orderTypeChanged = form.orderTypeId !== (product?.orderTypeId ?? '')
    const orderTypeBlocksSave = orderTypeUnresolved && orderTypeChanged

    const isArchived = product?.status === 'archived'

    const handleChange = (field: keyof FormState, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        setDirty(true)
    }

    const addPrefillField = () => {
        setPrefillFields((prev) => [...prev, { id: `pf_${Date.now()}`, field: '', value: '' }])
        setDirty(true)
    }
    const updatePrefillField = (rid: string, key: keyof PrefillRow, value: string) => {
        setPrefillFields((prev) => prev.map((pf) => (pf.id === rid ? { ...pf, [key]: value } : pf)))
        setDirty(true)
    }
    const removePrefillField = (rid: string) => {
        setPrefillFields((prev) => prev.filter((pf) => pf.id !== rid))
        setDirty(true)
    }

    const goBack = () => {
        // ST-30 dirty-guard.
        if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) {
            return
        }
        navigate(-1)
    }

    const handleSave = async () => {
        if (!id || !pid || !form.name.trim()) return
        // Пользователь сменил тип продажи, но связь не разрешена — сохранение
        // молча не применило бы выбор (см. selectedOrderType).
        if (orderTypeBlocksSave) {
            notifyError(
                orderTypesLoaded
                    ? 'Выбранный тип продажи не найден в справочнике — выберите действующий'
                    : 'Справочник типов продаж ещё не загружен — подождите и повторите',
            )
            return
        }
        setSaving(true)
        try {
            const prefill = prefillFields.reduce<Record<string, string>>((acc, pf) => {
                if (pf.field.trim()) acc[pf.field.trim()] = pf.value
                return acc
            }, {})
            await apiUpdateProduct<Product>(
                id,
                {
                    name: form.name.trim(),
                    price: Number(form.price) || 0,
                    unit: toUnitEnum(form.unit),
                    // GAP-PRODUCTS-020: раньше слали `|| undefined` — JSON.stringify
                    // выбрасывает undefined-ключи, тело запроса приходило без поля,
                    // домен видел `undefined` («не трогать») и старое значение
                    // выживало. Очистить описание/категорию было невозможно.
                    // Пустая строка домен/gateway отрабатывают корректно (сброс).
                    description: form.description,
                    category: form.category,
                    // GAP-PRODUCTS-120: `null` на proto3 string-поле (без optional)
                    // выбрасывается при сериализации целиком — домен видел undefined
                    // вместо '' и не отвязывал тип продажи. '' домен уже обрабатывает
                    // как сброс + orderTypeDangling=false.
                    // GAP-PRODUCTS-121: неразрешённую связь не отправляем вовсе —
                    // иначе домен затрёт имя пустой строкой (см. selectedOrderType).
                    ...(orderTypeUnresolved
                        ? {}
                        : {
                              orderTypeId: form.orderTypeId || '',
                              orderTypeName: selectedOrderType?.name ?? '',
                          }),
                    // Пустой объект = «очистить все предзаполняемые поля»: домен
                    // различает omitted (не трогать) и {} (сбросить).
                    prefill,
                },
                { projectId: pid },
            )
            notifySuccess('Сохранено')
            setDirty(false)
            await mutate()
            navigate(`/products/${id}`)
        } catch (e) {
            notifyError(extractApiError(e).message || 'Не удалось сохранить продукт')
        } finally {
            setSaving(false)
        }
    }

    // ST-10 No-permission.
    if (!canWrite) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-16 text-center gap-3"
                        {...qa('products.edit.locked')}
                    >
                        <PiLockDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold">Раздел недоступен</p>
                        <p className="text-gray-500 text-sm">
                            У вас нет прав на редактирование продукта
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
                <Loading loading={true} {...qa('products.edit.loading')} />
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

    // ST-6 Error.
    if (error) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-12 text-center gap-3"
                        {...qa('products.edit.error')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                        <p className="text-gray-600 dark:text-gray-300">
                            Не удалось загрузить продукт
                        </p>
                        <div className="flex gap-2">
                            <Button variant="solid" onClick={() => mutate()} {...qa('products.edit.retry')}>
                                Повторить
                            </Button>
                            <Button variant="plain" onClick={() => navigate('/products')} {...qa('products.edit.errorBack')}>
                                К списку
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-9 Not found.
    if (!product) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('products.edit.notFound')}>
                        <p className="text-gray-500">Продукт не найден</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate('/products')}
                            {...qa('products.edit.backToList')}
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
            <div className="flex flex-col gap-4" {...qa('products.edit')}>
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={goBack}
                        title="Назад"
                        {...qa('products.edit.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">Редактирование продукта</h3>
                </div>

                {/* ST-22 archived → read-only banner */}
                {isArchived && (
                    <div
                        className="flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-800 px-4 py-3 text-sm text-gray-600 dark:text-gray-300"
                        {...qa('products.edit.archivedBanner')}
                    >
                        <PiWarningCircleDuotone className="w-5 h-5" />
                        Архивный продукт нельзя редактировать. Восстановите его в карточке.
                    </div>
                )}

                <AdaptiveCard>
                    <h5 className="mb-4">Основная информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Название *</label>
                            <Input
                                value={form.name}
                                disabled={isArchived}
                                onChange={(e) => handleChange('name', e.target.value)}
                                {...qa('products.edit.name')}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Описание</label>
                            <Input
                                textArea
                                rows={3}
                                value={form.description}
                                disabled={isArchived}
                                onChange={(e) => handleChange('description', e.target.value)}
                                {...qa('products.edit.description')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Категория</label>
                            <Select
                                isClearable
                                isDisabled={isArchived}
                                options={categoryOptions}
                                value={categoryOptions.find((o) => o.value === form.category) || null}
                                onChange={(opt) => handleChange('category', opt?.value || '')}
                                placeholder="Выберите категорию"
                                components={{ Option: categoryOption }}
                                {...qa('products.edit.category')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Тип продажи</label>
                            <Select
                                options={orderTypeOptions}
                                isDisabled={isArchived}
                                value={orderTypeOptions.find((o) => o.value === form.orderTypeId) || null}
                                onChange={(opt) => handleChange('orderTypeId', opt?.value || '')}
                                isClearable
                                components={{ Option: orderTypeOption, ClearIndicator: orderTypeClear }}
                                placeholder={
                                    orderTypeOptions.length
                                        ? 'Выберите тип продажи'
                                        : 'Нет доступных типов продаж'
                                }
                                {...qa('products.edit.orderType')}
                            />
                            {product.orderTypeDangling && (
                                <p className="text-xs text-amber-600 mt-1" {...qa('products.edit.orderTypeDanglingHint')}>
                                    Текущий тип продажи битый — выберите действующий.
                                </p>
                            )}
                            {orderTypeUnresolved && (
                                <p className="text-xs text-amber-600 mt-1" {...qa('products.edit.orderTypeUnresolvedHint')}>
                                    {orderTypesLoaded
                                        ? 'Выбранный тип продажи не найден в справочнике — выберите действующий или очистите поле.'
                                        : 'Справочник типов продаж недоступен: связь с типом продажи сейчас изменить нельзя, остальные поля сохраняются.'}
                                </p>
                            )}
                        </div>
                        {/* W-6: отдел-владелец задаётся при создании и дальше неизменен —
                            домен игнорирует ownerDepartmentId в update (S6). Показываем
                            read-only, чтобы поле не выглядело редактируемым и не терялось
                            молча при сохранении. */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Отдел-владелец
                            </label>
                            <Input
                                readOnly
                                value={departmentName(product.ownerDepartmentId) ?? ''}
                                placeholder="Весь проект"
                                {...qa('products.edit.ownerDepartment')}
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Задаётся при создании продукта и дальше не меняется.
                            </p>
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Ценообразование</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Базовая цена ({product.currency || 'RUB'}) *
                            </label>
                            <Input
                                type="number"
                                value={form.price}
                                disabled={isArchived}
                                onChange={(e) => handleChange('price', e.target.value)}
                                {...qa('products.edit.price')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Единица</label>
                            <Select
                                options={unitOptions}
                                isDisabled={isArchived}
                                value={unitOptions.find((o) => o.value === form.unit) || null}
                                onChange={(opt) => handleChange('unit', opt?.value || 'ONE_TIME')}
                                {...qa('products.edit.unit')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <div className="flex items-center justify-between mb-4">
                        <h5>Предзаполняемые поля продажи</h5>
                        {!isArchived && (
                            <Button
                                size="xs"
                                variant="solid"
                                icon={<PiPlusDuotone />}
                                onClick={addPrefillField}
                                {...qa('products.edit.prefillAdd')}
                            >
                                Добавить поле
                            </Button>
                        )}
                    </div>
                    {prefillFields.length === 0 ? (
                        <p className="text-sm text-gray-500">Нет предзаполняемых полей</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 font-medium">Поле</th>
                                        <th className="text-left py-2 font-medium">Значение</th>
                                        <th className="w-12" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {prefillFields.map((pf) => (
                                        <tr key={pf.id} className="border-b last:border-0" {...qa('products.edit.prefillRow', { row: pf.id })}>
                                            <td className="py-2 pr-2">
                                                <Input
                                                    size="sm"
                                                    value={pf.field}
                                                    disabled={isArchived}
                                                    onChange={(e) =>
                                                        updatePrefillField(pf.id, 'field', e.target.value)
                                                    }
                                                    placeholder="Название поля"
                                                    {...qa('products.edit.prefillField')}
                                                />
                                            </td>
                                            <td className="py-2 pr-2">
                                                <Input
                                                    size="sm"
                                                    value={pf.value}
                                                    disabled={isArchived}
                                                    onChange={(e) =>
                                                        updatePrefillField(pf.id, 'value', e.target.value)
                                                    }
                                                    placeholder="Значение"
                                                    {...qa('products.edit.prefillValue')}
                                                />
                                            </td>
                                            <td className="py-2">
                                                {!isArchived && (
                                                    <button
                                                        className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500"
                                                        onClick={() => removePrefillField(pf.id)}
                                                        title="Удалить"
                                                        {...qa('products.edit.prefillRemove', { row: pf.id })}
                                                    >
                                                        <PiXBold className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AdaptiveCard>

                <div className="flex justify-end gap-3">
                    <Button variant="plain" onClick={goBack} disabled={saving} {...qa('products.edit.cancel')}>
                        Отмена
                    </Button>
                    {!isArchived && (
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={handleSave}
                            loading={saving}
                            disabled={!form.name.trim() || orderTypeBlocksSave}
                            {...qa('products.edit.save')}
                        >
                            Сохранить
                        </Button>
                    )}
                </div>
            </div>
        </Container>
    )
}

export default ProductEdit
