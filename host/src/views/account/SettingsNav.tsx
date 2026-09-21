import { Link, useLocation } from 'react-router'
import {
    PiUserDuotone,
    PiShieldDuotone,
    PiBellDuotone,
    PiBuildingsDuotone,
    PiListDuotone,
    PiUsersDuotone,
    PiScrollDuotone,
    PiStackDuotone,
    PiKeyDuotone,
    PiSignInDuotone,
} from 'react-icons/pi'
import classNames from 'classnames'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import useNotifications from '@/utils/hooks/useNotifications'
import { qa, qaWithAlias } from '@/shared/qa'

/**
 * Единый сайдбар настроек аккаунта + компании (box single-tenant).
 * Раньше настройки компании были отдельным разделом «Организация». В коробке
 * одна Система на инстанс — всё плоско в ОДНОМ сайдбаре: личные пункты
 * (/account/*) + пункты системы (/settings/*). Рендерится и в AccountLayout,
 * и в SystemSettingsLayout — сайдбар одинаков на всех этих экранах.
 *
 * `activePath` (org-подпуть, напр. '/projects') принудительно подсвечивает пункт
 * компании, когда layout открыт вне своего маршрута (мастер создания проекта).
 */
type NavItem = {
    to: string
    label: string
    icon: typeof PiUserDuotone
    exact?: boolean
    /** `subject:action` — пункт скрыт без права (org-проекции PDP, fail-closed). */
    requires?: string
    /** true → показать бейдж непрочитанных уведомлений. */
    notifBadge?: boolean
    /** org-подпуть для сопоставления с `activePath` (только пункты компании). */
    orgKey?: string
}

const SETTINGS_BASE = '/settings'

const items: NavItem[] = [
    { to: '/account/profile', label: 'Профиль', icon: PiUserDuotone },
    { to: '/account/access', label: 'Мои доступы', icon: PiKeyDuotone },
    { to: '/settings/colleagues', label: 'Коллеги', icon: PiUsersDuotone, orgKey: '/colleagues' },
    { to: '/account/security', label: 'Безопасность', icon: PiShieldDuotone },
    { to: '/account/notifications', label: 'Уведомления', icon: PiBellDuotone, notifBadge: true },
    { to: SETTINGS_BASE, label: 'Реквизиты', icon: PiBuildingsDuotone, exact: true, orgKey: '' },
    // TODO-026 / TODO-104 (box): пункт «Сводка по региону» (org-overview) убран —
    // в коробке нет сущности «Организация», backend /v1/system/overview/* снят (DEORG),
    // роллап не писался → экран всегда был пустым.
    { to: SETTINGS_BASE + '/departments', label: 'Подразделения', icon: PiListDuotone, orgKey: '/departments' },
    { to: SETTINGS_BASE + '/projects', label: 'Проекты', icon: PiStackDuotone, orgKey: '/projects' },
    { to: SETTINGS_BASE + '/employees', label: 'Сотрудники', icon: PiUsersDuotone, exact: true, orgKey: '/employees' },
    { to: SETTINGS_BASE + '/sso', label: 'Внешний SSO', icon: PiSignInDuotone, orgKey: '/sso' },
    { to: SETTINGS_BASE + '/service-api-keys', label: 'Service API keys', icon: PiKeyDuotone, orgKey: '/service-api-keys' },
    { to: SETTINGS_BASE + '/audit', label: 'Журнал аудита', icon: PiScrollDuotone, requires: 'orgAudit:read', orgKey: '/audit' },
    // Box single-tenant: «Опасная зона» (деактивация организации) убрана —
    // инстанс сам является единственной Системой, деактивировать некого.
]

const SettingsNav = ({ activePath }: { activePath?: string }) => {
    const location = useLocation()
    const { unreadCount } = useNotifications({ pageSize: 1 })
    // Гейтинг пунктов компании по `requires` от реальной org-проекции PDP
    // (employee не увидит «Журнал аудита»/«Опасную зону»). Fail-closed при загрузке.
    const can = useOrgPermission()

    const links = items.filter((l) => {
        if (!l.requires) return true
        const [subject, action] = l.requires.split(':')
        return can(subject, action)
    })

    const navKey = (to: string): string => {
        const segments = to.replace(/^\//, '').split('/')
        return segments[segments.length - 1] || segments[0] || 'root'
    }

    return (
        <nav className="space-y-1">
            {links.map((link) => {
                const Icon = link.icon
                const isActive = activePath
                    ? link.orgKey === activePath
                    : link.exact
                      ? location.pathname === link.to
                      : location.pathname === link.to ||
                        location.pathname.startsWith(link.to + '/')

                return (
                    <Link
                        key={link.to}
                        to={link.to}
                        aria-current={isActive ? 'page' : undefined}
                        {...(link.notifBadge
                            ? qaWithAlias(
                                  'host.settings.nav.item',
                                  'host.notifications.settingsNav.link',
                              )
                            : qaWithAlias('host.settingsNav.item', 'host.settings.nav.item'))}
                        {...qa('host.settingsNav.item', {
                            nav: navKey(link.to),
                            ...(isActive ? { active: 'true' } : {}),
                        })}
                        className={classNames(
                            'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
                        )}
                        {...qa('host.settings.nav.item', {
                            nav:
                                link.orgKey !== undefined
                                    ? link.orgKey || 'profile'
                                    : link.to.replace(/^\//, ''),
                        })}
                    >
                        <Icon className="w-5 h-5" />
                        <span>{link.label}</span>
                        {link.notifBadge && unreadCount > 0 && (
                            <span
                                className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold"
                                {...qaWithAlias(
                                    'host.settingsNav.badge',
                                    'host.notifications.settingsNav.badge',
                                )}
                            >
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </Link>
                )
            })}
        </nav>
    )
}

export default SettingsNav
