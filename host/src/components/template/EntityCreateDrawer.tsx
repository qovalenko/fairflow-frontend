import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR, { mutate as globalMutate } from 'swr'
import Drawer from '@/components/ui/Drawer'
import DuplicateCheckDialog from '@/components/shared/DuplicateCheckDialog'
import HostSlot from '@/components/shared/HostSlot'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { qa } from '@/shared/qa'
import {
    apiGetCompanies,
    apiGetContacts,
    apiGetPipelines,
    apiGetMembers,
    apiGetDealSources,
    apiGetOrderTypes,
    apiGetDeals,
    apiGetOrders,
    apiGetProducts,
    apiGetProduct,
    apiGetOrderType,
    apiCreateContact,
    apiCreateCompany,
    apiCreateDeal,
    apiCreateOrder,
    apiFindContactDuplicates,
    apiFindCompanyDuplicates,
    apiCreateActivity,
    newIdempotencyKey,
    type DuplicateCandidate,
} from '@/services/CrmService'
import type {
    Company,
    Contact,
    Pipeline,
    ProjectMember,
    DealSource,
    OrderType,
    OrderTypeDetail,
    Deal,
    Order,
    Product as ProductType,
} from '@/@types/crm'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import { activitiesDefaultReminder } from '@/utils/activitiesDefaultReminder'
import { useSessionUser } from '@/store/authStore'

type ApiErr = {
    response?: { data?: { error?: { message?: string; code?: string }; code?: string } }
    message?: string
}
const errParts = (e: unknown): { message: string; code?: string } => {
    const err = e as ApiErr
    const data = err?.response?.data
    return {
        message: data?.error?.message || err?.message || 'Не удалось выполнить операцию',
        code: data?.error?.code ?? (typeof data?.code === 'string' ? data.code : undefined),
    }
}
const errMessage = (e: unknown): string => errParts(e).message

type DealQuickForm = {
    name: string
    amount: string
    pipelineId: string
    stageId: string
    contactId: string
    companyId: string
    source: string
    assigneeId: string
}

/** Тело `POST /v1/deals` для quick-create (contact mode, без light-lead). */
function buildQuickDealPayload(form: DealQuickForm): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
    }
    if (form.pipelineId) payload.pipelineId = form.pipelineId
    if (form.stageId) payload.stageId = form.stageId
    if (form.contactId) payload.contactId = form.contactId
    if (form.companyId) payload.companyId = form.companyId
    if (form.source) payload.source = form.source
    if (form.assigneeId) payload.assigneeId = form.assigneeId
    return payload
}

export type EntityCreateType =
    | 'contact'
    | 'company'
    | 'deal'
    | 'order'
    | 'task'
    | 'call'
    | 'meeting'
    | 'note'

const ENTITY_TITLES: Record<EntityCreateType, string> = {
    contact: 'Создать контакт',
    company: 'Создать компанию',
    deal: 'Создать сделку',
    order: 'Создать продажу',
    task: 'Создать задачу',
    call: 'Создать звонок',
    meeting: 'Создать встречу',
    note: 'Создать заметку',
}

/**
 * Группа для data-qa-id: task/call/meeting/note — одна и та же форма активности,
 * поэтому у её полей и кнопок общий префикс `host.drawer.activity.*`.
 */
const qaDrawerGroup = (entityType: EntityCreateType): string =>
    entityType === 'task' ||
    entityType === 'call' ||
    entityType === 'meeting' ||
    entityType === 'note'
        ? 'activity'
        : entityType

export type TaskInitialData = {
    contactId?: string
    /** TODO-378: несколько контактов из bulk-выбора списка */
    contactIds?: string[]
    companyId?: string
    dealId?: string
    orderId?: string
}

export type ContactInitialData = {
    companyId?: string
}

export type OrderInitialData = {
    dealId?: string
    contactId?: string
    companyId?: string
    /** FR-PRODUCTS-170: create sale from product card */
    productId?: string
}

type EntityCreateDrawerProps = {
    entityType: EntityCreateType
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
    /** Предзаполнение формы задачи/звонка/встречи при создании из списка сущностей */
    taskInitialData?: TaskInitialData
    /** Предзаполнение формы контакта (например, companyId при создании из карточки компании) */
    contactInitialData?: ContactInitialData
    /** Предзаполнение формы продажи (например, dealId/contactId/companyId при создании из won-сделки) */
    orderInitialData?: OrderInitialData
}

export default function EntityCreateDrawer({
    entityType,
    isOpen,
    onClose,
    onSuccess,
    taskInitialData,
    contactInitialData,
    orderInitialData,
}: EntityCreateDrawerProps) {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const userId = useSessionUser((state) => state.user.userId)
    const currentProject = useProjectStore((s) => s.currentProject)
    const enabledModules = useMemo(() => getEnabledModules(currentProject), [currentProject])
    const [duplicateRecord, setDuplicateRecord] = useState<{
        id: string
        name: string
        subtitle?: string
        deleted?: boolean
    } | null>(null)
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const activityCreateKeyRef = useRef<string | null>(null)
    const [contactForm, setContactForm] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        position: '',
        companyId: '',
        source: '',
        assigneeId: '',
    })
    const [companyForm, setCompanyForm] = useState({
        name: '',
        inn: '',
        phone: '',
        email: '',
        industry: '',
        assigneeId: '',
    })
    const [dealForm, setDealForm] = useState({
        name: '',
        amount: '',
        pipelineId: '',
        stageId: '',
        contactId: '',
        companyId: '',
        source: '',
        assigneeId: '',
    })
    const [showNewCompanyInDeal, setShowNewCompanyInDeal] = useState(false)
    const [newCompanyName, setNewCompanyName] = useState('')
    const [orderForm, setOrderForm] = useState({
        dealId: '',
        contactId: '',
        companyId: '',
        // TODO-208: продукт продажи. Домен пишет `productId` (orders.service),
        // BFF принимает `body.productId` → `product_id` и, если тип продажи не
        // выбран, подставляет его из `product.order_type_id`. Раньше drawer это
        // поле не отправлял вовсе → ручная продажа теряла связь с каталогом.
        productId: '',
        orderTypeId: '',
        assigneeId: '',
        notes: '',
    })
    const [orderCustomFields, setOrderCustomFields] = useState<Record<string, string>>({})
    const lastOrderPrefillProductRef = useRef<string | null>(null)
    const [activityForm, setActivityForm] = useState({
        title: '',
        dueDate: '',
        startDate: '',
        endDate: '',
        direction: 'outbound' as 'inbound' | 'outbound',
        assigneeId: '',
        // TODO-378: несколько контактов (bulk-задача из списка). Форма и submit
        // читают ОДНО и то же поле — видимое состояние равно отправляемому.
        contactIds: [] as string[],
        companyId: '',
        dealId: '',
        orderId: '',
    })

    useEffect(() => {
        if (isOpen && taskInitialData && ['task', 'call', 'meeting', 'note'].includes(entityType)) {
            setActivityForm((prev) => {
                const initialContactIds =
                    taskInitialData.contactIds?.filter(Boolean) ??
                    (taskInitialData.contactId ? [taskInitialData.contactId] : undefined)
                return {
                    ...prev,
                    contactIds: initialContactIds ?? prev.contactIds,
                    companyId: taskInitialData.companyId ?? prev.companyId,
                    dealId: taskInitialData.dealId ?? prev.dealId,
                    orderId: taskInitialData.orderId ?? prev.orderId,
                }
            })
        }
    }, [isOpen, entityType, taskInitialData])

    // FR-ACTIVITIES-010: quick-create defaults assignee to session user (same as ActivityEdit).
    useEffect(() => {
        if (!isOpen || !userId) return
        if (!['task', 'call', 'meeting', 'note'].includes(entityType)) return
        setActivityForm((prev) => ({
            ...prev,
            assigneeId: prev.assigneeId || userId,
        }))
    }, [isOpen, entityType, userId])

    useEffect(() => {
        if (isOpen && contactInitialData && entityType === 'contact') {
            setContactForm((prev) => ({
                ...prev,
                companyId: contactInitialData.companyId ?? prev.companyId,
            }))
        }
    }, [isOpen, entityType, contactInitialData])

    useEffect(() => {
        if (isOpen && orderInitialData && entityType === 'order') {
            setOrderForm((prev) => ({
                ...prev,
                dealId: orderInitialData.dealId ?? prev.dealId,
                contactId: orderInitialData.contactId ?? prev.contactId,
                companyId: orderInitialData.companyId ?? prev.companyId,
                productId: orderInitialData.productId ?? prev.productId,
            }))
        }
    }, [isOpen, entityType, orderInitialData])

    const applyProductContext = useCallback((product: ProductType) => {
        setOrderForm((prev) => ({
            ...prev,
            productId: product.id,
            orderTypeId:
                product.orderTypeId && !product.orderTypeDangling
                    ? product.orderTypeId
                    : prev.orderTypeId,
        }))
        if (product.prefill && Object.keys(product.prefill).length > 0) {
            setOrderCustomFields((prev) => ({
                ...Object.fromEntries(
                    Object.entries(product.prefill!).map(([k, v]) => [
                        k,
                        v == null ? '' : String(v),
                    ]),
                ),
                ...prev,
            }))
        }
    }, [])

    // FR-PRODUCTS-170: load full product (incl. prefill) when creating from catalog.
    useEffect(() => {
        if (!isOpen || entityType !== 'order' || !orderForm.productId || !pid) return
        if (lastOrderPrefillProductRef.current === orderForm.productId) return
        let cancelled = false
        void apiGetProduct<ProductType>(orderForm.productId, pid).then((product) => {
            if (cancelled || !product) return
            lastOrderPrefillProductRef.current = orderForm.productId
            applyProductContext(product)
        })
        return () => {
            cancelled = true
        }
    }, [isOpen, entityType, orderForm.productId, pid, applyProductContext])

    const { data: orderTypeDetail } = useSWR(
        isOpen && entityType === 'order' && orderForm.orderTypeId
            ? ['/api/v1/order-types', orderForm.orderTypeId]
            : null,
        () => apiGetOrderType<OrderTypeDetail>(orderForm.orderTypeId),
        { revalidateOnFocus: false },
    )
    const orderTypeFields = useMemo(
        () => orderTypeDetail?.revision?.fields ?? [],
        [orderTypeDetail],
    )

    const { data: companiesData } = useSWR(
        isOpen && pid ? ['/v1/companies', pid, { pageSize: 1000 }] : null,
        () => apiGetCompanies<{ list: Company[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
    )
    const { data: contactsData } = useSWR(
        isOpen && pid ? ['/v1/contacts', pid, { pageSize: 1000 }] : null,
        () => apiGetContacts<{ list: Contact[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
    )
    const { data: pipelinesData } = useSWR(
        isOpen && (entityType === 'deal' || entityType === 'order') ? ['/api/v1/pipelines'] : null,
        () => apiGetPipelines<Pipeline[]>(),
    )
    const { data: membersData } = useSWR(
        isOpen ? ['/api/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
    )
    const { data: sourcesData } = useSWR(
        isOpen && (entityType === 'contact' || entityType === 'deal') ? ['/api/v1/deal-sources'] : null,
        () => apiGetDealSources<DealSource[]>(),
    )
    const { data: orderTypesData } = useSWR(
        isOpen && entityType === 'order' ? ['/api/v1/order-types'] : null,
        () => apiGetOrderTypes<OrderType[]>(),
    )
    // TODO-208: каталог продуктов для селектора продажи. Гейт зеркалит серверный
    // (`@RequireModule('products')` + `@RequirePermission('products','read')`):
    // при выключенном модуле/без права запрос не шлём и селектор не рисуем —
    // продукт для CreateOrder необязателен.
    const canPickProduct =
        enabledModules.includes('products') && can('products', 'read')
    const { data: productsData } = useSWR(
        isOpen && entityType === 'order' && pid && canPickProduct
            ? ['/api/v1/products', pid, { pageSize: 500 }]
            : null,
        () =>
            apiGetProducts<{ list: ProductType[]; total: number }, { pageSize: number; status: string; projectId: string }>({
                pageSize: 500,
                status: 'active',
                projectId: pid!,
            }),
    )
    const { data: dealsData } = useSWR(
        isOpen && ['task', 'call', 'meeting', 'note', 'order'].includes(entityType) ? ['/api/v1/deals', { pageSize: 500 }] : null,
        () => apiGetDeals<{ list: Deal[]; total: number }, { pageSize: number }>({ pageSize: 500 }),
    )
    const { data: ordersData } = useSWR(
        isOpen && ['task', 'call', 'meeting', 'note'].includes(entityType) ? ['/api/v1/orders', { pageSize: 500 }] : null,
        () => apiGetOrders<{ list: Order[]; total: number }, { pageSize: number }>({ pageSize: 500 }),
    )

    const companyOptions = useMemo(
        () =>
            companiesData?.list?.map((c) => ({ value: c.id, label: c.name })) || [],
        [companiesData],
    )
    const contactOptions = useMemo(
        () =>
            contactsData?.list?.map((c) => ({
                value: c.id,
                label: `${c.firstName} ${c.lastName}`,
            })) || [],
        [contactsData],
    )
    const memberOptions = useMemo(
        () => membersData?.map((m) => ({ value: m.id, label: m.name })) || [],
        [membersData],
    )
    // TODO-208: активные продукты проекта для селектора продажи.
    const productOptions = useMemo(
        () => productsData?.list?.map((p) => ({ value: p.id, label: p.name })) || [],
        [productsData],
    )
    const sourceOptions = useMemo(
        () => sourcesData?.map((s) => ({ value: s.name, label: s.name })) || [],
        [sourcesData],
    )
    const pipelineOptions = useMemo(
        () => pipelinesData?.map((p) => ({ value: p.id, label: p.name })) || [],
        [pipelinesData],
    )
    const stageOptionsForDeal = useMemo(() => {
        if (!dealForm.pipelineId || !pipelinesData) return []
        const pipeline = pipelinesData.find((p) => p.id === dealForm.pipelineId)
        return pipeline?.stages.map((s) => ({ value: s.id, label: s.name })) || []
    }, [dealForm.pipelineId, pipelinesData])
    const orderTypeOptions = useMemo(
        () =>
            orderTypesData?.map((ot) => ({ value: ot.id, label: ot.name })) || [],
        [orderTypesData],
    )
    const dealOptions = useMemo(
        () =>
            dealsData?.list?.map((d) => ({ value: d.id, label: d.name })) || [],
        [dealsData],
    )
    const orderOptions = useMemo(
        () =>
            ordersData?.list?.map((o) => ({ value: o.id, label: o.number || o.id })) || [],
        [ordersData],
    )
    const selectedOrderProduct = useMemo(
        () => productsData?.list?.find((p) => p.id === orderForm.productId),
        [productsData, orderForm.productId],
    )
    // FR-PRODUCTS-150: manual sale from a product with a broken/missing sale-type.
    const orderProductBlocksSale = Boolean(
        orderForm.productId &&
            (!selectedOrderProduct?.orderTypeId || selectedOrderProduct.orderTypeDangling),
    )

    const resetAll = () => {
        setContactForm({
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            position: '',
            companyId: '',
            source: '',
            assigneeId: '',
        })
        setCompanyForm({
            name: '',
            inn: '',
            phone: '',
            email: '',
            industry: '',
            assigneeId: '',
        })
        setDealForm({
            name: '',
            amount: '',
            pipelineId: '',
            stageId: '',
            contactId: '',
            companyId: '',
            source: '',
            assigneeId: '',
        })
        setShowNewCompanyInDeal(false)
        setNewCompanyName('')
        setOrderForm({
            dealId: '',
            contactId: '',
            companyId: '',
            productId: '',
            orderTypeId: '',
            assigneeId: '',
            notes: '',
        })
        setOrderCustomFields({})
        lastOrderPrefillProductRef.current = null
        setActivityForm({
            title: '',
            dueDate: '',
            startDate: '',
            endDate: '',
            direction: 'outbound',
            assigneeId: '',
            contactIds: [],
            companyId: '',
            dealId: '',
            orderId: '',
        })
    }

    const handleClose = () => {
        resetAll()
        onClose()
    }

    // doCreate — общий «закрыть + onSuccess». Для контакта (C2) реальный
    // POST идёт через createContactReal; mock-путь остаётся только у прочих
    // сущностей (вне scope C2).
    const doCreate = () => {
        onSuccess?.()
        handleClose()
    }

    /**
     * Реальное создание контакта (контракт §3.3, FR-MCON-1). Единый drawer:
     * глобальный «+» теперь шлёт POST /api/contacts вместо мока (закрытие D-7),
     * с серверным дедуп-радаром (§3.8) вместо in-memory email-проверки.
     */
    const createContactReal = async (
        forceCreate?: boolean,
        trashCollisionResolution?: 'restore' | 'create_new',
    ) => {
        if (!pid) return
        setSubmitting(true)
        try {
            const created = await apiCreateContact(
                {
                    firstName: contactForm.firstName,
                    lastName: contactForm.lastName,
                    phone: contactForm.phone || undefined,
                    email: contactForm.email || undefined,
                    position: contactForm.position || undefined,
                    companyId: contactForm.companyId || undefined,
                    companyIds: contactForm.companyId ? [contactForm.companyId] : undefined,
                    source: contactForm.source || undefined,
                    assigneeId: contactForm.assigneeId || undefined,
                    forceCreate: forceCreate || undefined,
                    trashCollisionResolution,
                },
                { projectId: pid },
            )
            toast.push(
                <Notification
                    title={
                        trashCollisionResolution === 'restore'
                            ? 'Контакт восстановлен из корзины'
                            : 'Контакт создан'
                    }
                    type="success"
                />,
                { placement: 'top-center' },
            )
            // Инвалидируем все списки контактов (SWR-ключи начинаются с '/v1/contacts').
            globalMutate(
                (key) => Array.isArray(key) && key[0] === '/v1/contacts',
                undefined,
                { revalidate: true },
            )
            onSuccess?.()
            handleClose()
            if (created?.id) navigate(`/contacts/${created.id}`)
        } catch (e) {
            const { message, code } = errParts(e)
            if (code === 'TRASH_COLLISION' && !trashCollisionResolution) {
                const restore = window.confirm(
                    `${message}\n\nВосстановить контакт из корзины вместо создания нового?`,
                )
                if (restore) {
                    await createContactReal(undefined, 'restore')
                    return
                }
            }
            toast.push(
                <Notification title={message} type="danger" />,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    /**
     * Реальное создание компании (контракт company.md §3.2 `POST /api/v1/companies`,
     * FR-MCOM-1). Глобальный «+» раньше только закрывал drawer через doCreate(): форма
     * заполнялась, тост не показывался, компания не создавалась. Набор полей — тот,
     * что gateway форвардит в домен (createCompany: name/inn/phone/email/industry/
     * assigneeId); projectId уходит query-параметром внутри apiCreateCompany.
     */
    const createCompanyReal = async (
        trashCollisionResolution?: 'restore' | 'create_new',
    ) => {
        if (!pid) return
        setSubmitting(true)
        try {
            const created = await apiCreateCompany<{ id?: string }>(
                {
                    name: companyForm.name,
                    inn: companyForm.inn || undefined,
                    phone: companyForm.phone || undefined,
                    email: companyForm.email || undefined,
                    industry: companyForm.industry || undefined,
                    assigneeId: companyForm.assigneeId || undefined,
                    trashCollisionResolution,
                },
                { projectId: pid },
            )
            toast.push(
                <Notification
                    title={
                        trashCollisionResolution === 'restore'
                            ? 'Компания восстановлена из корзины'
                            : 'Компания создана'
                    }
                    type="success"
                />,
                { placement: 'top-center' },
            )
            // Инвалидируем все списки компаний (SWR-ключи начинаются с '/v1/companies').
            globalMutate(
                (key) => Array.isArray(key) && key[0] === '/v1/companies',
                undefined,
                { revalidate: true },
            )
            onSuccess?.()
            handleClose()
            if (created?.id) navigate(`/companies/${created.id}`)
        } catch (e) {
            const { message, code } = errParts(e)
            if (code === 'TRASH_COLLISION' && !trashCollisionResolution) {
                const restore = window.confirm(
                    `${message}\n\nВосстановить компанию из корзины вместо создания новой?`,
                )
                if (restore) {
                    await createCompanyReal('restore')
                    return
                }
            }
            toast.push(
                <Notification title={message} type="danger" />,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    /**
     * Реальное создание сделки (контракт deals §3 `POST /api/v1/deals`, FR-MDEAL-1).
     * Quick-create из глобального «+»: раньше fall-through в doCreate() без API
     * (TODO-114 / FR-SHELL-290).
     */
    const createDealReal = async () => {
        if (!pid) return
        setSubmitting(true)
        try {
            const created = await apiCreateDeal<{ id?: string }>(
                buildQuickDealPayload(dealForm),
            )
            toast.push(
                <Notification title="Сделка создана" type="success" />,
                { placement: 'top-center' },
            )
            globalMutate(
                (key) => Array.isArray(key) && key[0] === '/api/v1/deals',
                undefined,
                { revalidate: true },
            )
            onSuccess?.()
            handleClose()
            if (created?.id) navigate(`/deals/${created.id}`)
        } catch (e) {
            toast.push(
                <Notification title={errMessage(e)} type="danger" />,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    /**
     * Реальное создание продажи (контракт orders §3.9 CreateOrder, FR-MORD-11..14).
     * dealId обязателен (строгий контекст сделки, V7); тип продажи обязателен.
     * Серверная валидация полей/иерархии/snapshot — на BFF; здесь — happy-path + ошибки.
     */
    const createOrderReal = async () => {
        setSubmitting(true)
        try {
            const created = await apiCreateOrder<{ id?: string }>({
                dealId: orderForm.dealId || undefined,
                orderTypeId: orderForm.orderTypeId,
                productId: orderForm.productId || undefined,
                contactId: orderForm.contactId || undefined,
                companyId: orderForm.companyId || undefined,
                assigneeId: orderForm.assigneeId || undefined,
                notes: orderForm.notes || undefined,
                customFields:
                    Object.keys(orderCustomFields).length > 0 ? orderCustomFields : undefined,
            })
            toast.push(
                <Notification title="Продажа создана" type="success" />,
                { placement: 'top-center' },
            )
            globalMutate(
                (key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/v1/orders'),
                undefined,
                { revalidate: true },
            )
            onSuccess?.()
            handleClose()
            if (created?.id) navigate(`/orders/${created.id}`)
        } catch (e) {
            toast.push(
                <Notification title={errMessage(e)} type="danger" />,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    const handleSubmit = async () => {
        if (entityType === 'contact') {
            if (!contactForm.firstName || !contactForm.lastName || (!contactForm.phone && !contactForm.email)) return
            if (!pid) return
            // Серверный дедуп-радар: email ИЛИ телефон (§3.8). Деградирует молча.
            let candidates: DuplicateCandidate[] = []
            try {
                const res = await apiFindContactDuplicates({
                    projectId: pid,
                    email: contactForm.email || undefined,
                    phone: contactForm.phone || undefined,
                })
                candidates = res?.candidates ?? []
            } catch {
                candidates = []
            }
            if (candidates.length > 0) {
                const top = candidates[0]
                setDuplicateRecord({
                    id: top.contactId,
                    name: top.displayName,
                    subtitle: top.maskedValue,
                })
                setShowDuplicateDialog(true)
                return
            }
            await createContactReal()
            return
        }
        if (entityType === 'company') {
            if (!companyForm.name) return
            if (!pid) return
            let candidates: { id: string; name: string; inn?: string; deleted?: boolean; matchReason?: string }[] = []
            try {
                const res = await apiFindCompanyDuplicates<{ candidates?: typeof candidates }>({
                    projectId: pid,
                    name: companyForm.name,
                    inn: companyForm.inn || undefined,
                    email: companyForm.email || undefined,
                })
                candidates = res?.candidates ?? []
            } catch {
                candidates = []
            }
            const top = candidates[0]
            if (top) {
                const subtitle = top.deleted
                    ? 'В корзине — можно восстановить'
                    : top.inn
                      ? `ИНН ${top.inn}`
                      : top.matchReason ?? undefined
                setDuplicateRecord({
                    id: top.id,
                    name: top.name,
                    subtitle,
                    deleted: Boolean(top.deleted),
                })
                setShowDuplicateDialog(true)
                return
            }
            await createCompanyReal()
            return
        }
        if (entityType === 'deal') {
            if (!dealForm.name || !dealForm.amount) return
            await createDealReal()
            return
        }
        if (entityType === 'order') {
            // V7: dealId обязателен при создании из сделки; из каталога достаточно productId.
            const hasContext = Boolean(orderForm.dealId || orderForm.productId)
            if (!orderForm.orderTypeId || !hasContext || orderProductBlocksSale) return
            await createOrderReal()
            return
        }
        if (['task', 'call', 'meeting', 'note'].includes(entityType)) {
            if (!activityForm.title) return
            if (entityType === 'call' && !activityForm.direction) return
            if (entityType === 'meeting' && (!activityForm.startDate || !activityForm.endDate)) return
            await createActivityReal()
            return
        }
        doCreate()
    }

    /**
     * Реальное создание активности (activity-контракт §3 `POST /api/activities`,
     * FR-MACT-1/2). Quick-create из глобального Drawer и из карточки сущности:
     * привязка через `links[]` (entity-ref), дефолты type/status/reminderOffset.
     * SEC: `projectId` берётся из контекста проекта (x-project-id), не из тела.
     */
    const createActivityReal = async () => {
        if (!pid) return
        setSubmitting(true)
        const links: { entityType: string; entityId: string }[] = []
        if (activityForm.dealId) links.push({ entityType: 'deal', entityId: activityForm.dealId })
        for (const contactId of activityForm.contactIds) {
            links.push({ entityType: 'contact', entityId: contactId })
        }
        if (activityForm.companyId) links.push({ entityType: 'company', entityId: activityForm.companyId })
        if (activityForm.orderId) links.push({ entityType: 'order', entityId: activityForm.orderId })
        const dueDateMs = activityForm.dueDate
            ? new Date(activityForm.dueDate).getTime()
            : entityType === 'note' || entityType === 'meeting'
              ? undefined
              : Date.now() + 86400000
        const startDateMs = activityForm.startDate
            ? new Date(activityForm.startDate).getTime()
            : undefined
        const endDateMs = activityForm.endDate
            ? new Date(activityForm.endDate).getTime()
            : undefined
        try {
            if (!activityCreateKeyRef.current) activityCreateKeyRef.current = newIdempotencyKey()
            const created = await apiCreateActivity<{ id?: string }>(
                {
                    projectId: pid,
                    type: entityType,
                    title: activityForm.title,
                    status: 'planned',
                    assigneeId: activityForm.assigneeId || userId || undefined,
                    ...(dueDateMs ? { dueDate: dueDateMs } : {}),
                    ...(entityType === 'call' ? { direction: activityForm.direction } : {}),
                    ...(entityType === 'meeting' && startDateMs && endDateMs
                        ? { startDate: startDateMs, endDate: endDateMs }
                        : {}),
                    ...(links.length ? { links } : {}),
                    ...(entityType === 'note'
                        ? {}
                        : { reminderOffset: activitiesDefaultReminder(currentProject?.moduleConfigs) }),
                },
                activityCreateKeyRef.current,
            )
            activityCreateKeyRef.current = null
            toast.push(
                <Notification title="Активность создана" type="success" />,
                { placement: 'top-center' },
            )
            // Инвалидируем все SWR-ключи активностей (список/вкладки/виджет).
            globalMutate(
                (key) =>
                    Array.isArray(key) &&
                    typeof key[0] === 'string' &&
                    key[0].includes('/activities'),
                undefined,
                { revalidate: true },
            )
            onSuccess?.()
            handleClose()
            if (created?.id) navigate(`/activities/${created.id}`)
        } catch (e) {
            toast.push(
                <Notification title={errMessage(e)} type="danger" />,
                { placement: 'top-center' },
            )
        } finally {
            setSubmitting(false)
        }
    }

    const canSubmit = () => {
        switch (entityType) {
            case 'contact':
                return !!(contactForm.firstName && contactForm.lastName && contactForm.phone)
            case 'company':
                return !!companyForm.name
            case 'deal':
                return !!(dealForm.name && dealForm.amount)
            case 'order':
                return !!(
                    orderForm.orderTypeId &&
                    (orderForm.dealId || orderForm.productId) &&
                    !orderProductBlocksSale
                )
            case 'task':
            case 'call':
            case 'meeting':
            case 'note':
                if (!activityForm.title) return false
                if (entityType === 'call' && !activityForm.direction) return false
                if (entityType === 'meeting' && (!activityForm.startDate || !activityForm.endDate)) {
                    return false
                }
                return true
            default:
                return false
        }
    }

    const renderForm = () => {
        if (entityType === 'contact') {
            return (
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Имя *</label>
                        <Input
                            value={contactForm.firstName}
                            placeholder="Имя"
                            {...qa('host.entityCreate.firstName', { entity: 'contact' })}
                            onChange={(e) =>
                                setContactForm((p) => ({ ...p, firstName: e.target.value }))
                            }
                            {...qa('host.globalCreate.contactFirstName')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Фамилия *</label>
                        <Input
                            value={contactForm.lastName}
                            placeholder="Фамилия"
                            {...qa('host.entityCreate.lastName', { entity: 'contact' })}
                            onChange={(e) =>
                                setContactForm((p) => ({ ...p, lastName: e.target.value }))
                            }
                            {...qa('host.globalCreate.contactLastName')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Телефон *</label>
                        <Input
                            value={contactForm.phone}
                            placeholder="+7 900 000-00-00"
                            {...qa('host.entityCreate.phone', { entity: 'contact' })}
                            onChange={(e) =>
                                setContactForm((p) => ({ ...p, phone: e.target.value }))
                            }
                            {...qa('host.globalCreate.contactPhone')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <Input
                            type="email"
                            value={contactForm.email}
                            placeholder="email@example.com"
                            onChange={(e) =>
                                setContactForm((p) => ({ ...p, email: e.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Должность</label>
                        <Input
                            value={contactForm.position}
                            placeholder="Должность"
                            onChange={(e) =>
                                setContactForm((p) => ({ ...p, position: e.target.value }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Компания</label>
                        <Select
                            isClearable
                            placeholder="Выберите компанию"
                            options={companyOptions}
                            value={companyOptions.find((o) => o.value === contactForm.companyId) || null}
                            onChange={(o) =>
                                setContactForm((p) => ({ ...p, companyId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Источник</label>
                        <Select
                            isClearable
                            placeholder="Источник"
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === contactForm.source) || null}
                            onChange={(o) =>
                                setContactForm((p) => ({ ...p, source: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            isClearable
                            placeholder="Ответственный"
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === contactForm.assigneeId) || null}
                            onChange={(o) =>
                                setContactForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                            }
                        />
                    </div>
                </div>
            )
        }

        if (entityType === 'company') {
            const inlineCompanyForm = (
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Название компании *</label>
                        <Input
                            value={companyForm.name}
                            placeholder="Название"
                            {...qa('host.entityCreate.name', { entity: 'company' })}
                            onChange={(e) =>
                                setCompanyForm((p) => ({ ...p, name: e.target.value }))
                            }
                            {...qa('host.globalCreate.companyName')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">ИНН</label>
                        <Input
                            value={companyForm.inn}
                            placeholder="ИНН"
                            onChange={(e) =>
                                setCompanyForm((p) => ({ ...p, inn: e.target.value }))
                            }
                            {...qa('host.globalCreate.companyInn')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Телефон</label>
                        <Input
                            value={companyForm.phone}
                            placeholder="+7 900 000-00-00"
                            onChange={(e) =>
                                setCompanyForm((p) => ({ ...p, phone: e.target.value }))
                            }
                            {...qa('host.globalCreate.companyPhone')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <Input
                            type="email"
                            value={companyForm.email}
                            placeholder="email@example.com"
                            onChange={(e) =>
                                setCompanyForm((p) => ({ ...p, email: e.target.value }))
                            }
                            {...qa('host.globalCreate.companyEmail')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Отрасль</label>
                        <Input
                            value={companyForm.industry}
                            placeholder="Отрасль"
                            onChange={(e) =>
                                setCompanyForm((p) => ({ ...p, industry: e.target.value }))
                            }
                            {...qa('host.globalCreate.companyIndustry')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            isClearable
                            placeholder="Ответственный"
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === companyForm.assigneeId) || null}
                            onChange={(o) =>
                                setCompanyForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                            }
                        />
                    </div>
                </div>
            )
            return (
                <HostSlot
                    id="global.drawer.entity"
                    context={{
                        entityType: 'company',
                        companyForm,
                        setCompanyForm,
                        memberOptions,
                    }}
                    fallback={inlineCompanyForm}
                />
            )
        }

        if (entityType === 'deal') {
            return (
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Название сделки *</label>
                        <Input
                            value={dealForm.name}
                            placeholder="Название"
                            onChange={(e) =>
                                setDealForm((p) => ({ ...p, name: e.target.value }))
                            }
                            {...qa('host.create.deal.name')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Сумма *</label>
                        <Input
                            type="number"
                            value={dealForm.amount}
                            placeholder="0"
                            onChange={(e) =>
                                setDealForm((p) => ({ ...p, amount: e.target.value }))
                            }
                            {...qa('host.create.deal.amount')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Воронка</label>
                        <Select
                            isClearable
                            placeholder="Воронка"
                            options={pipelineOptions}
                            value={pipelineOptions.find((o) => o.value === dealForm.pipelineId) || null}
                            onChange={(o) =>
                                setDealForm((p) => ({
                                    ...p,
                                    pipelineId: o?.value || '',
                                    stageId: '',
                                }))
                            }
                            {...qa('host.create.deal.pipeline')}
                        />
                    </div>
                    {dealForm.pipelineId && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Стадия</label>
                            <Select
                                isClearable
                                placeholder="Стадия"
                                options={stageOptionsForDeal}
                                value={stageOptionsForDeal.find((o) => o.value === dealForm.stageId) || null}
                                onChange={(o) =>
                                    setDealForm((p) => ({ ...p, stageId: o?.value || '' }))
                                }
                                {...qa('host.create.deal.stage')}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">Контакт</label>
                        <Select
                            isClearable
                            placeholder="Контакт"
                            options={contactOptions}
                            value={contactOptions.find((o) => o.value === dealForm.contactId) || null}
                            onChange={(o) =>
                                setDealForm((p) => ({ ...p, contactId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Компания</label>
                        <Select
                            isClearable
                            placeholder="Компания"
                            options={companyOptions}
                            value={companyOptions.find((o) => o.value === dealForm.companyId) || null}
                            onChange={(o) =>
                                setDealForm((p) => ({ ...p, companyId: o?.value || '' }))
                            }
                        />
                        <button
                            type="button"
                            className="text-sm text-blue-600 dark:text-blue-400 mt-1"
                            onClick={() => setShowNewCompanyInDeal((v) => !v)}
                        >
                            {showNewCompanyInDeal ? 'Скрыть' : 'Создать новую компанию'}
                        </button>
                        {showNewCompanyInDeal && (
                            <div className="mt-2 pl-2 border-l-2 border-gray-200 dark:border-gray-600">
                                <Input
                                    value={newCompanyName}
                                    placeholder="Название новой компании"
                                    onChange={(e) => setNewCompanyName(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Источник</label>
                        <Select
                            isClearable
                            placeholder="Источник"
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === dealForm.source) || null}
                            onChange={(o) =>
                                setDealForm((p) => ({ ...p, source: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            isClearable
                            placeholder="Ответственный"
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === dealForm.assigneeId) || null}
                            onChange={(o) =>
                                setDealForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                            }
                        />
                    </div>
                </div>
            )
        }

        if (entityType === 'order') {
            return (
                <div className="flex flex-col gap-4">
                    {/* TODO-208: продукт задаёт связь продажи с каталогом; выбор
                        продукта подставляет его тип продажи (как делает BFF при
                        пустом orderTypeId), но пользователь может его сменить. */}
                    {canPickProduct && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Продукт</label>
                            <Select
                                {...qa('orders.create.product')}
                                isClearable
                                placeholder="Продукт"
                                options={productOptions}
                                value={productOptions.find((o) => o.value === orderForm.productId) || null}
                                onChange={(o) => {
                                    const productId = o?.value || ''
                                    if (!productId) {
                                        lastOrderPrefillProductRef.current = null
                                        setOrderForm((p) => ({ ...p, productId: '' }))
                                        return
                                    }
                                    lastOrderPrefillProductRef.current = null
                                    setOrderForm((p) => ({ ...p, productId }))
                                }}
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Необязательно. Выбор продукта подставит его тип продажи.
                            </p>
                            {orderProductBlocksSale && (
                                <p className="text-xs text-amber-600 mt-1">
                                    У выбранного продукта битая или отсутствующая привязка типа
                                    продажи — создать продажу нельзя.
                                </p>
                            )}
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">Тип продажи *</label>
                        <Select
                            {...qa('orders.create.orderType')}
                            isClearable
                            placeholder="Тип продажи"
                            options={orderTypeOptions}
                            value={orderTypeOptions.find((o) => o.value === orderForm.orderTypeId) || null}
                            onChange={(o) =>
                                setOrderForm((p) => ({ ...p, orderTypeId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Сделка{orderForm.productId ? '' : ' *'}
                        </label>
                        <Select
                            {...qa('orders.create.deal')}
                            isClearable
                            placeholder="Сделка"
                            options={dealOptions}
                            value={dealOptions.find((o) => o.value === orderForm.dealId) || null}
                            onChange={(o) =>
                                setOrderForm((p) => ({ ...p, dealId: o?.value || '' }))
                            }
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            {orderForm.productId
                                ? 'Необязательно при создании из каталога продукта.'
                                : 'Продажа создаётся в контексте сделки.'}
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Контакт</label>
                        <Select
                            {...qa('orders.create.contact')}
                            isClearable
                            placeholder="Контакт"
                            options={contactOptions}
                            value={contactOptions.find((o) => o.value === orderForm.contactId) || null}
                            onChange={(o) =>
                                setOrderForm((p) => ({ ...p, contactId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Компания</label>
                        <Select
                            {...qa('orders.create.company')}
                            isClearable
                            placeholder="Компания"
                            options={companyOptions}
                            value={companyOptions.find((o) => o.value === orderForm.companyId) || null}
                            onChange={(o) =>
                                setOrderForm((p) => ({ ...p, companyId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div {...qa('orders.create.assignee')}>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            isClearable
                            placeholder="Ответственный"
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === orderForm.assigneeId) || null}
                            onChange={(o) =>
                                setOrderForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Примечание</label>
                        <Input
                            {...qa('orders.create.notes')}
                            value={orderForm.notes}
                            placeholder="Примечание"
                            onChange={(e) =>
                                setOrderForm((p) => ({ ...p, notes: e.target.value }))
                            }
                        />
                    </div>
                    {orderTypeFields.length > 0 && (
                        <div className="flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                            <p className="text-sm font-medium">Поля типа продажи</p>
                            {orderTypeFields.map((field) => (
                                <div key={field.key}>
                                    <label className="block text-sm font-medium mb-1">
                                        {field.label}
                                        {field.required ? ' *' : ''}
                                    </label>
                                    {field.type === 'select' ? (
                                        <Select
                                            {...qa('orders.create.customField', { key: field.key })}
                                            options={(field.options || []).map((o) => ({
                                                value: o,
                                                label: o,
                                            }))}
                                            value={
                                                orderCustomFields[field.key]
                                                    ? {
                                                          value: orderCustomFields[field.key],
                                                          label: orderCustomFields[field.key],
                                                      }
                                                    : null
                                            }
                                            onChange={(opt) =>
                                                setOrderCustomFields((prev) => ({
                                                    ...prev,
                                                    [field.key]: opt?.value || '',
                                                }))
                                            }
                                        />
                                    ) : (
                                        <Input
                                            {...qa('orders.create.customField', { key: field.key })}
                                            type={field.type === 'number' ? 'number' : 'text'}
                                            value={orderCustomFields[field.key] ?? ''}
                                            onChange={(e) =>
                                                setOrderCustomFields((prev) => ({
                                                    ...prev,
                                                    [field.key]: e.target.value,
                                                }))
                                            }
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        }

        // task, call, meeting, note
        return (
            <div className="flex flex-col gap-4">
                <div>
                    <label className="block text-sm font-medium mb-1">
                        {entityType === 'task'
                            ? 'Задача'
                            : entityType === 'call'
                              ? 'Тема звонка'
                              : entityType === 'meeting'
                                ? 'Тема встречи'
                                : 'Заметка'}{' '}
                        *
                    </label>
                    <Input
                        value={activityForm.title}
                        placeholder="Название"
                        onChange={(e) =>
                            setActivityForm((p) => ({ ...p, title: e.target.value }))
                        }
                        {...qa('host.drawer.activity.title')}
                    />
                </div>
                {entityType !== 'note' && entityType !== 'meeting' && (
                <div>
                    <label className="block text-sm font-medium mb-1">Срок</label>
                    <Input
                        type="date"
                        value={activityForm.dueDate}
                        onChange={(e) =>
                            setActivityForm((p) => ({ ...p, dueDate: e.target.value }))
                        }
                        {...qa('host.drawer.activity.dueDate')}
                    />
                </div>
                )}
                {entityType === 'call' && (
                    <div {...qa('host.drawer.activity.direction')}>
                        <label className="block text-sm font-medium mb-1">Направление *</label>
                        <Select
                            options={[
                                { value: 'outbound', label: 'Исходящий' },
                                { value: 'inbound', label: 'Входящий' },
                            ]}
                            value={{
                                value: activityForm.direction,
                                label: activityForm.direction === 'inbound' ? 'Входящий' : 'Исходящий',
                            }}
                            onChange={(o) =>
                                setActivityForm((p) => ({
                                    ...p,
                                    direction: (o?.value as 'inbound' | 'outbound') || 'outbound',
                                }))
                            }
                        />
                    </div>
                )}
                {entityType === 'meeting' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium mb-1">Начало *</label>
                            <Input
                                type="datetime-local"
                                value={activityForm.startDate}
                                onChange={(e) =>
                                    setActivityForm((p) => ({ ...p, startDate: e.target.value }))
                                }
                                {...qa('host.drawer.activity.meetingStart')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Окончание *</label>
                            <Input
                                type="datetime-local"
                                value={activityForm.endDate}
                                onChange={(e) =>
                                    setActivityForm((p) => ({ ...p, endDate: e.target.value }))
                                }
                                {...qa('host.drawer.activity.meetingEnd')}
                            />
                        </div>
                    </>
                )}
                <div {...qa('host.drawer.activity.assignee')}>
                    <label className="block text-sm font-medium mb-1">Ответственный</label>
                    <Select
                        isClearable
                        placeholder="Ответственный"
                        options={memberOptions}
                        value={memberOptions.find((o) => o.value === activityForm.assigneeId) || null}
                        onChange={(o) =>
                            setActivityForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                        }
                    />
                </div>
                <div {...qa('host.drawer.activity.contacts')}>
                    <label className="block text-sm font-medium mb-1">Контакты</label>
                    <Select
                        isMulti
                        isClearable
                        placeholder="Контакты"
                        options={contactOptions}
                        value={contactOptions.filter((o) => activityForm.contactIds.includes(o.value))}
                        onChange={(opts) => {
                            const ids = Array.isArray(opts) ? opts.map((o) => o.value) : []
                            setActivityForm((p) => ({ ...p, contactIds: ids }))
                        }}
                    />
                </div>
                <div {...qa('host.drawer.activity.company')}>
                    <label className="block text-sm font-medium mb-1">Компания</label>
                    <Select
                        isClearable
                        placeholder="Компания"
                        options={companyOptions}
                        value={companyOptions.find((o) => o.value === activityForm.companyId) || null}
                        onChange={(o) =>
                            setActivityForm((p) => ({ ...p, companyId: o?.value || '' }))
                        }
                    />
                </div>
                <div {...qa('host.drawer.activity.deal')}>
                    <label className="block text-sm font-medium mb-1">Сделка</label>
                    <Select
                        isClearable
                        placeholder="Сделка"
                        options={dealOptions}
                        value={dealOptions.find((o) => o.value === activityForm.dealId) || null}
                        onChange={(o) =>
                            setActivityForm((p) => ({ ...p, dealId: o?.value || '' }))
                        }
                    />
                </div>
                <div {...qa('host.drawer.activity.order')}>
                    <label className="block text-sm font-medium mb-1">Продажа</label>
                    <Select
                        isClearable
                        placeholder="Продажа"
                        options={orderOptions}
                        value={orderOptions.find((o) => o.value === activityForm.orderId) || null}
                        onChange={(o) =>
                            setActivityForm((p) => ({ ...p, orderId: o?.value || '' }))
                        }
                    />
                </div>
            </div>
        )
    }

    return (
        <>
        <Drawer
            isOpen={isOpen}
            title={ENTITY_TITLES[entityType]}
            {...qa('host.entityCreate.drawer', {
                entity: entityType,
                ...(entityType === 'order' && orderInitialData?.productId
                    ? { product: orderInitialData.productId }
                    : {}),
            })}
            footer={
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        disabled={submitting}
                        onClick={handleClose}
                        {...qa('host.globalCreate.cancel', { entity: entityType })}
                        {...qa(`host.drawer.${qaDrawerGroup(entityType)}.cancel`)}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={submitting}
                        disabled={!canSubmit() || submitting}
                        onClick={handleSubmit}
                        {...qa('host.entityCreate.submit', { entity: entityType })}
                        {...(entityType === 'deal' ? qa('host.create.deal.submit') : {})}
                        {...qa('host.globalCreate.submit', { entity: entityType })}
                        {...(entityType === 'order' ? qa('orders.create.submit') : {})}
                        {...qa(`host.drawer.${qaDrawerGroup(entityType)}.submit`)}
                    >
                        Создать
                    </Button>
                </div>
            }
            onClose={handleClose}
        >
            {renderForm()}
        </Drawer>
        {(entityType === 'contact' || entityType === 'company') && (
            <DuplicateCheckDialog
                isOpen={showDuplicateDialog}
                similarRecord={duplicateRecord}
                entityLabel={entityType === 'contact' ? 'контакт' : 'компанию'}
                onClose={() => {
                    setShowDuplicateDialog(false)
                    setDuplicateRecord(null)
                }}
                onLink={() => {
                    const rec = duplicateRecord
                    setShowDuplicateDialog(false)
                    setDuplicateRecord(null)
                    // findOne фильтрует deletedAt:null — переход на карточку
                    // корзинного дубля даёт 404. FR-COMPANIES-415: восстановить.
                    if (entityType === 'company' && rec?.deleted) {
                        void createCompanyReal('restore')
                        return
                    }
                    if (pid && rec) {
                        navigate(`/${entityType === 'contact' ? 'contacts' : 'companies'}/${rec.id}`)
                    }
                    handleClose()
                }}
                onCreateNew={() => {
                    setShowDuplicateDialog(false)
                    setDuplicateRecord(null)
                    if (entityType === 'contact') {
                        // «Создать новую» поверх живого дубля → force_create (§3.3, FR-MCON-8).
                        void createContactReal(true)
                    } else {
                        void createCompanyReal('create_new')
                    }
                }}
            />
        )}
        </>
    )
}
