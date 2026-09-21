import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiArrowLeftDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Loading from '@/components/shared/Loading'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiGetActivity,
    apiCreateActivity,
    apiUpdateActivity,
    apiCompleteActivity,
    apiGetMembers,
    newIdempotencyKey,
} from '@/services/CrmService'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import { useSessionUser } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { activitiesDefaultReminder } from '@/utils/activitiesDefaultReminder'
import type { Activity, ActivityType, ProjectMember } from '@/@types/crm'
import {
    normalizeActivity,
    normalizeList,
    toEpochMs,
    toSafeString,
    typeLabel,
    errMessage,
} from './activityShared'
import { ActivityErrorState, ActivityNoPermissionState } from './ActivityStatePanels'
import { qa } from '../qa'

const typeColors: Record<ActivityType, string> = {
    task: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    call: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    note: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
}

const typeOptions = (['task', 'call', 'meeting', 'note'] as ActivityType[]).map(
    (value) => ({ value, label: typeLabel[value] }),
)

const statusOptions = [
    { value: 'planned', label: 'Запланировано' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'completed', label: 'Завершено' },
    { value: 'cancelled', label: 'Отменено' },
]

// Домен запрещает терминальный статус на create (validateStatus: только через
// complete()/отмену существующей) — на новой активности эти опции не предлагаем.
const createStatusOptions = statusOptions.filter(
    (o) => o.value !== 'completed' && o.value !== 'cancelled',
)

const priorityOptions = [
    { value: 'low', label: 'Низкий' },
    { value: 'medium', label: 'Средний' },
    { value: 'high', label: 'Высокий' },
    { value: 'urgent', label: 'Срочный' },
]

/** Enum напоминаний домена activity: none|at_time|15m|1h|1d (activity.service REMINDER_OFFSETS). */
const reminderOptions = [
    { value: 'none', label: 'Без напоминания' },
    { value: 'at_time', label: 'В момент срока' },
    { value: '15m', label: 'За 15 минут' },
    { value: '1h', label: 'За 1 час' },
    { value: '1d', label: 'За 1 день' },
]

const entityTypeLabel: Record<string, string> = {
    deal: 'Сделка',
    contact: 'Контакт',
    company: 'Компания',
    order: 'Заказ',
}

type ActivityForm = {
    type: ActivityType
    title: string
    status: string
    priority: string
    assigneeId: string
    /** W-6: подразделение-владелец (`department_id` в Create/UpdateActivityRequest). */
    departmentId: string
    description: string
    dueDate: string // YYYY-MM-DD (task)
    reminder: string // enum домена: none|at_time|15m|1h|1d
    direction: 'outbound' | 'inbound'
    callDate: string // YYYY-MM-DD
    callTime: string // HH:mm
    meetingStart: string // YYYY-MM-DDTHH:mm
    meetingEnd: string // YYYY-MM-DDTHH:mm
    location: string
    participants: string[]
    noteText: string
}

const makeDefaultForm = (assigneeId: string, reminder = 'none'): ActivityForm => ({
    type: 'task',
    title: '',
    status: 'planned',
    priority: 'medium',
    assigneeId,
    departmentId: '',
    description: '',
    dueDate: '',
    reminder,
    direction: 'outbound',
    callDate: '',
    callTime: '',
    meetingStart: '',
    meetingEnd: '',
    location: '',
    participants: [],
    noteText: '',
})

/** Запись домена → значения формы (таймстампы ms/сек нормализуются toEpochMs). */
const formFromActivity = (a: Activity): ActivityForm => {
    const dueMs = toEpochMs(a.dueDate)
    const startMs = toEpochMs(a.startDate)
    const endMs = toEpochMs(a.endDate)
    return {
        type: a.type,
        title: a.title === 'Без названия' && a.type === 'note' ? '' : a.title,
        status: a.status,
        priority: a.priority,
        assigneeId: a.assigneeId ?? '',
        departmentId: a.departmentId ?? '',
        description: a.type === 'note' ? '' : (a.description ?? ''),
        dueDate: a.type === 'task' && dueMs ? dayjs(dueMs).format('YYYY-MM-DD') : '',
        reminder: a.reminderOffset ?? 'none',
        // Домен принимает ТОЛЬКО inbound|outbound (DIRECTIONS-whitelist); легаси-
        // записи со старым FE-enum incoming/outgoing нормализуем при загрузке.
        direction:
            a.direction === 'inbound' || a.direction === 'incoming'
                ? 'inbound'
                : 'outbound',
        callDate: a.type === 'call' && dueMs ? dayjs(dueMs).format('YYYY-MM-DD') : '',
        callTime: a.type === 'call' && dueMs ? dayjs(dueMs).format('HH:mm') : '',
        meetingStart: startMs ? dayjs(startMs).format('YYYY-MM-DDTHH:mm') : '',
        meetingEnd: endMs ? dayjs(endMs).format('YYYY-MM-DDTHH:mm') : '',
        location: a.location ?? '',
        participants: (a.participants ?? []).map(String).filter(Boolean),
        noteText: a.type === 'note' ? (a.description ?? '') : '',
    }
}

const pushToast = (type: 'success' | 'danger', message: string) => {
    toast.push(<Notification type={type}>{message}</Notification>, {
        placement: 'top-center',
    })
}

const ActivityEdit = () => {
    const { id } = useParams<{ id?: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const pid = useCurrentProjectId()
    const isNew = id === undefined
    const can = usePermission()
    const canWrite = can('activities', 'write') || can('activities', 'manage')
    const userId = useSessionUser((state) => state.user.userId)
    const moduleConfigs = useProjectStore((s) => s.currentProject?.moduleConfigs)
    const defaultReminder = activitiesDefaultReminder(moduleConfigs)
    const createKeyRef = useRef<string | null>(null)
    const completeKeyRef = useRef<string | null>(null)

    const calendarPrefill = useMemo(() => {
        if (!isNew) return null
        const dueParam = searchParams.get('dueDate')
        if (!dueParam) return null
        const parsed = dayjs(dueParam)
        if (!parsed.isValid()) return null
        const hasTime = dueParam.includes('T')
        const dateStr = parsed.format('YYYY-MM-DD')
        const dateTimeStr = parsed.format('YYYY-MM-DDTHH:mm')
        return {
            dueDate: dateStr,
            callDate: dateStr,
            callTime: hasTime ? parsed.format('HH:mm') : '',
            meetingStart: hasTime ? dateTimeStr : `${dateStr}T09:00`,
            meetingEnd: hasTime
                ? parsed.add(1, 'hour').format('YYYY-MM-DDTHH:mm')
                : `${dateStr}T10:00`,
        }
    }, [isNew, searchParams])

    const [form, setForm] = useState<ActivityForm>(() => ({
        ...makeDefaultForm(userId ?? '', defaultReminder),
        ...(calendarPrefill ?? {}),
    }))
    const [initialJson, setInitialJson] = useState<string>(() =>
        JSON.stringify({
            ...makeDefaultForm(userId ?? '', defaultReminder),
            ...(calendarPrefill ?? {}),
        }),
    )
    const [saving, setSaving] = useState(false)

    // Режим edit: загрузка реальной записи (та же ручка, что у ActivityDetails).
    const {
        data: activityRaw,
        isLoading,
        error,
        mutate,
    } = useSWR(
        !isNew && id && canWrite ? [`/api/v1/activities/${id}`, id, pid] : null,
        () => apiGetActivity<Activity>(id!, pid),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const activity = useMemo(() => normalizeActivity(activityRaw), [activityRaw])

    useEffect(() => {
        if (!isNew) return
        setForm((prev) => (prev.reminder === 'none' && defaultReminder !== 'none'
            ? { ...prev, reminder: defaultReminder }
            : prev))
    }, [isNew, defaultReminder])

    useEffect(() => {
        if (isNew || !activity) return
        const filled = formFromActivity(activity)
        setForm(filled)
        setInitialJson(JSON.stringify(filled))
    }, [isNew, activity])

    const { data: membersData } = useSWR(
        canWrite ? ['/api/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false },
    )
    // W-6: справочник отделов для селекта «Отдел».
    const { options: departmentOptions, unavailable: departmentsUnavailable } =
        useDepartmentOptions(canWrite)
    const memberOptions = useMemo(
        () =>
            normalizeList<ProjectMember>(membersData)
                .filter((m) => m && m.id)
                .map((m) => ({
                    value: String(m.id),
                    label: toSafeString(m.name) || toSafeString(m.email) || 'Без имени',
                })),
        [membersData],
    )

    const dirty = JSON.stringify(form) !== initialJson

    const handleChange = (field: keyof ActivityForm, value: string | string[]) => {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    const handleLeave = () => {
        if (
            dirty &&
            !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')
        ) {
            return
        }
        navigate(-1)
    }

    const validate = (): string | null => {
        if (form.type !== 'note' && !form.title.trim()) {
            return 'Укажите название'
        }
        if (!form.assigneeId) {
            return 'Укажите ответственного'
        }
        if (form.type === 'meeting') {
            if (!form.meetingStart || !form.meetingEnd) {
                return 'Для встречи обязательны начало и окончание'
            }
            if (dayjs(form.meetingEnd).valueOf() < dayjs(form.meetingStart).valueOf()) {
                return 'Окончание встречи должно быть не раньше начала'
            }
        }
        return null
    }

    /** Поля формы → контракт BFF (POST/PATCH /activities, таймстампы в ms). */
    const buildPayload = (): Record<string, unknown> => {
        const payload: Record<string, unknown> = {
            projectId: pid,
            title: form.title.trim(),
            status: form.status,
            assigneeId: form.assigneeId,
            // W-6: подразделение-владелец. Домен различает omitted и '' на update
            // (`optional string department_id` — proto3 field presence), поэтому
            // отправляем всегда: пустая строка = снять отдел.
            departmentId: form.departmentId,
        }
        if (isNew) payload.type = form.type // в UpdateActivityRequest поля type нет
        // Пустой срок: на create поле не отправляем (домен подставит smart-default),
        // на update отправляем null — явная очистка срока.
        const putDue = (ms: number | null) => {
            if (ms != null) payload.dueDate = ms
            else if (!isNew) payload.dueDate = null
        }
        switch (form.type) {
            case 'task':
                payload.description = form.description
                payload.priority = form.priority
                putDue(form.dueDate ? dayjs(form.dueDate).valueOf() : null)
                payload.reminderOffset = form.reminder
                break
            case 'call':
                payload.description = form.description
                payload.direction = form.direction
                putDue(
                    form.callDate
                        ? dayjs(
                              `${form.callDate}T${form.callTime || '00:00'}`,
                          ).valueOf()
                        : null,
                )
                payload.reminderOffset = form.reminder
                break
            case 'meeting':
                payload.description = form.description
                payload.startDate = dayjs(form.meetingStart).valueOf()
                payload.endDate = dayjs(form.meetingEnd).valueOf()
                payload.location = form.location
                payload.participants = form.participants
                // FR-ACTIVITIES-070: напоминание встречи (домен считает от startDate)
                payload.reminderOffset = form.reminder
                break
            case 'note':
                // note: домен запрещает dueDate/reminder; текст заметки — description.
                payload.description = form.noteText
                break
        }
        return payload
    }

    const handleSave = async () => {
        if (saving) return
        const problem = validate()
        if (problem) {
            pushToast('danger', problem)
            return
        }
        setSaving(true)
        try {
            if (isNew) {
                if (!createKeyRef.current) createKeyRef.current = newIdempotencyKey()
                const created = await apiCreateActivity<Activity>(
                    buildPayload(),
                    createKeyRef.current,
                )
                createKeyRef.current = null
                const createdId = normalizeActivity(created)?.id
                pushToast('success', 'Активность создана')
                navigate(createdId ? `/activities/${createdId}` : '/activities')
            } else {
                // Переход в completed домен принимает только через POST /complete
                // (там side-effects: completedAt, событие). Остальные правки — PATCH;
                // эхо уже завершённого статуса домен пропускает как no-op.
                const completing =
                    form.status === 'completed' && activity?.status !== 'completed'
                const payload = buildPayload()
                if (completing) delete payload.status
                await apiUpdateActivity<Activity>(id!, payload)
                if (completing) {
                    if (!completeKeyRef.current) completeKeyRef.current = newIdempotencyKey()
                    await apiCompleteActivity<Activity>(id!, {}, pid, completeKeyRef.current)
                    completeKeyRef.current = null
                }
                await mutate()
                pushToast('success', 'Изменения сохранены')
                navigate(`/activities/${id}`)
            }
        } catch (e) {
            pushToast('danger', errMessage(e))
            setSaving(false)
        }
    }

    if (!canWrite) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityNoPermissionState />
                </AdaptiveCard>
            </Container>
        )
    }

    if (!isNew && isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    if (!isNew && error) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityErrorState onRetry={() => mutate()} />
                </AdaptiveCard>
            </Container>
        )
    }

    if (!isNew && !activity) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="text-center py-8"
                        {...qa('activities.edit.notFound')}
                    >
                        <p className="text-gray-500">Активность не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate('/activities')}
                            {...qa('activities.edit.notFoundBack')}
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
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={handleLeave}
                        title="Назад"
                        {...qa('activities.edit.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">
                        {isNew ? 'Новая активность' : 'Редактирование активности'}
                    </h3>
                    {!isNew && (
                        <Tag className={typeColors[form.type]}>
                            {typeLabel[form.type]}
                        </Tag>
                    )}
                </div>

                <AdaptiveCard>
                    <h5 className="mb-4">Общая информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">
                                Название {form.type !== 'note' && '*'}
                            </label>
                            <Input
                                value={form.title}
                                onChange={(e) => handleChange('title', e.target.value)}
                                {...qa('activities.edit.title')}
                            />
                        </div>
                        <div {...qa('activities.edit.type')}>
                            <label className="block text-sm font-medium mb-1">Тип</label>
                            {isNew ? (
                                <Select
                                    options={typeOptions}
                                    value={
                                        typeOptions.find((o) => o.value === form.type) ||
                                        null
                                    }
                                    onChange={(opt) =>
                                        handleChange('type', opt?.value || 'task')
                                    }
                                />
                            ) : (
                                // Тип существующей активности не меняется
                                // (в UpdateActivityRequest поля type нет).
                                <Input
                                    value={typeLabel[form.type]}
                                    disabled
                                    {...qa('activities.edit.typeLocked')}
                                />
                            )}
                        </div>
                        <div {...qa('activities.edit.status')}>
                            <label className="block text-sm font-medium mb-1">Статус</label>
                            <Select
                                options={isNew ? createStatusOptions : statusOptions}
                                value={
                                    statusOptions.find((o) => o.value === form.status) ||
                                    null
                                }
                                onChange={(opt) =>
                                    handleChange('status', opt?.value || 'planned')
                                }
                            />
                        </div>
                        <div {...qa('activities.edit.assignee')}>
                            <label className="block text-sm font-medium mb-1">
                                Ответственный *
                            </label>
                            <Select
                                options={memberOptions}
                                value={
                                    memberOptions.find(
                                        (o) => o.value === form.assigneeId,
                                    ) || null
                                }
                                onChange={(opt) =>
                                    handleChange('assigneeId', opt?.value || '')
                                }
                                placeholder="Выберите ответственного"
                            />
                        </div>
                        {/* W-6: отдел-владелец активности — второй ключ видимости рядом
                            с ответственным (activity.proto `department_id`). */}
                        <div {...qa('activities.edit.department')}>
                            <label className="block text-sm font-medium mb-1">Отдел</label>
                            <Select
                                isClearable
                                isDisabled={departmentsUnavailable}
                                options={departmentOptions}
                                value={
                                    departmentOptions.find(
                                        (o) => o.value === form.departmentId,
                                    ) || null
                                }
                                onChange={(opt) =>
                                    handleChange('departmentId', opt?.value || '')
                                }
                                placeholder={
                                    departmentsUnavailable
                                        ? 'Справочник отделов недоступен'
                                        : 'Без отдела'
                                }
                            />
                        </div>
                        {!isNew && (activity?.links?.length ?? 0) > 0 && (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium mb-1">
                                    Связанные сущности
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {activity!.links!.map((link) => (
                                        <Tag
                                            key={`${link.entityType}:${link.entityId}`}
                                        >
                                            {entityTypeLabel[link.entityType] ||
                                                link.entityType}
                                            {': '}
                                            {link.nameSnapshot || link.entityId}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Привязка изменяется из карточки соответствующей
                                    сущности
                                </p>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                {form.type === 'task' && (
                    <AdaptiveCard>
                        <h5 className="mb-4">Задача</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium mb-1">
                                    Описание
                                </label>
                                <Input
                                    textArea
                                    rows={3}
                                    value={form.description}
                                    onChange={(e) =>
                                        handleChange('description', e.target.value)
                                    }
                                    {...qa('activities.edit.description')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Срок выполнения
                                </label>
                                <Input
                                    type="date"
                                    value={form.dueDate}
                                    onChange={(e) =>
                                        handleChange('dueDate', e.target.value)
                                    }
                                    {...qa('activities.edit.dueDate')}
                                />
                            </div>
                            <div {...qa('activities.edit.priority')}>
                                <label className="block text-sm font-medium mb-1">
                                    Приоритет
                                </label>
                                <Select
                                    options={priorityOptions}
                                    value={
                                        priorityOptions.find(
                                            (o) => o.value === form.priority,
                                        ) || null
                                    }
                                    onChange={(opt) =>
                                        handleChange('priority', opt?.value || 'medium')
                                    }
                                />
                            </div>
                            <div {...qa('activities.edit.reminder')}>
                                <label className="block text-sm font-medium mb-1">
                                    Напоминание
                                </label>
                                <Select
                                    options={reminderOptions}
                                    value={
                                        reminderOptions.find(
                                            (o) => o.value === form.reminder,
                                        ) || null
                                    }
                                    onChange={(opt) =>
                                        handleChange('reminder', opt?.value || 'none')
                                    }
                                />
                            </div>
                        </div>
                    </AdaptiveCard>
                )}

                {form.type === 'call' && (
                    <AdaptiveCard>
                        <h5 className="mb-4">Звонок</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium mb-2">
                                    Направление
                                </label>
                                <div className="flex gap-4">
                                    {[
                                        { value: 'outbound', label: 'Исходящий' },
                                        { value: 'inbound', label: 'Входящий' },
                                    ].map((opt) => (
                                        <label
                                            key={opt.value}
                                            className="flex items-center gap-2 cursor-pointer"
                                        >
                                            <input
                                                type="radio"
                                                checked={form.direction === opt.value}
                                                onChange={() =>
                                                    handleChange('direction', opt.value)
                                                }
                                                className="w-4 h-4"
                                                {...qa('activities.edit.direction', {
                                                    direction: opt.value,
                                                })}
                                            />
                                            <span className="text-sm">{opt.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Дата
                                </label>
                                <Input
                                    type="date"
                                    value={form.callDate}
                                    onChange={(e) =>
                                        handleChange('callDate', e.target.value)
                                    }
                                    {...qa('activities.edit.callDate')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Время
                                </label>
                                <Input
                                    type="time"
                                    value={form.callTime}
                                    onChange={(e) =>
                                        handleChange('callTime', e.target.value)
                                    }
                                    {...qa('activities.edit.callTime')}
                                />
                            </div>
                            <div {...qa('activities.edit.reminder')}>
                                <label className="block text-sm font-medium mb-1">
                                    Напоминание
                                </label>
                                <Select
                                    options={reminderOptions}
                                    value={
                                        reminderOptions.find(
                                            (o) => o.value === form.reminder,
                                        ) || null
                                    }
                                    onChange={(opt) =>
                                        handleChange('reminder', opt?.value || 'none')
                                    }
                                />
                            </div>
                        </div>
                    </AdaptiveCard>
                )}

                {form.type === 'meeting' && (
                    <AdaptiveCard>
                        <h5 className="mb-4">Встреча</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Начало *
                                </label>
                                <Input
                                    type="datetime-local"
                                    value={form.meetingStart}
                                    onChange={(e) =>
                                        handleChange('meetingStart', e.target.value)
                                    }
                                    {...qa('activities.edit.meetingStart')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Окончание *
                                </label>
                                <Input
                                    type="datetime-local"
                                    value={form.meetingEnd}
                                    onChange={(e) =>
                                        handleChange('meetingEnd', e.target.value)
                                    }
                                    {...qa('activities.edit.meetingEnd')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Место
                                </label>
                                <Input
                                    value={form.location}
                                    onChange={(e) =>
                                        handleChange('location', e.target.value)
                                    }
                                    {...qa('activities.edit.location')}
                                />
                            </div>
                            <div {...qa('activities.edit.reminder')}>
                                <label className="block text-sm font-medium mb-1">
                                    Напоминание
                                </label>
                                <Select
                                    options={reminderOptions}
                                    value={
                                        reminderOptions.find(
                                            (o) => o.value === form.reminder,
                                        ) || null
                                    }
                                    onChange={(opt) =>
                                        handleChange('reminder', opt?.value || 'none')
                                    }
                                />
                            </div>
                            <div
                                className="md:col-span-2"
                                {...qa('activities.edit.participants')}
                            >
                                <label className="block text-sm font-medium mb-1">
                                    Участники
                                </label>
                                <Select
                                    isMulti
                                    options={memberOptions}
                                    value={memberOptions.filter((o) =>
                                        form.participants.includes(o.value),
                                    )}
                                    onChange={(opts) =>
                                        handleChange(
                                            'participants',
                                            Array.isArray(opts)
                                                ? opts.map((o) => o.value)
                                                : [],
                                        )
                                    }
                                    placeholder="Выберите участников"
                                />
                            </div>
                        </div>
                    </AdaptiveCard>
                )}

                {form.type === 'note' && (
                    <AdaptiveCard>
                        <h5 className="mb-4">Заметка</h5>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Текст заметки
                            </label>
                            <Input
                                textArea
                                rows={6}
                                value={form.noteText}
                                onChange={(e) =>
                                    handleChange('noteText', e.target.value)
                                }
                                {...qa('activities.edit.noteText')}
                            />
                        </div>
                    </AdaptiveCard>
                )}

                {!isNew && activity?.result && (
                    <AdaptiveCard>
                        <h5 className="mb-4">Результат</h5>
                        <div className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                            {activity.result}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Результат заполняется при завершении активности
                        </p>
                    </AdaptiveCard>
                )}

                <div className="flex justify-end gap-3">
                    <Button
                        variant="plain"
                        onClick={handleLeave}
                        disabled={saving}
                        {...qa('activities.edit.cancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={saving}
                        onClick={handleSave}
                        {...qa('activities.edit.save')}
                    >
                        Сохранить
                    </Button>
                </div>
            </div>
        </Container>
    )
}

export default ActivityEdit
