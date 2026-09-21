import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { qa } from '@/shared/qa'

type NotifyType = 'success' | 'warning' | 'danger' | 'info'

const toastQaByType: Record<NotifyType, string> = {
    success: 'host.toast.success',
    warning: 'host.toast.warning',
    danger: 'host.toast.danger',
    info: 'host.toast.info',
}

/** Lightweight toast helper used by profile/auth screens (ST-29 success / ST-7 error). */
export function notify(message: string, type: NotifyType = 'success') {
    toast.push(
        <Notification type={type} duration={4000} {...qa(toastQaByType[type])}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}
