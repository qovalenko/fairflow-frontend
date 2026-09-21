import Badge from '@/components/ui/Badge'
import useNotifications from '@/utils/hooks/useNotifications'
import { qa } from '@/shared/qa'

/**
 * EL-BELL-11 — проекция счётчика непрочитанных в слот `nav.item.badge`
 * (`{moduleId}=notifications`, SCR-SHELL-CHROME-SIDENAV).
 *
 * Host передаёт context `{ moduleId }` пункта меню (каталог `contextProps`).
 * Слот `open`: вклад notifications монтируется только на своём пункте.
 */
export default function NavItemBadge({ moduleId }: { moduleId?: string }) {
    const { canRead, unreadCount } = useNotifications({ pageSize: 1, subscribe: false })

    if (moduleId !== 'notifications' || !canRead || unreadCount <= 0) return null

    return (
        <Badge
            content={unreadCount > 99 ? '99+' : unreadCount}
            className="bg-red-500 text-white text-xs min-w-[1.25rem]"
            {...qa('host.notifications.navBadge')}
        />
    )
}
