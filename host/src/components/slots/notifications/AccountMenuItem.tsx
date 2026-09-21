import Dropdown from '@/components/ui/Dropdown'
import { Link } from 'react-router'
import { PiBellDuotone } from 'react-icons/pi'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import { qa } from '@/shared/qa'

/**
 * EL-SET-8 — пункт «Настройки уведомлений» в слот `account.menu.item`
 * (host-only, SCR-SHELL-CHROME-USER-MENU).
 */
export default function AccountMenuItem() {
    const canRead = usePermission('notifications', 'read')
    const currentProject = useProjectStore((s) => s.currentProject)
    const moduleEnabled = getEnabledModules(currentProject).includes('notifications')

    if (!moduleEnabled || !canRead) return null

    return (
        <Dropdown.Item eventKey="notifications-settings" className="px-0">
            <Link
                className="flex h-full w-full px-2 gap-2 items-center"
                to="/account/notifications/settings"
                {...qa('host.notifications.accountMenuLink')}
            >
                <span className="text-xl">
                    <PiBellDuotone />
                </span>
                <span>Настройки уведомлений</span>
            </Link>
        </Dropdown.Item>
    )
}
