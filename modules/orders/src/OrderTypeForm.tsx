import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiArrowLeftDuotone, PiPlusDuotone, PiXBold, PiDotsSixVerticalDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { apiCreateOrderType, apiUpdateOrderType, apiGetOrderType, apiGetMembers } from '@/services/CrmService'
import { apiListConnections } from '@/services/AutomationService'
import { apiListTemplates } from '@/services/DocumentsService'
import type { ProjectMember } from '@/@types/crm'
import {
    extractError,
    notifySuccess,
    normalizeList,
    isModuleDisabledError,
} from './orderUtils'
import { qa } from './qa'

/** Ответ GetOrderType (§3.2): тип + ревизия (fields/stages/...). */
type OrderTypeDetail = {
    id: string
    name: string
    description?: string
    currentVersion?: number
    revision?: {
        version?: number
        fields?: {
            key?: string
            label?: string
            type?: string
            required?: boolean
            /** Варианты списка (§3.2 `options`) — только для type=SELECT. */
            options?: string[]
        }[]
        stages?: {
            id?: string
            name?: string
            order?: number
            isTerminal?: boolean
            requiredFieldKeys?: string[]
        }[]
        documentTemplates?: { id?: string }[]
        finalActionSpec?: { type?: string; config?: Record<string, unknown> }
        retryPolicy?: { maxAttempts?: number; baseIntervalSec?: number }
    }
}

interface FieldDef {
    id: string
    /**
     * Ключ поля в сохранённой ревизии. Есть только у загруженных полей; у новых
     * ключ вычисляется слагом из названия при сохранении. Держим его отдельно,
     * чтобы переименование поля НЕ меняло ключ (иначе уже записанные значения
     * продаж осиротеют, а `requiredFieldKeys` этапов перестанут на него ссылаться).
     */
    key?: string
    name: string
    type: string
    required: boolean
    /**
     * TODO-411: варианты для поля типа «Список» (`OrderTypeSpec.field.options`).
     * Домен валидирует значение продажи по этому набору (`reason: 'option'`), а
     * BFF при сохранении кладёт `options: Array.isArray(f.options) ? f.options : []`
     * — т.е. отсутствие поля в payload ЗАТИРАЛО уже настроенные варианты.
     */
    options: string[]
}

interface StageDef {
    id: string
    name: string
    /** Ключи полей, обязательных для выхода с этапа (§3.2 `required_field_keys`). */
    requiredFieldKeys: string[]
}

type FinalActionType = 'none' | 'webhook' | 'email' | 'task'

const fieldTypeOptions = [
    { value: 'text', label: 'Текст' },
    { value: 'number', label: 'Число' },
    { value: 'date', label: 'Дата' },
    { value: 'select', label: 'Список' },
    { value: 'file', label: 'Файл' },
    { value: 'checkbox', label: 'Чекбокс' },
]

/** Ключ поля в спеке: у загруженного поля — стабильный, у нового — слаг из названия. */
const slugify = (s: string, i: number) =>
    s.trim().toLowerCase().replace(/[^a-z0-9а-я]+/giu, '_').replace(/^_+|_+$/g, '') || `field_${i}`
const fieldKeyOf = (f: FieldDef, i: number) => f.key || slugify(f.name, i)

/**
 * Получатель письма — РОВНО один почтовый ящик: зеркало
 * `automation/executors/email-template.isValidEmailAddress` (список адресов,
 * «Имя <a@b.ru>», пробелы и управляющие символы там терминальная ошибка
 * `email_recipient_invalid`, т.е. уже после закрытия продажи). Проверяем в
 * форме, чтобы конфиг не сохранялся заведомо отвергаемым.
 */
const SINGLE_MAILBOX =
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/
/** `{{ order.number }}` — адрес-плейсхолдер резолвится при отправке, форма его не проверяет. */
const EMAIL_PLACEHOLDER = /\{\{\s*[A-Za-z0-9_.-]+\s*\}\}/

const OrderTypeForm = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const isEdit = id !== 'new'
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canManage = can('orders', 'manage')
    // Каталог подключений живёт в модуле «Автоматизация» и закрыт правом
    // `automation:manage` (GET /v1/automation/connections) — без него выбрать
    // endpoint для webhook нельзя.
    const canManageAutomation = can('automation', 'manage')
    // Каталог шаблонов документов закрыт ровно тем правом, что проверяет сервер
    // на GET /v1/document-templates (`@RequirePermission('documents','read')`).
    const canReadDocuments = can('documents', 'read')
    const [saving, setSaving] = useState(false)

    const [name, setName] = useState('')
    const [fields, setFields] = useState<FieldDef[]>([])
    /** Черновик нового варианта списка (по id поля) — TODO-411. */
    const [optionDraft, setOptionDraft] = useState<Record<string, string>>({})
    const [stages, setStages] = useState<StageDef[]>([])
    const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
    const [finalAction, setFinalAction] = useState<FinalActionType>('none')
    /**
     * FR-ORDERS-035 (anti-SSRF): endpoint webhook'а — ССЫЛКА на подключение из
     * allowlist проекта, а не сырой URL. `final-action.consumer.mapAction`
     * читает `config.connection_id` и без него возвращает
     * `webhook_connection_required`, так что форма с полем «URL» собирала конфиг,
     * который исполнитель гарантированно отвергал. URL/метод/заголовки задаются
     * в самом подключении (модуль «Автоматизация»), тело формирует automation.
     */
    const [webhookConnectionId, setWebhookConnectionId] = useState('')
    /** Сырой URL из старой (до-allowlist) ревизии — только чтобы честно сказать, что он больше не применяется. */
    const [legacyWebhookUrl, setLegacyWebhookUrl] = useState('')
    const [retryCount, setRetryCount] = useState('3')
    const [retryDelay, setRetryDelay] = useState('60')
    // FR-ORDERS-040/240/270: конфиг email/task теперь управляемый и уезжает в
    // finalActionSpec.config (ранее подформы были неуправляемыми, а buildPayload
    // отправлял только { type } — настройки молча терялись при сохранении).
    const [emailTo, setEmailTo] = useState('')
    const [emailSubject, setEmailSubject] = useState('')
    const [emailTemplate, setEmailTemplate] = useState('')
    const [taskTitle, setTaskTitle] = useState('')
    const [taskDescription, setTaskDescription] = useState('')
    const [taskAssigneeId, setTaskAssigneeId] = useState('')
    const [dragItem, setDragItem] = useState<number | null>(null)
    const [currentVersion, setCurrentVersion] = useState<number | null>(null)

    // Реальные участники проекта вместо захардкоженных m1/m2/m3.
    const { data: membersData } = useSWR(
        finalAction === 'task' ? ['/api/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const memberOptions = useMemo(
        () => normalizeList<ProjectMember>(membersData).map((m) => ({ value: m.id, label: m.name })),
        [membersData],
    )

    /**
     * Каталог шаблонов документов проекта. Раньше здесь были литералы `t1..t4`,
     * и выбранное уходило в ревизию типа (`documentTemplates`) как ссылки на
     * несуществующие шаблоны — генерация по такому типу нашла бы пустоту.
     * Источник — модуль «Документы»: GET /v1/document-templates
     * (contextType=order, только опубликованные: черновик документ не породит).
     */
    const {
        data: templatesData,
        error: templatesError,
        isLoading: loadingTemplates,
    } = useSWR(
        pid && canReadDocuments ? ['/document-templates', pid, 'order-type'] : null,
        () => apiListTemplates({ projectId: pid!, contextType: 'order', status: 'published' }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    /**
     * Шаблон, привязанный к ДРУГОМУ типу продажи, этому типу неприменим:
     * documents сужает выдачу предикатом `orderTypeId ∈ {тип, '', null}`
     * (documents.service.listTemplates), повторяем ту же логику на клиенте —
     * BFF сужает по order_type_id только когда пришёл recordId продажи.
     */
    const templateOptions = useMemo(() => {
        const items = templatesData?.items ?? []
        const opts = items
            .filter((t) => !t.orderTypeId || (isEdit && t.orderTypeId === id))
            .map((t) => ({ value: t.id, label: t.name }))
        if (loadingTemplates) return opts
        const known = new Set(opts.map((o) => o.value))
        // Шаблоны, уже сохранённые в ревизии, но отсутствующие в выдаче (архив,
        // удаление, чужой тип) показываем как есть: иначе Select их не увидел бы,
        // а следующее сохранение молча вырезало бы их из типа.
        return [
            ...opts,
            ...selectedTemplates
                .filter((tid) => !known.has(tid))
                .map((tid) => ({ value: tid, label: `${tid} — недоступен` })),
        ]
    }, [templatesData, loadingTemplates, selectedTemplates, isEdit, id])

    // Allowlist подключений проекта — источник endpoint'а для webhook.
    const {
        data: connectionsData,
        error: connectionsError,
        isLoading: loadingConnections,
    } = useSWR(
        finalAction === 'webhook' && pid && canManageAutomation
            ? ['/automation/connections', pid, 'order-type-final-action']
            : null,
        () => apiListConnections({ projectId: pid!, pageSize: 200 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    // Выключенные подключения показываем помеченными, а не прячем: иначе уже
    // сохранённая ссылка на выключенное подключение выглядела бы как «пусто».
    const connectionOptions = useMemo(
        () =>
            (connectionsData?.list ?? []).map((c) => ({
                value: c.id,
                label: c.enabled ? c.name : `${c.name} (выключено)`,
            })),
        [connectionsData],
    )
    /**
     * Сохранённая ссылка указывает на подключение, которого в allowlist больше
     * нет (удалено или пришло из старой ревизии как сырой URL — `mapAction`
     * читает и `urlRef`). Тогда Select пуст, а id в стейте остался: без явного
     * сигнала пользователь пересохранил бы тип с мёртвой ссылкой, и отправка
     * упала бы уже после закрытия продажи. Судим только по ПОЛНОЙ странице
     * каталога: усечённый список (list < total) о принадлежности не говорит.
     */
    const connectionsComplete =
        Array.isArray(connectionsData?.list) &&
        connectionsData.list.length >= Number(connectionsData.total ?? 0)
    const connectionUnresolved =
        Boolean(webhookConnectionId) &&
        connectionsComplete &&
        !connectionOptions.some((o) => o.value === webhookConnectionId)

    // Опции мультиселекта «обязательные поля этапа»: ровно те ключи, которые
    // уедут в спеку (см. buildPayload) — иначе домен ответит `unknown_key`.
    const fieldKeyOptions = useMemo(
        () =>
            fields
                // Индекс берётся ДО фильтрации: fieldKeyOf использует его как
                // запасной ключ, и он обязан совпасть с индексом в buildPayload.
                .map((f, i) => ({ value: fieldKeyOf(f, i), label: f.name.trim() }))
                .filter((o) => !!o.label),
        [fields],
    )

    // ST-1: при edit грузим текущую ревизию типа (§3.2 GetOrderType, FR-MORD-4).
    const { data: typeDetail, isLoading: loadingType, error: loadError } = useSWR(
        isEdit && id ? [`/api/v1/order-types/${id}`, id] : null,
        () => apiGetOrderType<OrderTypeDetail>(id!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    useEffect(() => {
        if (!typeDetail) return
        setName(typeDetail.name || '')
        setCurrentVersion(typeDetail.currentVersion ?? typeDetail.revision?.version ?? null)
        const rev = typeDetail.revision
        setFields(
            (rev?.fields || []).map((f, i) => ({
                id: f.key || `f_${i}`,
                key: f.key || undefined,
                name: f.label || f.key || '',
                type: String(f.type || 'text').toLowerCase(),
                required: !!f.required,
                // TODO-411: без переноса вариантов любое сохранение типа стирало
                // их (BFF пишет пустой массив) и ломало валидацию продаж.
                options: Array.isArray(f.options) ? f.options.map(String) : [],
            })),
        )
        setStages(
            [...(rev?.stages || [])]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((s, i) => ({
                    id: s.id || `st_${i}`,
                    name: s.name || '',
                    // FR-ORDERS-020: раньше эти ключи не переносились из ревизии,
                    // и любое сохранение типа стирало required-gate этапов.
                    requiredFieldKeys: Array.isArray(s.requiredFieldKeys) ? s.requiredFieldKeys : [],
                })),
        )
        setSelectedTemplates((rev?.documentTemplates || []).map((t) => t.id || '').filter(Boolean))
        const fa = rev?.finalActionSpec
        if (fa?.type && ['none', 'webhook', 'email', 'task'].includes(fa.type)) {
            setFinalAction(fa.type as FinalActionType)
        }
        const cfg = (fa?.config ?? {}) as Record<string, unknown>
        // Конфиг webhook — плоский `connection_id` (те же алиасы, что читает
        // `final-action.consumer.mapAction`). Вложенная форма `config.webhook`
        // осталась только в старых ревизиях: сырой URL оттуда исполнителем не
        // применяется, поэтому не подставляем его в поле, а честно предупреждаем.
        const legacy = cfg.webhook as Record<string, unknown> | undefined
        setWebhookConnectionId(
            String(
                cfg.connection_id ??
                    cfg.connectionId ??
                    cfg.urlRef ??
                    cfg.url_ref ??
                    legacy?.urlRef ??
                    legacy?.url_ref ??
                    '',
            ),
        )
        setLegacyWebhookUrl(typeof legacy?.url === 'string' ? legacy.url : '')
        // Конфиг email/task — плоский: automation `final-action.consumer.mapAction`
        // отдаёт `spec.config` исполнителю как есть (email → {to, template},
        // task → create_activity читает {title, description, userId}).
        if (fa?.type === 'email') {
            setEmailTo(typeof cfg.to === 'string' ? cfg.to : '')
            setEmailSubject(typeof cfg.subject === 'string' ? cfg.subject : '')
            setEmailTemplate(typeof cfg.template === 'string' ? cfg.template : '')
        }
        if (fa?.type === 'task') {
            setTaskTitle(typeof cfg.title === 'string' ? cfg.title : '')
            setTaskDescription(typeof cfg.description === 'string' ? cfg.description : '')
            setTaskAssigneeId(typeof cfg.userId === 'string' ? cfg.userId : '')
        }
        if (rev?.retryPolicy) {
            setRetryCount(String(rev.retryPolicy.maxAttempts ?? 3))
            setRetryDelay(String(rev.retryPolicy.baseIntervalSec ?? 60))
        }
    }, [typeDetail])

    const addField = () => {
        setFields((prev) => [
            ...prev,
            { id: `f_${Date.now()}`, name: '', type: 'text', required: false, options: [] },
        ])
    }

    const updateField = (id: string, key: 'name' | 'type' | 'required', value: string | boolean) => {
        setFields((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: value } : f)))
    }

    const removeField = (id: string) => {
        setFields((prev) => prev.filter((f) => f.id !== id))
    }

    /** TODO-411: добавить вариант списка (дубликаты и пустые отсекаем — домен сверяет по точному значению). */
    const addFieldOption = (id: string) => {
        const raw = (optionDraft[id] ?? '').trim()
        if (!raw) return
        setFields((prev) =>
            prev.map((f) =>
                f.id === id && !f.options.includes(raw) ? { ...f, options: [...f.options, raw] } : f,
            ),
        )
        setOptionDraft((prev) => ({ ...prev, [id]: '' }))
    }

    const removeFieldOption = (id: string, option: string) => {
        setFields((prev) =>
            prev.map((f) => (f.id === id ? { ...f, options: f.options.filter((o) => o !== option) } : f)),
        )
    }

    const addStage = () => {
        setStages((prev) => [...prev, { id: `st_${Date.now()}`, name: '', requiredFieldKeys: [] }])
    }

    const updateStage = (id: string, key: 'name', value: string) => {
        setStages((prev) => prev.map((s) => (s.id === id ? { ...s, [key]: value } : s)))
    }

    const updateStageRequired = (id: string, keys: string[]) => {
        setStages((prev) => prev.map((s) => (s.id === id ? { ...s, requiredFieldKeys: keys } : s)))
    }

    const removeStage = (id: string) => {
        setStages((prev) => prev.filter((s) => s.id !== id))
    }

    const handleDragStart = (index: number) => {
        setDragItem(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragItem === null || dragItem === index) return
        const reordered = [...fields]
        const [moved] = reordered.splice(dragItem, 1)
        reordered.splice(index, 0, moved)
        setFields(reordered)
        setDragItem(index)
    }

    const handleDragEnd = () => {
        setDragItem(null)
    }

    // V1 (FR-MORD-9): название + ≥1 этап + у полей есть имена.
    const validate = (): string | null => {
        if (!name.trim()) return 'Укажите название типа продажи'
        if (stages.length === 0) return 'Добавьте хотя бы один этап'
        if (fields.some((f) => !f.name.trim())) return 'У всех полей должно быть название'
        // TODO-411: SELECT без вариантов домен примет, но значение поля потом
        // отвергнет любым (`reason: 'option'`) — продажа встанет на этапе.
        if (fields.some((f) => f.type === 'select' && f.options.length === 0)) {
            return 'У поля-списка укажите хотя бы один вариант'
        }
        if (stages.some((s) => !s.name.trim())) return 'У всех этапов должно быть название'
        // Конфиг финального действия обязателен: без него automation завершит
        // отправку ошибкой уже после закрытия продажи.
        if (finalAction === 'webhook' && !webhookConnectionId) {
            return canManageAutomation
                ? 'Выберите подключение для webhook'
                : 'Настроить webhook может только пользователь с правом управления автоматизацией'
        }
        if (finalAction === 'webhook' && connectionUnresolved) {
            return 'Сохранённое подключение не найдено в списке проекта — выберите действующее'
        }
        if (finalAction === 'email') {
            const to = emailTo.trim()
            if (!to) return 'Укажите получателя письма'
            // Плейсхолдер резолвится при отправке — его форма проверить не может.
            if (!EMAIL_PLACEHOLDER.test(to) && !SINGLE_MAILBOX.test(to)) {
                return 'Получатель — один почтовый адрес: списки, «Имя <a@b.ru>» и пробелы исполнитель отвергает'
            }
        }
        if (finalAction === 'task' && !taskTitle.trim()) return 'Укажите название задачи'
        return null
    }

    /**
     * `finalActionSpec` для сохранения. Конфиг ВСЕХ веток — ПЛОСКИЙ: automation
     * (`final-action.consumer.mapAction`) передаёт `spec.config` исполнителю без
     * распаковки, а `create_activity` читает `title`/`description`/`userId`.
     */
    const buildFinalActionSpec = () => {
        if (finalAction === 'webhook') {
            // Только ссылка на подключение: URL/метод/заголовки берутся из
            // самого подключения, а `mapAction` из конфига типа продажи читает
            // ровно `connection_id` (сырой URL отвергается — anti-SSRF).
            return { type: 'webhook', config: { connection_id: webhookConnectionId } }
        }
        if (finalAction === 'email') {
            // Ключи ровно как в схеме send_email (registry: {to, subject, template}).
            // Пустые subject/template НЕ отправляем: пустая строка не nullish и
            // побила бы дефолт исполнителя (та же грабля, что с `userId` ниже).
            return {
                type: 'email',
                config: {
                    to: emailTo.trim(),
                    ...(emailSubject.trim() ? { subject: emailSubject.trim() } : {}),
                    ...(emailTemplate.trim() ? { template: emailTemplate } : {}),
                },
            }
        }
        if (finalAction === 'task') {
            return {
                type: 'task',
                config: {
                    title: taskTitle.trim(),
                    description: taskDescription.trim(),
                    // Пустой `userId` НЕ отправляем: activity-executor берёт
                    // `cfg.userId ?? payload.assignee_id`, и пустая строка (не
                    // nullish) победила бы фолбэк на ответственного за продажу.
                    ...(taskAssigneeId ? { userId: taskAssigneeId } : {}),
                },
            }
        }
        return { type: 'none', config: {} }
    }

    const buildPayload = () => {
        const keys = fields.map((f, i) => fieldKeyOf(f, i))
        const known = new Set(keys)
        return {
            name: name.trim(),
            fields: fields.map((f, i) => ({
                key: keys[i],
                label: f.name.trim(),
                type: String(f.type).toUpperCase(),
                required: f.required,
                // TODO-411: варианты уходят только у SELECT — для остальных типов
                // домен их не читает, а BFF всё равно нормализует в [].
                options: f.type === 'select' ? f.options : [],
            })),
            stages: stages.map((s, i) => ({
                id: s.id,
                name: s.name.trim(),
                order: i,
                // Домен отклоняет спеку с `unknown_key`, поэтому отсеиваем ссылки
                // на поля, удалённые уже после настройки этапа.
                requiredFieldKeys: s.requiredFieldKeys.filter((k) => known.has(k)),
                isTerminal: i === stages.length - 1,
            })),
            documentTemplates: selectedTemplates.map((t) => ({ id: t })),
            finalActionSpec: buildFinalActionSpec(),
            retryPolicy: {
                maxAttempts: Number(retryCount) || 3,
                strategy: 'exponential',
                baseIntervalSec: Number(retryDelay) || 60,
                maxWaitSec: 3600,
            },
        }
    }

    const handleSave = async () => {
        if (!canManage) return
        const validationError = validate()
        if (validationError) {
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('orders.typeForm.validation')}>
                    {validationError}
                </Notification>,
                { placement: 'top-center' },
            )
            return
        }
        setSaving(true)
        try {
            const payload = buildPayload()
            if (isEdit && id) {
                await apiUpdateOrderType(id, payload)
                notifySuccess('Тип продажи обновлён (новая ревизия)')
            } else {
                await apiCreateOrderType(payload)
                notifySuccess('Тип продажи создан')
            }
            navigate('/orders/types')
        } catch (err) {
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('orders.typeForm.saveError')}>
                    {extractError(err, 'Не удалось сохранить тип продажи')}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setSaving(false)
        }
    }

    // ST-1: загрузка ревизии при редактировании.
    if (isEdit && loadingType) {
        return (
            <Container>
                <Loading loading={true} {...qa('orders.typeForm.loading')} />
            </Container>
        )
    }

    // ST-6/ST-9: тип не найден / ошибка загрузки.
    if (isEdit && (loadError || typeDetail === null)) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8">
                        <p className="text-gray-500">Не удалось загрузить тип продажи</p>
                        <Button variant="solid" color="primary" className="mt-4" onClick={() => navigate('/orders/types')}>
                            К списку типов
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
                        onClick={() => navigate(-1)}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">{isEdit ? 'Редактирование типа продажи' : 'Новый тип продажи'}</h3>
                    {isEdit && currentVersion != null && (
                        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            Версия {currentVersion}
                        </Tag>
                    )}
                </div>

                {/* ST-11/12: без orders:manage — конструктор только для чтения. */}
                {!canManage && (
                    <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm text-gray-500">
                        Просмотр без права управления типами продаж — сохранять изменения нельзя.
                    </div>
                )}
                {isEdit && (
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300">
                        {currentVersion != null
                            ? `Текущая версия: ${currentVersion}. Сохранение создаст ревизию ${currentVersion + 1}.`
                            : 'Правка создаёт новую ревизию типа.'}{' '}
                        Идущие продажи продолжают работать на своей версии.
                    </div>
                )}

                <AdaptiveCard>
                    <div className="max-w-lg">
                        <label className="block text-sm font-medium mb-1">Название типа продажи *</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Введите название"
                            {...qa('orders.typeForm.name')}
                        />
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <div className="flex items-center justify-between mb-4">
                        <h5>Поля</h5>
                        <Button
                            size="xs"
                            variant="solid"
                            icon={<PiPlusDuotone />}
                            {...qa('orders.typeForm.addField')}
                            onClick={addField}
                        >
                            Добавить поле
                        </Button>
                    </div>

                    {fields.length === 0 ? (
                        <p className="text-sm text-gray-500">Нет полей. Добавьте первое поле.</p>
                    ) : (
                        <div className="space-y-2">
                            {fields.map((field, index) => (
                                <div
                                    key={field.id}
                                    className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                                    draggable
                                    {...qa('orders.typeForm.fieldRow', { field: field.id })}
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div className="flex items-center gap-2">
                                        <PiDotsSixVerticalDuotone className="w-4 h-4 text-gray-400 cursor-grab flex-shrink-0" />
                                        <Input
                                            size="sm"
                                            className="flex-1"
                                            value={field.name}
                                            onChange={(e) => updateField(field.id, 'name', e.target.value)}
                                            placeholder="Название поля"
                                        />
                                        <div className="w-36">
                                            <Select
                                                size="sm"
                                                options={fieldTypeOptions}
                                                value={fieldTypeOptions.find((o) => o.value === field.type) || null}
                                                onChange={(opt) => updateField(field.id, 'type', opt?.value || 'text')}
                                            />
                                        </div>
                                        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={field.required}
                                                onChange={(e) => updateField(field.id, 'required', e.target.checked)}
                                                className="w-4 h-4 rounded"
                                            />
                                            <span className="text-xs whitespace-nowrap">Обяз.</span>
                                        </label>
                                        <button
                                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500 flex-shrink-0"
                                            onClick={() => removeField(field.id)}
                                            title="Удалить"
                                        >
                                            <PiXBold className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {/* TODO-411: редактор вариантов для поля-списка.
                                        Значения уходят в `field.options` спеки — по ним
                                        домен валидирует значение продажи, а OrderEdit
                                        рисует из них Select. */}
                                    {field.type === 'select' && (
                                        <div className="mt-2 pl-6">
                                            <div className="flex flex-wrap items-center gap-1 mb-2">
                                                {field.options.length === 0 ? (
                                                    <span className="text-xs text-gray-500">
                                                        Вариантов нет — добавьте хотя бы один.
                                                    </span>
                                                ) : (
                                                    field.options.map((opt) => (
                                                        <Tag
                                                            key={opt}
                                                            className="bg-white dark:bg-gray-700 flex items-center gap-1"
                                                        >
                                                            <span>{opt}</span>
                                                            <button
                                                                type="button"
                                                                title={`Удалить вариант «${opt}»`}
                                                                aria-label={`Удалить вариант ${opt}`}
                                                                className="text-gray-400 hover:text-red-500"
                                                                onClick={() =>
                                                                    removeFieldOption(field.id, opt)
                                                                }
                                                            >
                                                                <PiXBold className="w-3 h-3" />
                                                            </button>
                                                        </Tag>
                                                    ))
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 max-w-sm">
                                                <Input
                                                    size="sm"
                                                    value={optionDraft[field.id] ?? ''}
                                                    placeholder="Новый вариант"
                                                    onChange={(e) =>
                                                        setOptionDraft((prev) => ({
                                                            ...prev,
                                                            [field.id]: e.target.value,
                                                        }))
                                                    }
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault()
                                                            addFieldOption(field.id)
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    size="xs"
                                                    onClick={() => addFieldOption(field.id)}
                                                >
                                                    Добавить
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <div className="flex items-center justify-between mb-4">
                        <h5>Этапы</h5>
                        <Button
                            size="xs"
                            variant="solid"
                            icon={<PiPlusDuotone />}
                            {...qa('orders.typeForm.addStage')}
                            onClick={addStage}
                        >
                            Добавить этап
                        </Button>
                    </div>

                    {stages.length === 0 ? (
                        <p className="text-sm text-gray-500">Нет этапов. Добавьте первый этап.</p>
                    ) : (
                        <div className="space-y-3">
                            {stages.map((stage) => (
                                <div
                                    key={stage.id}
                                    className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                                >
                                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Название этапа
                                            </label>
                                            <Input
                                                size="sm"
                                                value={stage.name}
                                                onChange={(e) => updateStage(stage.id, 'name', e.target.value)}
                                                placeholder="Название этапа"
                                            />
                                        </div>
                                        {/* FR-ORDERS-020: обязательные поля этапа —
                                            домен блокирует переход дальше, пока они
                                            не заполнены (`REQUIRED_FIELDS_MISSING`). */}
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Обязательные поля для выхода с этапа
                                            </label>
                                            {fieldKeyOptions.length === 0 ? (
                                                <p className="text-xs text-gray-400 h-[34px] flex items-center">
                                                    Сначала добавьте поля типа продажи.
                                                </p>
                                            ) : (
                                                <div {...qa('orders.typeForm.stageRequiredFields', { stage: stage.id })}>
                                                    <Select
                                                        isMulti
                                                        size="sm"
                                                        options={fieldKeyOptions}
                                                        value={fieldKeyOptions.filter((o) =>
                                                            stage.requiredFieldKeys.includes(o.value),
                                                        )}
                                                        onChange={(opts) =>
                                                            updateStageRequired(
                                                                stage.id,
                                                                Array.isArray(opts) ? opts.map((o) => o.value) : [],
                                                            )
                                                        }
                                                        placeholder="Не обязательны"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500 flex-shrink-0 mt-6"
                                        onClick={() => removeStage(stage.id)}
                                        title="Удалить"
                                    >
                                        <PiXBold className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                            Финальный
                        </Tag>
                        <span className="text-sm font-medium">Завершён</span>
                        <span className="text-xs text-gray-500 ml-auto">Фиксированный этап</span>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Шаблоны документов</h5>
                    {!canReadDocuments ? (
                        <p className="text-sm text-gray-500">
                            Нет доступа к шаблонам документов — нужно право «Документы: чтение».
                            {selectedTemplates.length > 0 &&
                                ` Уже настроенные шаблоны (${selectedTemplates.length}) сохранятся без изменений.`}
                        </p>
                    ) : loadingTemplates ? (
                        <p className="text-sm text-gray-500">Загрузка шаблонов…</p>
                    ) : templatesError ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                            Не удалось загрузить шаблоны документов
                            {isModuleDisabledError(templatesError)
                                ? ': модуль «Документы» выключен в проекте.'
                                : '. Попробуйте позже.'}
                        </p>
                    ) : templateOptions.length === 0 ? (
                        <div className="flex flex-col items-start gap-2">
                            <p className="text-sm text-gray-500">
                                В проекте нет опубликованных шаблонов для продаж. Шаблон создаётся и
                                публикуется в модуле «Документы».
                            </p>
                            {/* Портфельный роут `portfolio.documents.templates` — без префикса
                                `/p/:pid`, проект берётся из контекста (как у подключений). */}
                            <Button size="xs" onClick={() => navigate('/documents/templates')}>
                                Настроить шаблоны
                            </Button>
                        </div>
                    ) : (
                        <div {...qa('orders.typeForm.documentTemplates')}>
                            <Select
                                isMulti
                                options={templateOptions}
                                value={templateOptions.filter((o) => selectedTemplates.includes(o.value))}
                                onChange={(opts) =>
                                    setSelectedTemplates(Array.isArray(opts) ? opts.map((o) => o.value) : [])
                                }
                                placeholder="Выберите шаблоны"
                            />
                        </div>
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Финальное действие</h5>
                    <div className="space-y-4">
                        <div className="flex gap-4" {...qa('orders.typeForm.finalAction')}>
                            {(
                                [
                                    { value: 'none', label: 'Нет' },
                                    { value: 'webhook', label: 'Webhook' },
                                    { value: 'email', label: 'Email' },
                                    { value: 'task', label: 'Задача' },
                                ] as const
                            ).map((opt) => {
                                // Webhook требует подключения из allowlist, а каталог
                                // подключений закрыт правом automation:manage. Без него
                                // выбрать ветку нельзя (кроме случая, когда она уже
                                // сохранена в типе — тогда её видно как есть).
                                const blocked =
                                    opt.value === 'webhook' &&
                                    !canManageAutomation &&
                                    finalAction !== 'webhook'
                                return (
                                    <label
                                        key={opt.value}
                                        className={`flex items-center gap-2 ${
                                            blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                        }`}
                                        title={
                                            blocked
                                                ? 'Нужен доступ к подключениям проекта (право «Автоматизация: управление»)'
                                                : undefined
                                        }
                                        {...qa('orders.typeForm.finalActionOption', { type: opt.value })}
                                    >
                                        <input
                                            type="radio"
                                            checked={finalAction === opt.value}
                                            disabled={blocked}
                                            onChange={() => setFinalAction(opt.value)}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm">{opt.label}</span>
                                    </label>
                                )
                            })}
                        </div>

                        {finalAction === 'webhook' && (
                            <div className="space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Подключение *</label>
                                    {!canManageAutomation ? (
                                        <p className="text-sm text-amber-600 dark:text-amber-400">
                                            Список подключений проекта недоступен: нужно право
                                            «Автоматизация: управление». Попросите администратора
                                            завести подключение и настроить финальное действие.
                                        </p>
                                    ) : !pid ? (
                                        <p className="text-sm text-amber-600 dark:text-amber-400">
                                            Проект не выбран — список подключений загрузить нельзя.
                                        </p>
                                    ) : connectionsError ? (
                                        <p className="text-sm text-amber-600 dark:text-amber-400">
                                            Не удалось загрузить подключения проекта
                                            {isModuleDisabledError(connectionsError)
                                                ? ': модуль «Автоматизация» выключен в проекте.'
                                                : '. Попробуйте позже.'}
                                        </p>
                                    ) : loadingConnections ? (
                                        <p className="text-sm text-gray-500">Загрузка подключений…</p>
                                    ) : connectionOptions.length === 0 ? (
                                        <div className="flex flex-col items-start gap-2">
                                            <p className="text-sm text-gray-500">
                                                В проекте нет ни одного подключения. Webhook отправляется
                                                только на адрес из списка разрешённых подключений.
                                            </p>
                                            {/* Каталог подключений — портфельный роут
                                                `portfolio.automation.connections`; проект берётся из
                                                контекста, префикса `/p/:pid` у него НЕТ (такой URL
                                                улетел бы в catch-all 404). */}
                                            <Button
                                                size="xs"
                                                onClick={() => navigate('/automation/connections')}
                                            >
                                                Настроить подключения
                                            </Button>
                                        </div>
                                    ) : (
                                        <div {...qa('orders.typeForm.webhookConnection')}>
                                            <Select
                                                options={connectionOptions}
                                                value={
                                                    connectionOptions.find(
                                                        (o) => o.value === webhookConnectionId,
                                                    ) || null
                                                }
                                                onChange={(opt) => setWebhookConnectionId(opt?.value || '')}
                                                placeholder="Выберите подключение"
                                            />
                                        </div>
                                    )}
                                    <p className="mt-1 text-xs text-gray-500">
                                        Адрес, заголовки и секрет задаются в самом подключении (модуль
                                        «Автоматизация»). Тело запроса формирует система: номер
                                        продажи, ключ идемпотентности и снимок полей.
                                    </p>
                                    {legacyWebhookUrl && (
                                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                            В типе сохранён прямой адрес «{legacyWebhookUrl}» — он больше
                                            не используется. Выберите подключение, иначе отправка
                                            завершится ошибкой.
                                        </p>
                                    )}
                                    {connectionUnresolved && (
                                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                            Сохранённое подключение отсутствует в списке проекта
                                            (удалено или задано старым форматом) — выберите действующее,
                                            иначе отправка завершится ошибкой.
                                        </p>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Повторных попыток</label>
                                        <Input
                                            type="number"
                                            value={retryCount}
                                            onChange={(e) => setRetryCount(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Задержка (сек)</label>
                                        <Input
                                            type="number"
                                            value={retryDelay}
                                            onChange={(e) => setRetryDelay(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {finalAction === 'email' && (
                            <div className="space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Получатель *</label>
                                    <Input
                                        value={emailTo}
                                        onChange={(e) => setEmailTo(e.target.value)}
                                        placeholder="email@example.com"
                                        {...qa('orders.typeForm.emailTo')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Тема</label>
                                    <Input
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        placeholder="Продажа {{order.number}} завершена"
                                        {...qa('orders.typeForm.emailSubject')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Шаблон письма</label>
                                    <Input
                                        textArea
                                        rows={3}
                                        value={emailTemplate}
                                        onChange={(e) => setEmailTemplate(e.target.value)}
                                        placeholder="Текст письма..."
                                    />
                                </div>
                            </div>
                        )}

                        {finalAction === 'task' && (
                            <div className="space-y-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Название задачи *</label>
                                    <Input
                                        value={taskTitle}
                                        onChange={(e) => setTaskTitle(e.target.value)}
                                        placeholder="Задача по продаже {{order.number}}"
                                        {...qa('orders.typeForm.taskTitle')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Описание</label>
                                    <Input
                                        textArea
                                        rows={2}
                                        value={taskDescription}
                                        onChange={(e) => setTaskDescription(e.target.value)}
                                        placeholder="Описание задачи..."
                                    />
                                </div>
                                <div {...qa('orders.typeForm.taskAssignee')}>
                                    <label className="block text-sm font-medium mb-1">Назначить на</label>
                                    <Select
                                        isClearable
                                        options={memberOptions}
                                        value={memberOptions.find((o) => o.value === taskAssigneeId) || null}
                                        onChange={(opt) => setTaskAssigneeId(opt?.value || '')}
                                        placeholder={
                                            memberOptions.length
                                                ? 'Выберите исполнителя'
                                                : 'Участники проекта не найдены'
                                        }
                                        noOptionsMessage={() => 'Участники проекта не найдены'}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Если не выбран — задача уйдёт ответственному за продажу.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                <div className="flex justify-end gap-3">
                    <Button variant="plain" onClick={() => navigate(-1)}>
                        Отмена
                    </Button>
                    {canManage && (
                        <Button
                            variant="solid"
                            color="primary"
                            loading={saving}
                            {...qa('orders.typeForm.save')}
                            onClick={handleSave}
                        >
                            {isEdit ? 'Сохранить' : 'Создать'}
                        </Button>
                    )}
                </div>
            </div>
        </Container>
    )
}

export default OrderTypeForm
