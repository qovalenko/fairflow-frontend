import { useState, useMemo } from 'react'
import { PiClockCounterClockwiseDuotone, PiCaretDownDuotone, PiCaretRightDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Timeline from '@/components/ui/Timeline'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import classNames from '@/utils/classNames'
import isLastChild from '@/utils/isLastChild'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import type { HistoryTimelineEvent } from '@/components/shared/HistoryTimeline'
import { qa } from '../../../qa'

const formatDateRu = (ts: number) => dayjs.unix(ts).locale('ru').format('dddd, DD MMMM')

const AVATAR_COLORS = [
    'bg-purple-500 text-white',
    'bg-emerald-500 text-white',
    'bg-pink-500 text-white',
    'bg-blue-500 text-white',
    'bg-amber-500 text-white',
]

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
    }
    return name.slice(0, 2).toUpperCase() || '-'
}

function getAvatarColor(user: string): string {
    const hash = user.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export interface CompanyHistoryWidgetProps {
    events: HistoryTimelineEvent[]
}

const CompanyHistoryWidget = ({ events }: CompanyHistoryWidgetProps) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const groupedByDate = useMemo(() => {
        if (!events?.length) return []
        const groups = new Map<number, HistoryTimelineEvent[]>()
        const sorted = [...events].sort((a, b) => {
            const tsA = a.timestamp ?? dayjs(a.time, 'DD.MM.YYYY HH:mm').unix()
            const tsB = b.timestamp ?? dayjs(b.time, 'DD.MM.YYYY HH:mm').unix()
            return tsB - tsA
        })
        for (const entry of sorted) {
            const ts = entry.timestamp ?? dayjs(entry.time, 'DD.MM.YYYY HH:mm').unix()
            const dayStart = dayjs.unix(ts).startOf('day').unix()
            const list = groups.get(dayStart) || []
            list.push(entry)
            groups.set(dayStart, list)
        }
        return Array.from(groups.entries()).map(([date, entries]) => ({ date, entries }))
    }, [events])

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (!events?.length) {
        return (
            <Card
                className="w-full flex-1 flex flex-col min-h-0 max-h-[60vh] border border-gray-200 dark:border-gray-700"
                bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden"
                header={{
                    content: (
                        <div className="flex items-center gap-2">
                            <PiClockCounterClockwiseDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            <h4 className="text-base font-semibold">История</h4>
                        </div>
                    ),
                    extra: (
                        <span className="inline-flex p-2 rounded-lg" aria-hidden>
                            <span className="w-4 h-4" />
                        </span>
                    ),
                    bordered: true,
                }}
            >
                <div className="text-sm text-gray-500 py-4" {...qa('companies.card.historyEmpty')}>
                    Нет записей истории
                </div>
            </Card>
        )
    }

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 max-h-[60vh] border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiClockCounterClockwiseDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">История</h4>
                    </div>
                ),
                extra: (
                    <span className="inline-flex p-2 rounded-lg" aria-hidden>
                        <span className="w-4 h-4" />
                    </span>
                ),
                bordered: true,
            }}
        >
            <div className="flex-1 flex flex-col min-h-0 -mx-4 px-4 overflow-y-auto">
                {groupedByDate.map((group, i) => (
                    <div
                        key={group.date}
                        className={classNames(!isLastChild(groupedByDate, i) ? 'mb-8' : '')}
                    >
                        <div className="mb-2 font-bold heading-text uppercase">
                            {formatDateRu(group.date)}
                        </div>
                        <Timeline>
                            {group.entries.map((entry) => {
                                const hasDiff = entry.diff && entry.diff.length > 0
                                const isExpanded = expandedIds.has(entry.id)
                                const ts = entry.timestamp ?? dayjs(entry.time, 'DD.MM.YYYY HH:mm').unix()
                                const avatarColor = entry.user ? getAvatarColor(entry.user) : AVATAR_COLORS[0]

                                return (
                                    <Timeline.Item
                                        key={entry.id}
                                        media={
                                            <div className="flex mt-1">
                                                <Badge innerClass="bg-amber-500" />
                                            </div>
                                        }
                                    >
                                        <div className="flex items-start gap-2">
                                            {hasDiff && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(entry.id)}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded shrink-0 mt-0.5"
                                                    aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
                                                >
                                                    {isExpanded ? (
                                                        <PiCaretDownDuotone className="w-4 h-4" />
                                                    ) : (
                                                        <PiCaretRightDuotone className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className="font-bold heading-text">{entry.action}</span>
                                                </div>
                                                {entry.user && (
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Avatar
                                                            size="sm"
                                                            className={avatarColor}
                                                            src={entry.userAvatar}
                                                        >
                                                            {getInitials(entry.user)}
                                                        </Avatar>
                                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                                            {entry.user}
                                                        </span>
                                                    </div>
                                                )}
                                                {entry.details && (
                                                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                                        {entry.details}
                                                    </div>
                                                )}
                                                <div className="text-xs text-gray-500">
                                                    {dayjs.unix(ts).locale('ru').format('HH:mm')}
                                                </div>
                                                {isExpanded && hasDiff && entry.diff && (
                                                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                                                        <div className="font-medium mb-2">Изменения:</div>
                                                        <div className="space-y-1">
                                                            {entry.diff.map((d, idx) => (
                                                                <div key={idx}>
                                                                    <span className="font-medium">{d.field}:</span>{' '}
                                                                    <span className="text-red-600 dark:text-red-400 line-through">
                                                                        {d.old}
                                                                    </span>{' '}
                                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                                        {'→ '}
                                                                        {d.new}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Timeline.Item>
                                )
                            })}
                        </Timeline>
                    </div>
                ))}
            </div>
        </Card>
    )
}

export default CompanyHistoryWidget
