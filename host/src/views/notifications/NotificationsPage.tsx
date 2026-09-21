import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
    apiGetNotificationList,
    apiMarkAllNotificationsRead,
    type NotificationItem,
} from '@/services/NotificationService'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { qa } from '@/shared/qa'

/**
 * Host-local страница уведомлений (пункт меню «Уведомления» → /notifications).
 *
 * Уведомления — системная часть host-shell (notification.md, kind:"system"): живут в host,
 * а не отдельным remote. Данные через gateway REST `/api/notification/*` (VERSION_NEUTRAL —
 * без `/v1`), клиент — существующий NotificationService. Гейт на бэке: модуль `notifications`
 * включён в проекте + право `notifications:read`.
 */
export default function NotificationsPage() {
    const projectId = useResolvedProjectId()
    const navigate = useNavigate()
    const [items, setItems] = useState<NotificationItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!projectId) return
        setLoading(true)
        setError(null)
        try {
            const data = await apiGetNotificationList({ projectId, pageSize: 50 })
            // BFF отдаёт либо массив, либо {list,total} — поддерживаем оба.
            const list = Array.isArray(data)
                ? (data as NotificationItem[])
                : (data?.list ?? [])
            setItems(list)
        } catch (e) {
            setError((e as Error)?.message ?? 'Не удалось загрузить уведомления')
        } finally {
            setLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        void load()
    }, [load])

    const markAllRead = async () => {
        if (!projectId) return
        try {
            await apiMarkAllNotificationsRead({ projectId })
            void load()
        } catch {
            /* best-effort */
        }
    }

    return (
        <div className="p-4" {...qa('host.notifications.page.screen')}>
            <div className="mb-4 flex items-center justify-between">
                <h3>Уведомления</h3>
                {items.length > 0 && (
                    <Button
                        size="sm"
                        variant="plain"
                        onClick={markAllRead}
                        {...qa('host.notifications.page.markAll')}
                    >
                        Прочитать все
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-12" {...qa('host.notifications.page.loading')}>
                    <Spinner size={40} />
                </div>
            ) : error ? (
                <Card {...qa('host.notifications.page.error')}>
                    <div className="py-6 text-center text-red-500">{error}</div>
                </Card>
            ) : items.length === 0 ? (
                <Card {...qa('host.notifications.page.empty')}>
                    <div className="py-10 text-center text-gray-400">
                        Нет уведомлений
                    </div>
                </Card>
            ) : (
                <div className="flex flex-col gap-2" {...qa('host.notifications.page.list')}>
                    {items.map((n) => (
                        <Card
                            key={n.id}
                            className={n.readed ? '' : 'border-l-4 border-primary'}
                            {...qa('host.notifications.page.card', {
                                notification: n.id,
                                read: n.readed ? 'true' : 'false',
                            })}
                        >
                            <div className="flex justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-semibold">
                                        {n.target || n.category || 'Уведомление'}
                                    </div>
                                    {n.description && (
                                        <div className="text-sm text-gray-500">
                                            {n.description}
                                        </div>
                                    )}
                                    {n.location && (
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            className="mt-2"
                                            onClick={() => navigate(n.location!)}
                                            {...qa('host.notifications.page.open', { notification: n.id })}
                                        >
                                            Открыть
                                        </Button>
                                    )}
                                </div>
                                {n.date && (
                                    <div className="whitespace-nowrap text-xs text-gray-400">
                                        {new Date(n.date).toLocaleString('ru')}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
