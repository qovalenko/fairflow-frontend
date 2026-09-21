import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiTrashDuotone,
    PiArrowCounterClockwiseDuotone,
    PiListChecksDuotone,
    PiPhoneDuotone,
    PiUsersDuotone,
    PiNoteDuotone,
} from 'react-icons/pi'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Loading from '@/components/shared/Loading'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Tooltip from '@/components/ui/Tooltip'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import type { Activity, ActivityType } from '@/@types/crm'
import { apiGetActivities, apiRestoreActivity, newIdempotencyKey } from '@/services/CrmService'
import {
    ActivityErrorState,
    ActivityNoPermissionState,
} from './ActivityStatePanels'
import { toEpochMs } from './activityShared'
import { qa } from '../qa'

const typeConfig: Record<ActivityType, { icon: React.ReactNode; label: string }> = {
    task: { icon: <PiListChecksDuotone className="w-4 h-4" />, label: 'Задача' },
    call: { icon: <PiPhoneDuotone className="w-4 h-4" />, label: 'Звонок' },
    meeting: { icon: <PiUsersDuotone className="w-4 h-4" />, label: 'Встреча' },
    note: { icon: <PiNoteDuotone className="w-4 h-4" />, label: 'Заметка' },
}

const notifyOk = (msg: string) =>
    toast.push(<Notification type="success">{msg}</Notification>, { placement: 'top-center' })

const notifyErr = (msg: string) =>
    toast.push(<Notification type="danger">{msg}</Notification>, { placement: 'top-center' })

const extractError = (e: unknown): string => {
    const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string }
    return err?.response?.data?.error?.message || err?.message || 'Не удалось восстановить активность'
}

/**
 * Корзина модуля «Активности» (FR-MACT-13).
 * Двухрежимный запрос без зондирования версии BE: шлём одновременно
 * state='trashed' И includeDeleted=true.
 *  - Новый BE: выигрывает state=trashed → приходит честный trash-only срез
 *    (только удалённые, честный total); клиентский фильтр по deletedAt = no-op.
 *  - Старый BE: state игнорируется → includeDeleted=true отдаёт список ВКЛЮЧАЯ
 *    живые, и клиентский фильтр по deletedAt отсекает их (поведение как раньше).
 * Восстановление — POST /activities/:id/restore (право activities:delete).
 */
const ActivityTrash = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('activities', 'read')
    const canDelete = can('activities', 'delete')

    const [confirming, setConfirming] = useState<Activity | null>(null)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const restoreKeyByIdRef = useRef<Map<string, string>>(new Map())

    const { data, isLoading, error, mutate } = useSWR(
        pid && canRead ? ['/v1/activities', 'trash', pid] : null,
        () =>
            apiGetActivities<{ list: Activity[]; total: number }, Record<string, unknown>>({
                projectId: pid,
                state: 'trashed',
                includeDeleted: true,
                pageIndex: 0,
                pageSize: 100,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // «Только удалённые» — клиентский фильтр по deletedAt. На новом BE (trash-срез)
    // вырождается в no-op; на старом BE отсекает живые из includeDeleted-списка.
    const list = useMemo(
        () => (Array.isArray(data?.list) ? data.list : []).filter((a) => Boolean(a?.deletedAt)),
        [data],
    )

    const doRestore = async (activity: Activity) => {
        if (!pid) return
        const key = restoreKeyByIdRef.current.get(activity.id) ?? newIdempotencyKey()
        restoreKeyByIdRef.current.set(activity.id, key)
        setRestoringId(activity.id)
        try {
            await apiRestoreActivity(activity.id, pid, key)
            restoreKeyByIdRef.current.delete(activity.id)
            notifyOk('Активность восстановлена')
            setConfirming(null)
            await mutate()
        } catch (e) {
            notifyErr(extractError(e))
        } finally {
            setRestoringId(null)
        }
    }

    // ST-10 No-permission (route-guard): нет права activities:read.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityNoPermissionState />
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => navigate('/activities')}
                        title="Назад"
                        {...qa('activities.trash.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold flex items-center gap-2">
                        <PiTrashDuotone className="w-6 h-6 text-gray-500" /> Корзина
                    </h3>
                </div>

                <AdaptiveCard>
                    {isLoading ? (
                        // ST-1 Loading.
                        <Loading loading={true} />
                    ) : error ? (
                        // ST-6 Error + retry.
                        <ActivityErrorState onRetry={() => mutate()} />
                    ) : list.length === 0 ? (
                        // ST-3 Empty.
                        <div
                            className="flex flex-col items-center justify-center py-16 text-center gap-3"
                            {...qa('activities.trash.empty')}
                        >
                            <PiTrashDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Корзина пуста</p>
                            <p className="text-gray-500 text-sm">
                                Удалённые активности появятся здесь
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 px-3">Тип</th>
                                        <th className="py-2 px-3">Название</th>
                                        <th className="py-2 px-3">Срок</th>
                                        <th className="py-2 px-3">Удалена</th>
                                        <th className="py-2 px-3 text-right">Действие</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map((a) => {
                                        const tc = typeConfig[a.type] ?? typeConfig.task
                                        return (
                                            <tr
                                                key={a.id}
                                                className="border-b border-gray-100 dark:border-gray-800"
                                                {...qa('activities.trash.row', {
                                                    activity: a.id,
                                                })}
                                            >
                                                <td className="py-2 px-3">
                                                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                                        {tc.icon}
                                                        <span>{tc.label}</span>
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 font-medium">
                                                    {a.title || 'Без названия'}
                                                </td>
                                                <td className="py-2 px-3 text-gray-500">
                                                    {a.dueDate
                                                        ? dayjs(toEpochMs(a.dueDate)).format('DD.MM.YYYY')
                                                        : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-gray-500">
                                                    {a.deletedAt
                                                        ? dayjs
                                                              .unix(a.deletedAt)
                                                              .format('DD.MM.YYYY HH:mm')
                                                        : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    {canDelete ? (
                                                        <Button
                                                            size="xs"
                                                            variant="plain"
                                                            icon={<PiArrowCounterClockwiseDuotone />}
                                                            loading={restoringId === a.id}
                                                            disabled={restoringId === a.id}
                                                            onClick={() => setConfirming(a)}
                                                            {...qa('activities.trash.restore', {
                                                                activity: a.id,
                                                            })}
                                                        >
                                                            Восстановить
                                                        </Button>
                                                    ) : (
                                                        <Tooltip title="Нужно право activities:delete">
                                                            <span className="inline-flex">
                                                                <Button
                                                                    size="xs"
                                                                    variant="plain"
                                                                    icon={
                                                                        <PiArrowCounterClockwiseDuotone />
                                                                    }
                                                                    disabled
                                                                    {...qa('activities.trash.restore', {
                                                                        activity: a.id,
                                                                    })}
                                                                >
                                                                    Восстановить
                                                                </Button>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AdaptiveCard>
            </div>

            {/* Подтверждение восстановления. */}
            <Dialog
                isOpen={!!confirming}
                onClose={() => setConfirming(null)}
                onRequestClose={() => setConfirming(null)}
            >
                <h5 className="mb-3">Восстановить активность?</h5>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Активность «{confirming?.title || 'Без названия'}» вернётся в список активных.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setConfirming(null)}
                        {...qa('activities.trash.restoreCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        disabled={!canDelete}
                        loading={restoringId === confirming?.id}
                        onClick={() => confirming && doRestore(confirming)}
                        {...qa('activities.trash.restoreConfirm')}
                    >
                        Восстановить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default ActivityTrash
