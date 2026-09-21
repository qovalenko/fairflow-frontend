import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useNotifications from '@/utils/hooks/useNotifications'
import type { NotificationItem } from '@/services/NotificationService'
import { qa } from '@/shared/qa'

/**
 * SCR-NOTIFY-TOAST — toast нового уведомления (host-shell overlay, kind:"system").
 *
 * Глобальный overlay без маршрута. Слушает тот же SSE-поток (через
 * useNotifications subscribe) и при появлении НОВОГО непрочитанного уведомления
 * показывает угловой toast с заголовком, телом и deep-link (FR-MNOT-32).
 *
 * Гейт (как BELL): enabledModules['notifications'] + usePermission — внутри
 * useNotifications (enabled=false → ничего не делает).
 *
 * Состояния: ST-29 (новое уведомление → toast); critical (severity) — длинная
 * длительность (не автоскрывается так быстро, FR-MNOT-32).
 */
const NotificationToaster = () => {
    const navigate = useNavigate()
    const { enabled, list } = useNotifications({ pageSize: 8, subscribe: true })

    // Запоминаем известные id, чтобы тостить только реально новые.
    const seenRef = useRef<Set<string> | null>(null)

    useEffect(() => {
        if (!enabled) return

        // Первый прогон — инициализируем «виденные» без тостов (не спамим при входе).
        if (seenRef.current === null) {
            seenRef.current = new Set(list.map((n) => n.id))
            return
        }

        const seen = seenRef.current
        const fresh = list.filter((n) => !n.readed && !seen.has(n.id))
        for (const item of fresh) {
            seen.add(item.id)
            pushToast(item, navigate)
        }
        // Подчищаем виденные, исчезнувшие из ленты (TTL/прочитано), чтобы set не рос.
        for (const id of Array.from(seen)) {
            if (!list.some((n) => n.id === id)) seen.delete(id)
        }
    }, [enabled, list, navigate])

    return null
}

function pushToast(item: NotificationItem, navigate: (to: string) => void) {
    const isCritical = item.severity === 'critical' || item.category === 'billing'
    toast.push(
        <Notification
            closable
            title={item.target}
            type={isCritical ? 'danger' : 'info'}
            // critical не автоскрывается до клика (FR-MNOT-32).
            duration={isCritical ? 0 : 6000}
            closeButtonProps={{
                ...qa('host.notifications.toast.close', { notification: item.id }),
            }}
            {...qa('host.notifications.toast', {
                category: item.category ?? 'generic',
                severity: isCritical ? 'critical' : 'info',
                notification: item.id,
            })}
        >
            <div className="space-y-1">
                {item.description && <p className="text-sm">{item.description}</p>}
                {item.location && (
                    <button
                        type="button"
                        className="text-sm font-medium text-blue-600 hover:underline"
                        onClick={() => navigate(item.location!)}
                        {...qa('host.notifications.toast.link', { notification: item.id })}
                    >
                        Перейти{item.locationLabel ? ` · ${item.locationLabel}` : ''}
                    </button>
                )}
            </div>
        </Notification>,
        { placement: 'top-end' },
    )
}

export default NotificationToaster
