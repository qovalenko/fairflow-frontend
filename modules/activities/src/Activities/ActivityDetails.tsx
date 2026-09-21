import { useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiChatCircleTextDuotone, PiCheckCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiGetActivity,
    apiUpdateActivity,
    apiCompleteActivity,
    apiDeleteActivity,
    apiCreateActivity,
    newIdempotencyKey,
} from '@/services/CrmService'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore } from '@/store/projectStore'
import { activitiesDefaultReminder } from '@/utils/activitiesDefaultReminder'
import type { Activity } from '@/@types/crm'
import ActivityHeaderWidget from './ActivityHeaderWidget'
import ActivityHeaderStats from './ActivityHeaderStats'
import ActivityInfoWidget from './ActivityInfoWidget'
import { ActivityErrorState } from './ActivityStatePanels'
import { isOverdue as isActivityOverdue, toEpochMs } from './activityShared'
import CompleteFollowUpDialog, { type CompleteFollowUpPayload } from './CompleteFollowUpDialog'
import { qa } from '../qa'

const pushToast = (type: 'success' | 'danger', message: string) => {
    toast.push(
        <Notification type={type === 'danger' ? 'danger' : 'success'}>{message}</Notification>,
        { placement: 'top-center' },
    )
}

const toSafeString = (value: unknown): string => {
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
            if (Number.isFinite(n)) return String(n)
        }
    }
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    return ''
}

const toSafeNumber = (value: unknown): number | undefined => {
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
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

const toSafeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return []
    return value.map(toSafeString).filter(Boolean)
}

const normalizeActivity = (value: unknown): Activity | null => {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    return {
        ...(raw as Activity),
        id: toSafeString(raw.id || raw._id),
        title: toSafeString(raw.title) || 'Без названия',
        type: (toSafeString(raw.type) as Activity['type']) || 'task',
        status: (toSafeString(raw.status) as Activity['status']) || 'planned',
        priority: (toSafeString(raw.priority) as Activity['priority']) || 'medium',
        assigneeName: toSafeString(raw.assigneeName) || undefined,
        dealName: toSafeString(raw.dealName) || undefined,
        contactName: toSafeString(raw.contactName) || undefined,
        companyName: toSafeString(raw.companyName) || undefined,
        orderName: toSafeString(raw.orderName) || undefined,
        location: toSafeString(raw.location) || undefined,
        description: toSafeString(raw.description) || undefined,
        result: toSafeString(raw.result) || undefined,
        direction: (toSafeString(raw.direction) as Activity['direction']) || undefined,
        dueDate: toSafeNumber(raw.dueDate),
        startDate: toSafeNumber(raw.startDate),
        endDate: toSafeNumber(raw.endDate),
        duration: toSafeNumber(raw.duration),
        createdAt: toSafeNumber(raw.createdAt) ?? 0,
        updatedAt: toSafeNumber(raw.updatedAt) ?? (toSafeNumber(raw.createdAt) ?? 0),
        participants: toSafeStringArray(raw.participants),
        dealId: toSafeString(raw.dealId) || undefined,
        contactId: toSafeString(raw.contactId) || undefined,
        companyId: toSafeString(raw.companyId) || undefined,
        orderId: toSafeString(raw.orderId) || undefined,
    }
}

const ActivityDetails = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canWrite = can('activities', 'write')
    const canManage = can('activities', 'manage')
    const canDeletePerm = can('activities', 'delete')
    const [busy, setBusy] = useState(false)
    const [followUpOpen, setFollowUpOpen] = useState(false)
    const completeKeyRef = useRef<string | null>(null)
    const followUpCompleteKeyRef = useRef<string | null>(null)
    const followUpCreateKeyRef = useRef<string | null>(null)
    const deleteKeyRef = useRef<string | null>(null)
    const moduleConfigs = useProjectStore((s) => s.currentProject?.moduleConfigs)

    const {
        data: activityRaw,
        isLoading,
        error,
        mutate,
    } = useSWR(
        id ? [`/api/v1/activities/${id}`, id, pid] : null,
        () => apiGetActivity<Activity>(id!, pid),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const activity = useMemo(() => normalizeActivity(activityRaw), [activityRaw])

    /**
     * Мутации: своя активность → требует write; чужая → manage (V-12).
     * Здесь нет дешёвого способа определить «свою» на FE без user-id,
     * поэтому считаем доступной мутацию при write ИЛИ manage (backend-guard — истина).
     */
    const canMutate = canWrite || canManage
    const canDelete = canDeletePerm || canManage

    // Общий isOverdue учитывает флаг overdue с бэка и нормализует единицы dueDate.
    const isOverdue = useMemo(() => (activity ? isActivityOverdue(activity) : false), [activity])

    const handleStatusChange = async (status: string) => {
        if (!id || busy) return
        setBusy(true)
        try {
            await apiUpdateActivity<Activity>(id, { status, projectId: pid })
            await mutate()
            pushToast('success', 'Статус обновлён')
        } catch {
            pushToast('danger', 'Не удалось изменить статус')
        } finally {
            setBusy(false)
        }
    }

    const handleComplete = async () => {
        if (!id || busy) return
        if (!completeKeyRef.current) completeKeyRef.current = newIdempotencyKey()
        setBusy(true)
        try {
            await apiCompleteActivity<Activity>(id, {}, pid, completeKeyRef.current)
            completeKeyRef.current = null
            await mutate()
            pushToast('success', 'Активность завершена')
        } catch {
            pushToast('danger', 'Не удалось завершить активность')
        } finally {
            setBusy(false)
        }
    }

    const handleCompleteWithFollowUp = async (payload: CompleteFollowUpPayload) => {
        if (!id || !activity || busy || !pid) return
        if (!followUpCompleteKeyRef.current) followUpCompleteKeyRef.current = newIdempotencyKey()
        if (!followUpCreateKeyRef.current) followUpCreateKeyRef.current = newIdempotencyKey()
        setBusy(true)
        try {
            await apiCompleteActivity<Activity>(id, {}, pid, followUpCompleteKeyRef.current)
            const links =
                activity.links?.map((l) => ({
                    entityType: l.entityType,
                    entityId: l.entityId,
                })) ?? []
            const created = await apiCreateActivity<{ id?: string }>(
                {
                    projectId: pid,
                    type: payload.type,
                    title: payload.title,
                    status: 'planned',
                    assigneeId: activity.assigneeId,
                    ...(payload.dueDateMs ? { dueDate: payload.dueDateMs } : {}),
                    ...(links.length ? { links } : {}),
                    ...(payload.type === 'call' ? { direction: 'outbound' as const } : {}),
                    ...(payload.type === 'note'
                        ? {}
                        : { reminderOffset: activitiesDefaultReminder(moduleConfigs) }),
                },
                followUpCreateKeyRef.current,
            )
            followUpCompleteKeyRef.current = null
            followUpCreateKeyRef.current = null
            setFollowUpOpen(false)
            await mutate()
            pushToast('success', 'Активность завершена, follow-up создан')
            if (created?.id) navigate(`/activities/${created.id}`)
        } catch {
            pushToast('danger', 'Не удалось завершить активность или создать follow-up')
        } finally {
            setBusy(false)
        }
    }

    const handleEdit = () => navigate(`/activities/${id}/edit`)
    const handleDelete = async () => {
        if (!id || busy) return
        if (!window.confirm('Вы уверены, что хотите удалить эту активность?')) return
        if (!deleteKeyRef.current) deleteKeyRef.current = newIdempotencyKey()
        setBusy(true)
        try {
            await apiDeleteActivity<{ ok?: boolean }>(id, pid, deleteKeyRef.current)
            deleteKeyRef.current = null
            pushToast('success', 'Активность удалена')
            navigate(`/activities`)
        } catch {
            pushToast('danger', 'Не удалось удалить активность')
            setBusy(false)
        }
    }

    if (isLoading) {
        return (
            <Container>
                <div {...qa('activities.details.loading')}>
                    <Loading loading={true} />
                </div>
            </Container>
        )
    }

    if (error) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityErrorState onRetry={() => mutate()} />
                </AdaptiveCard>
            </Container>
        )
    }

    if (!activity) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="text-center py-8"
                        {...qa('activities.details.notFound')}
                    >
                        <p className="text-gray-500">Активность не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate(`/activities`)}
                            {...qa('activities.details.notFoundBack')}
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
                <ActivityHeaderWidget
                    activity={activity}
                    isOverdue={isOverdue}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusChange={handleStatusChange}
                    onComplete={handleComplete}
                    onCompleteWithFollowUp={() => setFollowUpOpen(true)}
                    canMutate={canMutate}
                    canDelete={canDelete}
                    busy={busy}
                />

                <ActivityHeaderStats activity={activity} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 flex flex-col min-h-0">
                        <ActivityInfoWidget
                            activity={activity}
                            isOverdue={isOverdue}
                            onDealClick={(dealId) => navigate(`/deals/${dealId}`)}
                            onContactClick={(contactId) => navigate(`/contacts/${contactId}`)}
                            onCompanyClick={(companyId) => navigate(`/companies/${companyId}`)}
                            onOrderClick={(orderId) => navigate(`/orders/${orderId}`)}
                        />
                    </div>
                    <div className="flex flex-col min-h-0 gap-4">
                        {activity.description && (
                            <Card
                                className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
                                bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
                                header={{
                                    content: (
                                        <div className="flex items-center gap-2">
                                            <PiChatCircleTextDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                            <h4 className="text-base font-semibold">Описание</h4>
                                        </div>
                                    ),
                                    bordered: true,
                                }}
                            >
                                <div className="text-sm text-sky-800 dark:text-sky-100 whitespace-pre-wrap p-4 bg-sky-50 dark:bg-sky-900/20 rounded-xl">
                                    {activity.description}
                                </div>
                            </Card>
                        )}
                        {activity.result && (
                            <Card
                                {...qa('activities.details.result')}
                                className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
                                bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
                                header={{
                                    content: (
                                        <div className="flex items-center gap-2">
                                            <PiCheckCircleDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                            <h4 className="text-base font-semibold">Результат</h4>
                                        </div>
                                    ),
                                    bordered: true,
                                }}
                            >
                                <div className="text-sm text-sky-800 dark:text-sky-100 whitespace-pre-wrap p-4 bg-sky-50 dark:bg-sky-900/20 rounded-xl">
                                    {activity.result}
                                </div>
                            </Card>
                        )}
                    </div>
                </div>

                <AdaptiveCard>
                    <div
                        className="flex items-center justify-between text-sm text-gray-500"
                        {...qa('activities.details.metaFooter')}
                    >
                        <span {...qa('activities.details.metaCreated')}>
                            Создано: {dayjs(toEpochMs(activity.createdAt)).format('DD.MM.YYYY HH:mm')}
                        </span>
                        {activity.updatedAt !== activity.createdAt && (
                            <span {...qa('activities.details.metaUpdated')}>
                                Обновлено: {dayjs(toEpochMs(activity.updatedAt)).format('DD.MM.YYYY HH:mm')}
                            </span>
                        )}
                    </div>
                </AdaptiveCard>
            </div>
            <CompleteFollowUpDialog
                open={followUpOpen}
                source={activity}
                busy={busy}
                onClose={() => setFollowUpOpen(false)}
                onConfirm={handleCompleteWithFollowUp}
            />
        </Container>
    )
}

export default ActivityDetails
