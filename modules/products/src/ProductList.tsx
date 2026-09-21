import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import useSWR, { useSWRConfig } from 'swr'
import {
    PiPlusDuotone,
    PiMagnifyingGlassDuotone,
    PiPackageDuotone,
    PiWarningCircleDuotone,
    PiLockDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import Segment from '@/components/ui/Segment'
import Pagination from '@/components/ui/Pagination'
import {
    apiGetProducts,
    apiGetProductCategories,
    apiCreateProduct,
} from '@/services/CrmService'
import type { Product } from '@/@types/crm'
import ProductsTabs from './ProductsTabs'
import { qa, QA_IDS_ENABLED } from './qa'
import { makeQaSelectOption } from './qaSelectOption'
import {
    categoryTagClass,
    unitLabel,
    toUnitEnum,
    unitOptions,
    formatPrice,
    notifySuccess,
    notifyError,
    extractApiError,
    isModuleDisabledError,
    ModuleDisabledState,
} from './productsUi'

type StatusFilter = 'active' | 'archived' | 'all'

// GAP-PRODUCTS-030 / NFR-720: домен клампит page_size до 100, поэтому «загрузить всё»
// одной страницей физически невозможно — каталог >100 позиций молча обрезался.
// Держим страницу кратной сетке карточек (1/2/3/4 колонки).
const PAGE_SIZE = 24
const SEARCH_DEBOUNCE_MS = 350
const categoryFilterOption = makeQaSelectOption<{ value: string; label: string }>(
    'products.list.categoryOption',
    'category',
)
const createCategoryOption = makeQaSelectOption<{ value: string; label: string }>(
    'products.create.categoryOption',
    'category',
)

const ProductList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate: globalMutate } = useSWRConfig()

    // FE gating (FR-MPRD-10) — UX only, backend-guard is the source of truth.
    const can = usePermission()
    const canRead = can('products', 'read')
    const canWrite = can('products', 'write')
    // W-6: справочник отделов для «Отдел-владелец» в форме создания продукта.
    const { options: departmentOptions, unavailable: departmentsUnavailable } =
        useDepartmentOptions(canWrite)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    // searchInput — то, что печатает пользователь; searchQuery — то, что уходит на сервер.
    const [searchInput, setSearchInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
    const [page, setPage] = useState(1)

    useEffect(() => {
        const t = setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [searchInput])

    // Любая смена условий выборки возвращает на первую страницу — иначе можно
    // оказаться на «пустой» 5-й странице сузившегося результата.
    useEffect(() => {
        setPage(1)
    }, [searchQuery, categoryFilter, statusFilter])

    // GAP-PRODUCTS-030: query/category/status/pageIndex/pageSize — реальные параметры
    // запроса (домен умеет regex-поиск с экранированием, фильтр по категории и сортировку).
    // Раньше всё это фильтровалось на клиенте в пределах единственной загруженной страницы.
    const tableData = useMemo(
        () => ({
            pageIndex: page - 1, // gateway ждёт 0-based page_index
            pageSize: PAGE_SIZE,
            query: searchQuery,
            category: categoryFilter,
            status: statusFilter,
            sort: 'updatedAt',
        }),
        [page, searchQuery, categoryFilter, statusFilter],
    )

    const swrKey = pid && canRead ? ['/api/v1/products', tableData, pid] : null
    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        () =>
            apiGetProducts<{ list: Product[]; total: number }, typeof tableData & { projectId: string }>({
                ...tableData,
                projectId: pid!,
            }),
        // shouldRetryOnError:false — на 403 MODULE_DISABLED и прочих ошибках
        // не спамим ретраями; ручной «Повторить» остаётся для обычных сбоев.
        // keepPreviousData — при листании/поиске сетка не схлопывается в спиннер.
        { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true },
    )

    // Categories from distinct endpoint (FR-MPRD-17); degrade silently if unavailable.
    const { data: categories } = useSWR(
        pid && canRead ? ['/api/v1/products/categories', pid] : null,
        () => apiGetProductCategories(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const products = data?.list || []
    const total = data?.total ?? 0
    const categoryOptions = useMemo(
        () => (categories || []).filter(Boolean).map((c) => ({ value: c, label: c })),
        [categories],
    )

    // Счётчик битых привязок считается по загруженной странице — честно так и подписан.
    const danglingCount = useMemo(
        () => products.filter((p) => p.orderTypeDangling).length,
        [products],
    )

    const hasFilters = Boolean(searchQuery || categoryFilter)

    // ST-6 Error / ST-3 Empty / ST-4 Empty-filter — отличаем явно (closes OQ-UX-PRODUCTS-9).
    // Пусто/не найдено теперь определяется серверным total, а не длиной одной страницы.
    const showError = Boolean(error) && !isLoading
    const showEmpty = !isLoading && !error && total === 0 && !hasFilters
    const showEmptyFilter = !isLoading && !error && total === 0 && hasFilters

    const emptyForm = {
        name: '',
        description: '',
        category: '',
        price: '',
        unit: 'ONE_TIME',
        ownerDepartmentId: '',
    }
    const [formData, setFormData] = useState(emptyForm)

    const resetForm = () => setFormData(emptyForm)
    const closeDrawer = () => {
        setDrawerOpen(false)
        resetForm()
    }

    const resetFilters = () => {
        setSearchInput('')
        setSearchQuery('')
        setCategoryFilter('')
    }

    const handleCreateProduct = async () => {
        if (!pid || !formData.name.trim()) return
        setSubmitting(true)
        try {
            const created = await apiCreateProduct<Product>(
                {
                    name: formData.name.trim(),
                    price: Number(formData.price) || 0,
                    unit: toUnitEnum(formData.unit),
                    // Пустая строка на create безопасна (домен всё равно пишет ''),
                    // но так форма не отличается от редактора — одна семантика полей.
                    description: formData.description,
                    category: formData.category,
                    // W-6: пусто = продукт уровня проекта (домен пишет null).
                    ownerDepartmentId: formData.ownerDepartmentId || undefined,
                },
                { projectId: pid },
            )
            notifySuccess('Продукт создан')
            closeDrawer()
            await mutate()
            // refresh distinct categories if a new one was introduced
            globalMutate(['/api/v1/products/categories', pid])
            if (created?.id) navigate(`/products/${created.id}`)
        } catch (e) {
            const { message } = extractApiError(e)
            notifyError(message || 'Не удалось создать продукт')
        } finally {
            setSubmitting(false)
        }
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

    // ST-10 No-permission (route) — FR-MOD-27b graceful gate.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-16 text-center gap-3"
                        {...qa('products.list.locked')}
                    >
                        <PiLockDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold">Раздел недоступен</p>
                        <p className="text-gray-500 text-sm">
                            У вас нет прав на просмотр каталога продуктов
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
          <div className="flex flex-col gap-4" {...qa('products.list')}>
            <ProductsTabs />
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                            {total > 0 && (
                                <span className="text-sm text-gray-500" {...qa('products.list.totalCount')}>
                                    {hasFilters ? 'Найдено' : 'Всего'}: {total}
                                </span>
                            )}
                            {danglingCount > 0 && (
                                <Tag
                                    className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                    {...qa('products.list.danglingBadge')}
                                >
                                    {danglingCount} с битой привязкой на странице
                                </Tag>
                            )}
                        </div>
                        {canWrite && (
                            <Button
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusDuotone />}
                                onClick={() => setDrawerOpen(true)}
                                {...qa('products.list.create')}
                            >
                                Продукт
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex-1 min-w-[200px] max-w-md">
                            {/* Поиск серверный (домен ищет по названию, regex с экранированием). */}
                            <Input
                                placeholder="Поиск по названию..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                {...qa('products.list.search')}
                            />
                        </div>
                        <div className="w-[180px]">
                            <Select
                                placeholder="Категория"
                                isClearable
                                options={categoryOptions}
                                value={categoryOptions.find((o) => o.value === categoryFilter) || null}
                                onChange={(option) => setCategoryFilter(option?.value || '')}
                                components={{ Option: categoryFilterOption }}
                                {...qa('products.list.categoryFilter')}
                            />
                        </div>
                        <Segment
                            value={statusFilter}
                            onChange={(val) => setStatusFilter(val as StatusFilter)}
                            size="sm"
                            {...qa('products.list.statusSegment')}
                        >
                            <Segment.Item value="active" {...qa('products.list.statusActive')}>
                                Активные
                            </Segment.Item>
                            <Segment.Item value="archived" {...qa('products.list.statusArchived')}>
                                Архив
                            </Segment.Item>
                        </Segment>
                    </div>

                    {showError ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('products.list.error')}
                        >
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">
                                Не удалось загрузить каталог
                            </p>
                            <Button variant="solid" onClick={() => mutate()} {...qa('products.list.retry')}>
                                Повторить
                            </Button>
                        </div>
                    ) : showEmpty ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('products.list.empty')}
                        >
                            <PiPackageDuotone className="w-16 h-16 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">
                                {statusFilter === 'archived'
                                    ? 'В архиве нет продуктов'
                                    : 'Продуктов ещё нет'}
                            </p>
                            {statusFilter !== 'archived' && (
                                <p className="text-gray-500 text-sm">
                                    Создайте первый продукт каталога
                                </p>
                            )}
                            {canWrite && statusFilter !== 'archived' && (
                                <Button
                                    variant="solid"
                                    color="primary"
                                    icon={<PiPlusDuotone />}
                                    onClick={() => setDrawerOpen(true)}
                                    className="mt-2"
                                    {...qa('products.list.createEmpty')}
                                >
                                    Создать продукт
                                </Button>
                            )}
                        </div>
                    ) : showEmptyFilter ? (
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('products.list.emptyFilter')}
                        >
                            <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Ничего не найдено</p>
                            <p className="text-gray-500 text-sm">
                                Попробуйте изменить условия поиска
                            </p>
                            <Button variant="plain" onClick={resetFilters} {...qa('products.list.resetFilters')}>
                                Сбросить фильтры
                            </Button>
                        </div>
                    ) : (
                        <Loading loading={isLoading} {...qa('products.list.loading')}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {products.map((product) => (
                                    <Card
                                        key={product.id}
                                        className="cursor-pointer hover:shadow-lg transition-shadow"
                                        onClick={() => navigate(`/products/${product.id}`)}
                                        {...qa('products.list.card', { product: product.id })}
                                    >
                                        <div className="flex flex-col h-full">
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <h5 className="font-semibold heading-text text-base line-clamp-2">
                                                    {product.name}
                                                </h5>
                                                {product.status === 'archived' && (
                                                    <Tag className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 shrink-0">
                                                        Архив
                                                    </Tag>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {product.category && (
                                                    <Tag className={categoryTagClass(product.category)}>
                                                        {product.category}
                                                    </Tag>
                                                )}
                                                {product.orderTypeDangling && (
                                                    <Tag className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                                        Тип не назначен
                                                    </Tag>
                                                )}
                                            </div>

                                            <div className="mt-auto">
                                                <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                                                    {formatPrice(
                                                        product.effectivePrice ?? product.price,
                                                        product.currency,
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 mb-3">
                                                    {unitLabel(product.unit)}
                                                </div>

                                                {product.orderTypeName && (
                                                    <div className="text-xs text-gray-500 mb-2">
                                                        Тип продажи:{' '}
                                                        <span className="font-medium">
                                                            {product.orderTypeName}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t">
                                                    <span>{product.dealsCount} сделок</span>
                                                    <span>{product.ordersCount} продаж</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
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
                                        onChange={(p) => setPage(p)}
                                        qaScope={
                                            QA_IDS_ENABLED ? 'products.list.pagination' : undefined
                                        }
                                    />
                                </div>
                            )}
                        </Loading>
                    )}
                </div>
            </AdaptiveCard>
          </div>

            <Drawer
                isOpen={drawerOpen}
                onClose={closeDrawer}
                title="Создать продукт"
                {...qa('products.create.drawer')}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button variant="plain" onClick={closeDrawer} disabled={submitting} {...qa('products.create.cancel')}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={handleCreateProduct}
                            loading={submitting}
                            disabled={!formData.name.trim()}
                            {...qa('products.create.submit')}
                        >
                            Создать
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Название <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={formData.name}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            placeholder="Введите название продукта"
                            {...qa('products.create.name')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Описание</label>
                        <Input
                            textArea
                            value={formData.description}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, description: e.target.value }))
                            }
                            placeholder="Описание продукта"
                            {...qa('products.create.description')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Категория</label>
                        <Select
                            placeholder="Выберите категорию"
                            isClearable
                            options={categoryOptions}
                            value={categoryOptions.find((o) => o.value === formData.category) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, category: option?.value || '' }))
                            }
                            components={{ Option: createCategoryOption }}
                            {...qa('products.create.category')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Цена</label>
                        <Input
                            type="number"
                            value={formData.price}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, price: e.target.value }))
                            }
                            placeholder="Введите цену"
                            {...qa('products.create.price')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Тип оплаты</label>
                        <Select
                            placeholder="Выберите тип"
                            options={unitOptions}
                            value={unitOptions.find((o) => o.value === formData.unit) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, unit: option?.value || 'ONE_TIME' }))
                            }
                            {...qa('products.create.unit')}
                        />
                    </div>
                    {/* W-6: отдел-владелец каталожной позиции. Задаётся ТОЛЬКО здесь:
                        `product.service.ts` (S6) не даёт переписать ownerDepartmentId
                        через update, поэтому в форме редактирования поле read-only. */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Отдел-владелец</label>
                        <Select
                            placeholder={
                                departmentsUnavailable
                                    ? 'Справочник отделов недоступен'
                                    : 'Весь проект'
                            }
                            isClearable
                            isDisabled={departmentsUnavailable}
                            options={departmentOptions}
                            value={
                                departmentOptions.find(
                                    (o) => o.value === formData.ownerDepartmentId,
                                ) || null
                            }
                            onChange={(option) =>
                                setFormData((prev) => ({
                                    ...prev,
                                    ownerDepartmentId: option?.value || '',
                                }))
                            }
                            {...qa('products.create.ownerDepartment')}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Пусто — продукт виден всему проекту. После создания отдел не
                            меняется.
                        </p>
                    </div>
                </div>
            </Drawer>
        </Container>
    )
}

export default ProductList
