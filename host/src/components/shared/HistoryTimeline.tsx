import { useState } from 'react'
import { PiCaretDownDuotone, PiCaretRightDuotone } from 'react-icons/pi'
import Tag from '@/components/ui/Tag'

export interface HistoryTimelineEvent {
    id: string
    time: string
    /** Unix timestamp for grouping by date (optional) */
    timestamp?: number
    user: string
    /** Avatar image URL (optional) */
    userAvatar?: string
    action: string
    details?: string
    diff?: { field: string; old: string; new: string }[]
}

type HistoryTimelineProps = {
    events: HistoryTimelineEvent[]
    emptyMessage?: string
}

export default function HistoryTimeline({ events, emptyMessage = 'Нет записей' }: HistoryTimelineProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (!events.length) {
        return <div className="text-sm text-gray-500 py-4">{emptyMessage}</div>
    }

    return (
        <div className="space-y-2">
            {events.map((entry) => (
                <div key={entry.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-2">
                    <div className="flex items-center gap-2 py-2">
                        {entry.diff && entry.diff.length > 0 && (
                            <button
                                type="button"
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded shrink-0"
                                aria-label={expandedRows.has(entry.id) ? 'Свернуть' : 'Развернуть'}
                                onClick={() => toggleRow(entry.id)}
                            >
                                {expandedRows.has(entry.id) ? (
                                    <PiCaretDownDuotone className="w-4 h-4" />
                                ) : (
                                    <PiCaretRightDuotone className="w-4 h-4" />
                                )}
                            </button>
                        )}
                        <div className="flex-1 flex items-center gap-2 md:gap-3 text-sm min-w-0">
                            <span className="shrink-0 whitespace-nowrap text-gray-500">{entry.time}</span>
                            <span className="min-w-0 max-w-[40%] truncate text-gray-400">{entry.user}</span>
                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs shrink-0">
                                {entry.action}
                            </Tag>
                            <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{entry.details ?? ''}</span>
                        </div>
                    </div>
                    {expandedRows.has(entry.id) && entry.diff && entry.diff.length > 0 && (
                        <div className="ml-6 md:ml-8 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                            <div className="font-medium mb-2">Изменения:</div>
                            <div className="space-y-1">
                                {entry.diff.map((d, idx) => (
                                    <div key={idx}>
                                        <span className="font-medium">{d.field}:</span>{' '}
                                        <span className="text-red-600 dark:text-red-400 line-through">{d.old}</span>{' '}
                                        <span className="text-emerald-600 dark:text-emerald-400">→ {d.new}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
