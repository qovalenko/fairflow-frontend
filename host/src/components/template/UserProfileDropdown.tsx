import Avatar from '@/components/ui/Avatar'
import Dropdown from '@/components/ui/Dropdown'
import Switcher from '@/components/ui/Switcher'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import { useSessionUser } from '@/store/authStore'
import { Link } from 'react-router'
import {
    PiSignOutDuotone,
    PiShieldCheckDuotone,
    PiBuildingsDuotone,
    PiCrownDuotone,
    PiUserCircleDuotone,
    PiSunDuotone,
    PiMoonDuotone,
} from 'react-icons/pi'
import { useAuth } from '@/auth'
import useDarkMode from '@/utils/hooks/useDarkMode'
import { THEME_ENUM } from '@/constants/theme.constant'
import Slot from '@/components/shared/Slot'
import { qa, qaWithAlias } from '@/shared/qa'

const orgRoleIcons: Record<string, React.ReactNode> = {
    platform_owner: <PiCrownDuotone className="text-amber-500 text-xs" />,
    platform_admin: (
        <PiShieldCheckDuotone className="text-green-500 text-xs" />
    ),
    employee: <PiUserCircleDuotone className="text-gray-400 text-xs" />,
}

const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return (parts[0]?.[0] ?? '?').toUpperCase()
}

const avatarColors = [
    'bg-indigo-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-violet-500',
]

const pickColor = (name: string) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return avatarColors[Math.abs(hash) % avatarColors.length]
}

const _UserDropdown = () => {
    const user = useSessionUser((state) => state.user)
    const { avatar, userName, email, system, systemRole } = user

    const { signOut } = useAuth()
    const [isDark, onModeChange] = useDarkMode()

    const initials = getInitials(userName || 'U')
    const colorClass = pickColor(userName || 'U')

    const renderAvatar = (sz: number) =>
        avatar ? (
            <Avatar size={sz} src={avatar} />
        ) : (
            <Avatar size={sz} className={`${colorClass} text-white font-semibold`}>
                {initials}
            </Avatar>
        )

    return (
        <Dropdown
            className="flex"
            toggleClassName="flex items-center"
            renderTitle={
                <div
                    className="cursor-pointer flex items-center"
                    {...qa('host.userMenu.trigger')}
                >
                    {renderAvatar(32)}
                </div>
            }
            placement="bottom-end"
            menuClass="min-w-[240px]"
        >
            <Dropdown.Item variant="header" className="px-0">
                <Link
                    to="/account/profile"
                    className="py-2 px-3 flex items-center gap-3 w-full hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-t-lg transition-colors outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                    {...qaWithAlias('host.userMenu.profileLink', 'host.userMenu.profile')}
                >
                    {renderAvatar(40)}
                    <div className="min-w-0">
                        <div className="font-bold text-gray-900 dark:text-gray-100 truncate">
                            {userName || 'Пользователь'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{email}</div>
                    </div>
                </Link>
            </Dropdown.Item>
            <Dropdown.Item variant="divider" />
            <Dropdown.Item eventKey="theme" className="px-2 py-2" {...qa('host.userMenu.theme')}>
                <div
                    className="flex items-center justify-between w-full gap-2 cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation()
                        onModeChange(
                            isDark ? THEME_ENUM.MODE_LIGHT : THEME_ENUM.MODE_DARK,
                        )
                    }}
                >
                    <span className="flex gap-2 items-center text-sm font-medium">
                        <span className="text-xl">
                            {isDark ? <PiMoonDuotone /> : <PiSunDuotone />}
                        </span>
                        Тема
                    </span>
                    <Switcher
                        checked={isDark}
                        checkedContent={<PiSunDuotone className="w-4 h-4" />}
                        unCheckedContent={<PiMoonDuotone className="w-4 h-4" />}
                        onChange={(checked) =>
                            onModeChange(
                                checked ? THEME_ENUM.MODE_DARK : THEME_ENUM.MODE_LIGHT,
                            )
                        }
                    />
                </div>
            </Dropdown.Item>
            <Slot id="account.menu.item" pending={null} />
            <Dropdown.Item variant="divider" />
            <Dropdown.Item variant="header">
                <span className="px-2 text-xs font-semibold text-gray-400 uppercase">
                    Организация
                </span>
            </Dropdown.Item>
            <Dropdown.Item eventKey="system" className="px-0">
                <Link className="flex h-full w-full px-2" to="/settings">
                    <span className="flex gap-2 items-center w-full">
                        <span className="text-xl">
                            <PiBuildingsDuotone />
                        </span>
                        <span className="flex-1 truncate">
                            {system?.name ?? 'Система'}
                        </span>
                        {systemRole && orgRoleIcons[systemRole]}
                    </span>
                </Link>
            </Dropdown.Item>
            <Dropdown.Item variant="divider" />
            <Dropdown.Item
                eventKey="Sign Out"
                className="gap-2"
                {...qa('host.userMenu.signOut')}
                onClick={() => signOut()}
            >
                <span className="text-xl">
                    <PiSignOutDuotone />
                </span>
                <span>Выйти</span>
            </Dropdown.Item>
        </Dropdown>
    )
}

const UserDropdown = withHeaderItem(_UserDropdown)

export default UserDropdown
