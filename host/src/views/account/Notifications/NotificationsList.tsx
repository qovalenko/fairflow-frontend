import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
    PiBellDuotone,
    PiBellSlashDuotone,
    PiCheckDuotone,
    PiWarningDuotone,
    PiArrowsClockwiseDuotone,
} from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useNotifications from '@/utils/hooks/useNotifications'
import type { NotificationItem } from '@/services/NotificationService'
import { useSessionUser } from '@/store/authStore'
import { qa, qaWithAlias } from '@/shared/qa'

const { TabNav, TabList, TabContent } = Tabs

/**
 * SCR-NOTIFY-LIST — полная страница «Все уведомления» (host-shell, AccountLayout).
 *
 * Покрытые состояния (ux/screens/notifications SCR-NOTIFY-LIST §10):
 *  ST-1 loading (skeleton групп), ST-3 empty (нет данных), ST-4 empty-фильтр
 *  (свой текст — OQ-UX-NOTIFY-3), ST-6 error+retry, ST-7 откат markAll/markOne,
 *  ST-9 not-found источника (toast), ST-10 no-permission (route), ST-12 гейт
 *  кнопок, ST-17 module-disabled, ST-27 offline+refresh, ST-29 optimistic.
 *  Группировка «Сегодня/Вчера/Ранее» из created_at; SPA <Link> вместо <a href>.
 */

type DateGroup = 'today' | 'yesterday' | 'earlier'

function groupOf(dateISO: string): DateGroup {
    const t = Date.parse(dateISO)
    if (Number.isNaN(t)) return 'earlier'
    const now = new Date()
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startYesterday = startToday - 86400000
    if (t >= startToday) return 'today'
    if (t >= startYesterday) return 'yesterday'
    return 'earlier'
}

function formatRelative(value: string): string {
    const t = Date.parse(value)
    if (Number.isNaN(t)) return value
    const diff = Date.now() - t
    const min = Math.round(diff / 60000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    const h = Math.round(min / 60)
    if (h < 24) return `${h} ч назад`
    return new Date(t).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const GROUP_LABEL: Record<DateGroup, string> = {
    today: 'Сегодня',
    yesterday: 'Вчера',
    earlier: 'Ранее',
}

const NotificationsList = () => {
    const navigate = useNavigate()
    const [filter, setFilter] = useState<'all' | 'unread'>('all')

    const {
        canRead,
        moduleEnabled,
        list,
        unreadCount,
        isLoading,
        error,
        moduleDisabled,
        offline,
        refresh,
        markRead,
        markAllRead,
    } = useNotifications({ pageSize: 50, scope: 'all' })

    const sessionProjects = useSessionUser((s) => s.user.projects ?? [])
    const projectLabel = (id?: string) =>
        sessionProjects.find((p) => p.id === id)?.name ?? id ?? ''

    const listWithProjects = useMemo(
        () =>
            list.map((n) => ({
                ...n,
                projectLabel: n.projectLabel || projectLabel(n.projectId),
            })),
        [list, sessionProjects],
    )

    const filtered = useMemo(
        () => (filter === 'unread' ? listWithProjects.filter((n) => !n.readed) : listWithProjects),
        [listWithProjects, filter],
    )

    const grouped = useMemo(() => {
        const g: Record<DateGroup, NotificationItem[]> = { today: [], yesterday: [], earlier: [] }
        for (const n of filtered) g[groupOf(n.date)].push(n)
        return g
    }, [filtered])

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

    const onRowClick = async (item: NotificationItem) => {
        if (!item.readed) {
            try {
                await markRead(item.id)
            } catch {
                toast.push(
                    <Notification title="Ошибка" type="danger" {...qa('host.notifications.toast.error')}>
                        Не удалось отметить уведомление прочитанным
                    </Notification>,
                )
            }
        }
        if (item.location) {
            // ST-9: при недоступности источника be вернёт ошибку перехода;
            // здесь — SPA-навигация (point-check suppress обрабатывается на be).
            navigate(item.location)
        } else {
            toast.push(
                <Notification title="Уведомление" type="info" {...qa('host.notifications.toast.info')}>
                    У этого уведомления нет связанной записи
                </Notification>,
            )
        }
    }

    const header = (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <PiBellDuotone className="w-7 h-7 text-gray-500" />
                <h2 className="text-2xl font-semibold" {...qa('host.notificationsList.heading')}>
                    Все уведомления
                </h2>
            </div>
            {/* EL-LIST-2 — ST-12: скрыта без права; disabled если нечего отмечать */}
            {canRead && (
                <Button
                    variant="plain"
                    icon={<PiCheckDuotone />}
                    disabled={unreadCount === 0}
                    {...qa('host.notificationsList.markAll')}
                    onClick={onMarkAll}
                >
                    Отметить все как прочитанные
                </Button>
            )}
        </div>
    )

    return (
        <AccountLayout>
            <div className="space-y-6" {...qa('host.notifications.list.screen')}>
                {header}

                {/* EL-LIST-3 — карточка-ссылка на настройки */}
                <AdaptiveCard>
                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="mb-1">Уведомления</h5>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Настройте параметры уведомлений
                            </p>
                        </div>
                        <Link to="/account/notifications/settings">
                            <Button variant="plain" icon={<PiBellDuotone />}>
                                Настройки уведомлений
                            </Button>
                        </Link>
                    </div>
                </AdaptiveCard>

                {/* ST-27 — offline-индикатор + ручной refresh */}
                {offline && (
                    <div
                        className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
                        {...qa('host.notificationsList.offlineBanner')}
                        {...qa('host.notifications.list.offlineBanner')}
                    >
                        <span>Соединение потеряно — данные могут устаревать</span>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            {...qa('host.notificationsList.offlineRefresh')}
                            onClick={refresh}
                            {...qa('host.notifications.list.offlineRefresh')}
                        >
                            <PiArrowsClockwiseDuotone /> Обновить
                        </button>
                    </div>
                )}

                {renderContent({
                    canRead,
                    moduleEnabled,
                    moduleDisabled,
                    isLoading,
                    error,
                    filter,
                    setFilter,
                    grouped,
                    filteredCount: filtered.length,
                    onRetry: refresh,
                    onRowClick,
                })}
            </div>
        </AccountLayout>
    )
}

interface ContentArgs {
    canRead: boolean
    moduleEnabled: boolean
    moduleDisabled: boolean
    isLoading: boolean
    error: unknown
    filter: 'all' | 'unread'
    setFilter: (f: 'all' | 'unread') => void
    grouped: Record<DateGroup, NotificationItem[]>
    filteredCount: number
    onRetry: () => void
    onRowClick: (item: NotificationItem) => void
}

function renderContent(args: ContentArgs) {
    const { canRead, moduleEnabled, moduleDisabled, isLoading, error, filter, setFilter, grouped, filteredCount, onRetry, onRowClick } = args

    // ST-17: module disabled (Contextual `moduleEnabled` OR backend MODULE_DISABLED).
    // Check this FIRST: `notifications:read` is derived from the enabled-module
    // catalog, so when the module is off even the owner's projection lacks the
    // permission — surfacing the (misleading) «no access» wording instead of the
    // real reason. The owner has all rights; the module is simply not enabled.
    if (!moduleEnabled || moduleDisabled) {
        return (
            <AdaptiveCard>
                <div
                    className="flex flex-col items-center justify-center py-16 gap-2 text-center text-gray-500"
                    {...qa('host.notificationsList.unavailable')}
                    {...qa('host.notifications.list.unavailable', { reason: 'moduleDisabled' })}
                >
                    <PiBellSlashDuotone className="text-4xl" />
                    <h5>Раздел недоступен</h5>
                    <p className="text-sm">Модуль уведомлений выключен в проекте</p>
                </div>
            </AdaptiveCard>
        )
    }

    // ST-10: genuine no-permission (module enabled, role lacks notifications:read)
    if (!canRead) {
        return (
            <AdaptiveCard>
                <div
                    className="flex flex-col items-center justify-center py-16 gap-2 text-center text-gray-500"
                    {...qa('host.notificationsList.unavailable')}
                    {...qa('host.notifications.list.unavailable', { reason: 'noPermission' })}
                >
                    <PiBellSlashDuotone className="text-4xl" />
                    <h5>Раздел недоступен</h5>
                    <p className="text-sm">У вас нет доступа к уведомлениям</p>
                </div>
            </AdaptiveCard>
        )
    }

    return (
        <Tabs value={filter} onChange={(val) => setFilter(val as 'all' | 'unread')}>
            <TabList>
                <TabNav value="all" {...qa('host.notificationsList.tab', { tab: 'all' })} {...qa('host.notifications.list.tab', { tab: 'all' })}>
                    Все
                </TabNav>
                <TabNav value="unread" {...qa('host.notificationsList.tab', { tab: 'unread' })} {...qa('host.notifications.list.tab', { tab: 'unread' })}>
                    Непрочитанные
                </TabNav>
            </TabList>
            <div className="mt-4">
                <TabContent value={filter}>
                    <AdaptiveCard>
                        {/* ST-6: error + retry */}
                        {error ? (
                            <div
                                className="flex flex-col items-center justify-center py-16 gap-3 text-center text-gray-500"
                                {...qa('host.notificationsList.error')}
                                {...qa('host.notifications.list.error')}
                            >
                                <PiWarningDuotone className="text-4xl text-red-500" />
                                <h5>Не удалось загрузить уведомления</h5>
                                <Button
                                    size="sm"
                                    variant="default"
                                    {...qa('host.notificationsList.retry')}
                                    onClick={onRetry}
                                    {...qa('host.notifications.list.retry')}
                                >
                                    Повторить
                                </Button>
                            </div>
                        ) : isLoading ? (
                            // ST-1: skeleton групп (EL-LIST-12)
                            <ListSkeleton />
                        ) : filteredCount === 0 ? (
                            // ST-3 / ST-4: разный текст пустого состояния (OQ-UX-NOTIFY-3)
                            <EmptyState filter={filter} onResetFilter={() => setFilter('all')} />
                        ) : (
                            <div className="space-y-6">
                                {(['today', 'yesterday', 'earlier'] as DateGroup[]).map((g) =>
                                    grouped[g].length > 0 ? (
                                        <div key={g}>
                                            <h6
                                                className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"
                                                {...qa('host.notificationsList.groupHeader', { group: g })}
                                                {...qa('host.notifications.list.groupHeader', { group: g })}
                                            >
                                                {GROUP_LABEL[g]}
                                            </h6>
                                            <div className="space-y-2">
                                                {grouped[g].map((n) => (
                                                    <NotificationRow
                                                        key={n.id}
                                                        item={n}
                                                        onClick={() => onRowClick(n)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : null,
                                )}
                            </div>
                        )}
                    </AdaptiveCard>
                </TabContent>
            </div>
        </Tabs>
    )
}

function NotificationRow({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
    const dotClass =
        item.severity === 'critical' || item.category === 'billing'
            ? 'bg-red-500'
            : item.severity === 'important'
              ? 'bg-amber-500'
              : 'bg-blue-500'
    return (
        <div
            role="button"
            tabIndex={0}
            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                !item.readed ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}
            {...qaWithAlias('host.notifications.list.row', 'host.accountNotifications.item')}
            {...qa('host.notifications.list.row', {
                category: item.category ?? 'generic',
                notification: item.id,
                severity: item.severity ?? 'info',
                id: item.id,
            })}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter') onClick()
            }}
        >
            <div
                className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${dotClass}`}
                {...qa('host.notifications.list.severityDot', {
                    category: item.category ?? 'generic',
                    notification: item.id,
                    severity: item.severity ?? 'info',
                })}
            />
            <div className="flex-1 min-w-0">
                <p className="text-sm">
                    <span className="font-medium">{item.target}</span>
                    {item.description ? <span className="text-gray-600 dark:text-gray-400"> — {item.description}</span> : null}
                </p>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{formatRelative(item.date)}</span>
                    {item.locationLabel && (
                        <span
                            className="text-[10px] px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
                            {...qa('host.notifications.list.rowLocation', { notification: item.id })}
                        >
                            {item.locationLabel}
                        </span>
                    )}
                    {item.projectLabel && (
                        <span
                            className="text-[10px] px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
                            {...qa('host.notifications.list.rowProject', { notification: item.id })}
                        >
                            {item.projectLabel}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

function EmptyState({ filter, onResetFilter }: { filter: 'all' | 'unread'; onResetFilter: () => void }) {
    if (filter === 'unread') {
        // ST-4: пустой фильтр — текст отличается от ST-3
        return (
            <div
                className="text-center py-12 text-gray-500 space-y-3"
                {...qa('host.notificationsList.emptyFilter')}
                {...qa('host.notifications.list.emptyFilter')}
            >
                <PiCheckDuotone className="text-4xl mx-auto text-emerald-500" />
                <p>Всё прочитано</p>
                <Button
                    size="sm"
                    variant="default"
                    {...qa('host.notificationsList.resetFilter')}
                    onClick={onResetFilter}
                >
                    Показать все
                </Button>
            </div>
        )
    }
    // ST-3: нет данных
    return (
        <div
            className="text-center py-12 text-gray-500 space-y-2"
            {...qa('host.notificationsList.empty')}
            {...qa('host.notifications.list.empty')}
        >
            <PiBellDuotone className="text-4xl mx-auto" />
            <p>Нет уведомлений</p>
        </div>
    )
}

function ListSkeleton() {
    return (
        <div
            className="space-y-6"
            {...qa('host.notificationsList.skeleton')}
            {...qa('host.notifications.list.skeleton')}
        >
            {[0, 1].map((g) => (
                <div key={g}>
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-600 rounded mb-3 animate-pulse" />
                    <div className="space-y-2">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
                                <div className="w-2 h-2 rounded-full mt-2 bg-gray-200 dark:bg-gray-600" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-2/3" />
                                    <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded w-1/4" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default NotificationsList
