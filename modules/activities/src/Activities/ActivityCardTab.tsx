import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import {
    PiPlusDuotone,
    PiCheckCircleDuotone,
    PiListChecksDuotone,
    PiPhoneDuotone,
    PiUsersDuotone,
    PiNoteDuotone,
    PiWarningDuotone,
    PiFlagDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import type { TaskInitialData } from '@/components/template/EntityCreateDrawer'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetActivities, apiCompleteActivity, newIdempotencyKey } from '@/services/CrmService'
import type { Activity, ActivityType } from '@/@types/crm'
import {
    ActivityEmptyState,
    ActivityErrorState,
    ActivityNoPermissionState,
} from './ActivityStatePanels'
import {
    normalizeList,
    normalizeActivity,
    isOverdue,
    isTerminal,
    typeLabel,
    errMessage,
} from './activityShared'
import { qa } from '../qa'

/**
 * SCR-ACTIVITIES-CARD-TAB — врезка «Активности» (хронология) в карточку
 * контакта/сделки/компании/продажи (mount-point в слоты `*.card.tab`).
 * Одна реализация на 4 типа — параметризуется entity-ref из контекста слота.
 *
 * Состояния (каталог SCREENS.md): ST-1 loading, ST-3 empty, ST-6 error+retry,
 * ST-7 inline-Complete error+toast, ST-10/11/12 права (нет read → плашка; нет
 * write → «+»/Complete скрыты), ST-8 graceful (внутри ErrorBoundary хоста).
 */

const pushToast = (type: 'success' | 'danger', message: string) =>
    toast.push(<Notification type={type}>{message}</Notification>, {
        placement: 'top-center',
    })

const typeIcon: Record<ActivityType, React.ReactNode> = {
    task: <PiListChecksDuotone className="w-4 h-4" />,
    call: <PiPhoneDuotone className="w-4 h-4" />,
    meeting: <PiUsersDuotone className="w-4 h-4" />,
    note: <PiNoteDuotone className="w-4 h-4" />,
}

export type ActivityCardTabProps = {
    /** Явный entity-ref (host-механизм MountSlot). */
    entityType?: 'deal' | 'contact' | 'company' | 'order'
    entityId?: string
    /** Контекст-пропсы слотов `*.card.tab` (slot-catalog `contextProps`). */
    dealId?: string
    contactId?: string
    companyId?: string
    orderId?: string
}

const resolveRef = (
    p: ActivityCardTabProps,
): { entityType: ActivityCardTabProps['entityType']; entityId?: string } => {
    if (p.entityType && p.entityId) return { entityType: p.entityType, entityId: p.entityId }
    if (p.dealId) return { entityType: 'deal', entityId: p.dealId }
    if (p.contactId) return { entityType: 'contact', entityId: p.contactId }
    if (p.companyId) return { entityType: 'company', entityId: p.companyId }
    if (p.orderId) return { entityType: 'order', entityId: p.orderId }
    return { entityType: undefined, entityId: undefined }
}

const drawerInitial = (
    entityType: ActivityCardTabProps['entityType'],
    entityId: string,
): TaskInitialData => {
    switch (entityType) {
        case 'deal':
            return { dealId: entityId }
        case 'contact':
            return { contactId: entityId }
        case 'company':
            return { companyId: entityId }
        case 'order':
            return { orderId: entityId }
        default:
            return {}
    }
}

const ActivityRow = ({
    activity,
    canComplete,
    onComplete,
    completing,
    onOpen,
    highlightNext,
}: {
    activity: Activity
    canComplete: boolean
    onComplete: (a: Activity) => void
    completing: boolean
    onOpen: (a: Activity) => void
    highlightNext?: boolean
}) => {
    const overdue = isOverdue(activity)
    const terminal = isTerminal(activity)
    return (
        <div
            className={
                'flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ' +
                (highlightNext
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40')
            }
            {...qa(
                highlightNext
                    ? 'activities.cardTab.nextStepRow'
                    : 'activities.cardTab.row',
                { activity: activity.id },
            )}
        >
            <div className="mt-0.5 text-gray-500 dark:text-gray-400">
                {typeIcon[activity.type]}
            </div>
            <div className="min-w-0 flex-1">
                <button
                    type="button"
                    className="block truncate text-left text-sm font-medium text-primary hover:underline"
                    onClick={() => onOpen(activity)}
                    {...qa('activities.cardTab.rowTitle', {
                        activity: activity.id,
                    })}
                >
                    {activity.title}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{typeLabel[activity.type]}</span>
                    {activity.dueDate && (
                        <span className={overdue ? 'flex items-center gap-1 text-red-500' : ''}>
                            {overdue && <PiWarningDuotone className="h-3.5 w-3.5" />}
                            {dayjs
                                .unix(
                                    activity.dueDate > 1e12
                                        ? Math.floor(activity.dueDate / 1000)
                                        : activity.dueDate,
                                )
                                .format('DD.MM.YYYY')}
                        </span>
                    )}
                    {activity.assigneeName && <span>· {activity.assigneeName}</span>}
                </div>
            </div>
            {terminal ? (
                <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    {activity.status === 'completed' ? 'Завершено' : 'Отменено'}
                </Tag>
            ) : (
                canComplete && (
                    <Button
                        size="xs"
                        variant="plain"
                        loading={completing}
                        icon={<PiCheckCircleDuotone />}
                        onClick={() => onComplete(activity)}
                        {...qa('activities.cardTab.complete', {
                            activity: activity.id,
                        })}
                    >
                        Завершить
                    </Button>
                )
            )}
        </div>
    )
}

const ActivityCardTab = (props: ActivityCardTabProps) => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('activities', 'read')
    const canWrite = can('activities', 'write')
    const canManage = can('activities', 'manage')

    const { entityType, entityId } = resolveRef(props)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [completingId, setCompletingId] = useState<string | null>(null)
    const completeKeyByIdRef = useRef<Map<string, string>>(new Map())

    const { data, isLoading, error, mutate, isValidating } = useSWR(
        canRead && pid && entityType && entityId
            ? ['/api/v1/activities/card-tab', pid, entityType, entityId]
            : null,
        () =>
            apiGetActivities<{ list: Activity[]; total: number }, Record<string, unknown>>({
                projectId: pid!,
                linkEntityType: entityType,
                linkEntityId: entityId,
                pageSize: 50,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const list = useMemo(
        () =>
            normalizeList<unknown>(data?.list)
                .map(normalizeActivity)
                .filter((a): a is Activity => Boolean(a)),
        [data],
    )

    // «Следующий шаг» — ближайшая открытая по сроку (FR-MACT-15/US-35).
    const nextStep = useMemo(() => {
        const open = list.filter((a) => !isTerminal(a) && a.dueDate)
        if (open.length === 0) return undefined
        return [...open].sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))[0]
    }, [list])

    const handleComplete = async (a: Activity) => {
        if (!pid) return
        setCompletingId(a.id)
        // ST-29 оптимистично: переводим строку в completed, откат при ошибке.
        mutate(
            (prev) => {
                const arr = normalizeList<Activity>(prev?.list)
                return {
                    list: arr.map((x) =>
                        x.id === a.id ? { ...x, status: 'completed' as const } : x,
                    ),
                    total: prev?.total ?? arr.length,
                }
            },
            { revalidate: false },
        )
        try {
            const key = completeKeyByIdRef.current.get(a.id) ?? newIdempotencyKey()
            completeKeyByIdRef.current.set(a.id, key)
            await apiCompleteActivity<Activity>(a.id, {}, pid, key)
            completeKeyByIdRef.current.delete(a.id)
            pushToast('success', 'Активность завершена')
            await mutate()
        } catch (e) {
            pushToast('danger', errMessage(e))
            await mutate()
        } finally {
            setCompletingId(null)
        }
    }

    if (!canRead) return <ActivityNoPermissionState />

    if (!entityType || !entityId) {
        return (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Нет контекста сущности.
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h5 className="text-base font-semibold">Активности</h5>
                    {!isLoading && (
                        <Tag
                            className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                            {...qa('activities.cardTab.count')}
                        >
                            {list.length}
                        </Tag>
                    )}
                    {isValidating && !isLoading && <Spinner size={16} />}
                </div>
                {canWrite && (
                    <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        icon={<PiPlusDuotone />}
                        onClick={() => setDrawerOpen(true)}
                        {...qa('activities.cardTab.create')}
                    >
                        Активность
                    </Button>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700"
                        />
                    ))}
                </div>
            ) : error ? (
                <ActivityErrorState onRetry={() => mutate()} />
            ) : list.length === 0 ? (
                <ActivityEmptyState
                    onCreate={canWrite ? () => setDrawerOpen(true) : undefined}
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {nextStep && (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                                <PiFlagDuotone className="h-4 w-4" />
                                Следующий шаг
                            </div>
                            <ActivityRow
                                activity={nextStep}
                                canComplete={canWrite || canManage}
                                onComplete={handleComplete}
                                completing={completingId === nextStep.id}
                                onOpen={(a) => navigate(`/activities/${a.id}`)}
                                highlightNext
                            />
                        </div>
                    )}
                    <div className="mt-1 flex flex-col gap-2">
                        {list
                            .filter((a) => a.id !== nextStep?.id)
                            .map((a) => (
                                <ActivityRow
                                    key={a.id}
                                    activity={a}
                                    canComplete={canWrite || canManage}
                                    onComplete={handleComplete}
                                    completing={completingId === a.id}
                                    onOpen={(act) => navigate(`/activities/${act.id}`)}
                                />
                            ))}
                    </div>
                </div>
            )}

            <EntityCreateDrawer
                entityType="task"
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onSuccess={() => {
                    setDrawerOpen(false)
                    mutate()
                }}
                taskInitialData={drawerInitial(entityType, entityId)}
            />
        </div>
    )
}

export default ActivityCardTab
