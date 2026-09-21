import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'

type NotifyType = 'success' | 'warning' | 'danger' | 'info'

/**
 * toast.push требует React-ЭЛЕМЕНТ: ToastWrapper рендерит сообщение через
 * cloneElement(node), а cloneElement по строке падает «Element type is invalid».
 * Поэтому строку всегда оборачиваем в <Notification> (паттерн host/utils/notify).
 */
export function pushToast(message: string, type: NotifyType = 'info') {
    toast.push(
        <Notification type={type} duration={4000}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}
