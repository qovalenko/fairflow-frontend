import { useRef } from 'react'
import classNames from 'classnames'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Dropdown from '@/components/ui/Dropdown'
import ScrollBar from '@/components/ui/ScrollBar'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import isLastChild from '@/utils/isLastChild'
import useResponsive from '@/utils/hooks/useResponsive'
import { useNavigate } from 'react-router'
import useNotifications from '@/utils/hooks/useNotifications'
import type { NotificationItem } from '@/services/NotificationService'
import {
    PiBellDuotone,
    PiBellSlashDuotone,
    PiEnvelopeOpenDuotone,
    PiHandshakeDuotone,
    PiPhoneIncomingDuotone,
    PiUserPlusDuotone,
    PiFileTextDuotone,
    PiWarningDuotone,
    PiArrowsClockwiseDuotone,
} from 'react-icons/pi'
import type { DropdownRef } from '@/components/ui/Dropdown'
import { qa, qaWithAlias } from '@/shared/qa'

/**
 * SCR-NOTIFY-BELL — колокольчик-дропдаун (host-shell, kind:"system").
 *
 * Mount-point слота `shell.header.action` (host-only). Видимость слота —
 * `useSlotContributions` (system-карточка notifications всегда в enabledCards);
 * внутри скрываем по праву (ST-12: usePermission('notifications','read')).
 *
 * Покрытые состояния (ux/screens/notifications SCR-NOTIFY-BELL §10):
 *  ST-1 loading (skeleton), ST-3 empty, ST-6 error+retry, ST-7 откат markRead,
 *  ST-12 гейт по праву, ST-17 module-disabled, ST-27 offline+refresh,
 *  ST-29 optimistic mark, ST-33 адаптивность.
 */

const categoryIcon: Record<string, { icon: React.ReactNode; bgClass: string }> = {
    deals: { icon: <PiHandshakeDuotone />, bgClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' },
    sales: { icon: <PiHandshakeDuotone />, bgClass: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' },
    activities: { icon: <PiPhoneIncomingDuotone />, bgClass: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
    org: { icon: <PiUserPlusDuotone />, bgClass: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400' },
    data: { icon: <PiFileTextDuotone />, bgClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' },
    import: { icon: <PiFileTextDuotone />, bgClass: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400' },
    billing: { icon: <PiWarningDuotone />, bgClass: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400' },
}

/** Generic-иконка при неизвестной категории (грабли: AS-IS fallback на deal). */
const genericIcon = {
    icon: <PiBellDuotone />,
    bgClass: 'bg-gray-100 dark:bg-gray-600/30 text-gray-600 dark:text-gray-300',
}

const notificationHeight = 'h-[320px]'

const isDocumentNotification = (item: NotificationItem): boolean =>
    Boolean(item.location?.includes('/documents'))

const _Notification = ({ className }: { className?: string }) => {
    const { larger } = useResponsive()
    const navigate = useNavigate()
    const notificationDropdownRef = useRef<DropdownRef>(null)

    const {
        canRead,
        list,
        unreadCount,
        isLoading,
        error,
        moduleDisabled,
        offline,
        refresh,
        markRead,
        markAllRead,
    } = useNotifications({ pageSize: 8, subscribe: true })

    // ST-12: без права чтения колокольчик не рендерится (скрыть, не disabled).
    if (!canRead) return null

    const unreadNotification = unreadCount > 0

    const handleViewAll = () => {
        navigate('/account/notifications')
        notificationDropdownRef.current?.handleDropdownClose()
    }

    const onRowClick = async (item: NotificationItem) => {
        if (!item.readed) {
            try {
                await markRead(item.id)
            } catch {
                // ST-7: откат уже выполнен в хуке; показываем toast.
                toast.push(
                    <Notification title="Ошибка" type="danger" {...qa('host.notifications.toast.error')}>
                        Не удалось отметить уведомление прочитанным
                    </Notification>,
                )
            }
        }
        // FR-MNOT-21: deep-link к источнику, иначе раскрытие в ленте.
        if (item.location) {
            navigate(item.location)
        } else {
            navigate('/account/notifications')
        }
        notificationDropdownRef.current?.handleDropdownClose()
    }

    const onMarkAll = async () => {
        try {
            await markAllRead()
        } catch {
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('host.notifications.toast.error')}>
                    Не удалось отметить все прочитанными
                </Notification>,
            )
        }
    }

    return (
        <Dropdown
            ref={notificationDropdownRef}
            renderTitle={
                <div
                    className={classNames('text-2xl', className)}
                    {...qaWithAlias('host.notifications.bell.trigger', 'host.notifications.trigger')}
                >
                    {unreadNotification ? (
                        <Badge
                            badgeStyle={{ top: '2px', right: '4px' }}
                            content={unreadCount}
                            innerClass="bg-red-500 text-white text-[10px] min-w-4 h-4 px-1 py-0 flex items-center justify-center"
                            {...qa('host.notifications.bell.badge')}
                        >
                            <PiBellDuotone />
                        </Badge>
                    ) : (
                        <PiBellDuotone />
                    )}
                </div>
            }
            menuClass="min-w-[280px] md:min-w-[340px]"
            placement={larger.md ? 'bottom-end' : 'bottom'}
        >
            <Dropdown.Item variant="header">
                <div
                    className="dark:border-gray-700 px-2 flex items-center justify-between mb-1"
                    {...qa('host.notifications.bell.header')}
                >
                    <h6>Уведомления</h6>
                    <Button
                        variant="plain"
                        shape="circle"
                        size="sm"
                        icon={<PiEnvelopeOpenDuotone className="text-xl" />}
                        title="Прочитать все"
                        disabled={!unreadNotification}
                        onClick={onMarkAll}
                        {...qa('host.notifications.bell.markAll')}
                    />
                </div>
                {/* EL-BELL-9 — ST-27 offline/stale + ручной refresh */}
                {offline && (
                    <div
                        className="px-2 pb-1 flex items-center justify-between text-xs text-amber-600 dark:text-amber-400"
                        {...qa('host.notifications.bell.offlineBanner')}
                    >
                        <span>Соединение потеряно — данные могут устаревать</span>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            onClick={refresh}
                            {...qa('host.notifications.bell.offlineRefresh')}
                        >
                            <PiArrowsClockwiseDuotone /> Обновить
                        </button>
                    </div>
                )}
            </Dropdown.Item>

            <ScrollBar
                className={classNames('overflow-y-auto', notificationHeight)}
                {...qa('host.notifications.bell.menu')}
            >
                {renderBody({
                    isLoading,
                    error,
                    moduleDisabled,
                    list,
                    onRowClick,
                    onRetry: refresh,
                })}
            </ScrollBar>

            <Dropdown.Item variant="header">
                <div className="pt-4">
                    <Button
                        block
                        variant="solid"
                        onClick={handleViewAll}
                        {...qa('host.notifications.viewAll')}
                    >
                        Все уведомления
                    </Button>
                </div>
            </Dropdown.Item>
        </Dropdown>
    )
}

interface BodyArgs {
    isLoading: boolean
    error: unknown
    moduleDisabled: boolean
    list: NotificationItem[]
    onRowClick: (item: NotificationItem) => void
    onRetry: () => void
}

function renderBody({ isLoading, error, moduleDisabled, list, onRowClick, onRetry }: BodyArgs) {
    // ST-17: module disabled
    if (moduleDisabled) {
        return (
            <div
                className="flex flex-col items-center justify-center h-full gap-2 text-center text-gray-500 px-6"
                {...qa('host.notifications.bell.moduleDisabled')}
            >
                <PiBellSlashDuotone className="text-3xl" />
                <span className="text-sm">Модуль уведомлений выключен в проекте</span>
            </div>
        )
    }
    // ST-1: loading skeleton (EL-BELL-8)
    if (isLoading) {
        return (
            <div
                className="px-4 py-3 space-y-4"
                {...qaWithAlias('host.notifications.bell.skeleton', 'host.notifications.loading')}
            >
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-3/4" />
                            <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }
    // ST-6: error + retry
    if (error) {
        return (
            <div
                className="flex flex-col items-center justify-center h-full gap-3 text-center text-gray-500 px-6"
                {...qa('host.notifications.bell.error')}
            >
                <PiWarningDuotone className="text-3xl text-red-500" />
                <span className="text-sm">Не удалось загрузить уведомления</span>
                <Button size="sm" variant="default" onClick={onRetry} {...qa('host.notifications.bell.retry')}>
                    Повторить
                </Button>
            </div>
        )
    }
    // ST-3: empty (EL-BELL-7)
    if (list.length === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center h-full gap-2 text-center text-gray-500 px-6"
                {...qa('host.notifications.bell.empty')}
            >
                <PiBellDuotone className="text-3xl" />
                <span className="text-sm">Нет уведомлений</span>
            </div>
        )
    }
    // Data
    return list.map((item, index) => {
        const config = categoryIcon[item.category ?? ''] ?? genericIcon
        return (
            <div key={item.id}>
                <div
                    className="relative rounded-xl flex px-4 py-3 cursor-pointer hover:bg-gray-100 active:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => onRowClick(item)}
                    {...qaWithAlias(
                        isDocumentNotification(item)
                            ? 'documents.notification.row'
                            : 'host.notifications.bell.row',
                        'host.notifications.item',
                    )}
                    {...qa(
                        isDocumentNotification(item)
                            ? 'documents.notification.row'
                            : 'host.notifications.bell.row',
                        {
                            category: item.category ?? 'generic',
                            notification: item.id,
                            id: item.id,
                        },
                    )}
                >
                    <div>
                        <Avatar
                            shape="circle"
                            className={config.bgClass}
                            icon={config.icon}
                            {...qa('host.notifications.bell.rowIcon', { notification: item.id })}
                        />
                    </div>
                    <div className="mx-3">
                        <div>
                            <span className="font-semibold heading-text">{item.target} </span>
                            <span>{item.description}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs">{formatRelative(item.date)}</span>
                            {/* EL-BELL-10 — метка проекта при scope=all */}
                            {item.projectLabel && (
                                <span
                                    className="text-[10px] px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
                                    {...qa('host.notifications.bell.rowProject', { notification: item.id })}
                                >
                                    {item.projectLabel}
                                </span>
                            )}
                        </div>
                    </div>
                    <Badge
                        className="absolute top-4 ltr:right-4 rtl:left-4 mt-1.5"
                        innerClass={item.readed ? 'bg-gray-300 dark:bg-gray-600' : 'bg-primary'}
                    />
                </div>
                {!isLastChild(list, index) && (
                    <div className="border-b border-gray-200 dark:border-gray-700 mx-4" />
                )}
            </div>
        )
    })
}

/** Относительное время из ISO-даты (мягкая деградация если формат иной). */
function formatRelative(value: string): string {
    const t = Date.parse(value)
    if (Number.isNaN(t)) return value
    const diff = Date.now() - t
    const min = Math.round(diff / 60000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    const h = Math.round(min / 60)
    if (h < 24) return `${h} ч назад`
    const d = Math.round(h / 24)
    if (d === 1) return 'вчера'
    if (d < 7) return `${d} дн назад`
    return new Date(t).toLocaleDateString('ru-RU')
}

const NotificationDropdown = withHeaderItem(_Notification)

export default NotificationDropdown
