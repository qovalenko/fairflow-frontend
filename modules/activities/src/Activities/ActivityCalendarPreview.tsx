import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import {
    PiClockDuotone,
    PiUserDuotone,
    PiHandshakeDuotone,
    PiBuildingsDuotone,
    PiReceiptDuotone,
    PiArrowRightDuotone,
    PiCircleDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import type { Activity } from '@/@types/crm'
import {
    typeLabel,
    statusLabel,
    personDisplayName,
    linkEntityPath,
    toEpochMs,
} from './activityShared'
import { qa } from '../qa'

const typeTagClass: Record<string, string> = {
    task: 'bg-[#bce9fb] text-gray-900',
    call: 'bg-[#ccbbfc] text-gray-900',
    meeting: 'bg-[#bee9d3] text-gray-900',
    note: 'bg-[#ffc6ab] text-gray-900',
}

const statusDotClass: Record<string, string> = {
    planned: 'text-blue-500',
    in_progress: 'text-amber-500',
    completed: 'text-emerald-500',
    cancelled: 'text-gray-400',
}

export interface PreviewLink {
    kind: 'deal' | 'contact' | 'company' | 'order'
    id?: string
    name: string
}

const linkMeta: Record<
    PreviewLink['kind'],
    { icon: React.ComponentType<{ className?: string }> }
> = {
    deal: { icon: PiHandshakeDuotone },
    contact: { icon: PiUserDuotone },
    company: { icon: PiBuildingsDuotone },
    order: { icon: PiReceiptDuotone },
}

const defaultLinkName: Record<PreviewLink['kind'], string> = {
    deal: 'Сделка',
    contact: 'Контакт',
    company: 'Компания',
    order: 'Заказ',
}

/**
 * Первичные связанные сущности активности (сделка/контакт/компания/заказ).
 * Источники: денормализованные поля (dealName/dealId…) и полиморфный `links[]`
 * из контракта активностей (§6.2). Дубли по (kind,id) отсеиваем.
 */
const collectLinks = (a: Activity): PreviewLink[] => {
    const out: PreviewLink[] = []
    const seen = new Set<string>()
    const add = (kind: PreviewLink['kind'], id?: string, name?: string) => {
        if (!id && !name) return
        const key = `${kind}:${id ?? name}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ kind, id: id || undefined, name: name || defaultLinkName[kind] })
    }
    add('deal', a.dealId, a.dealName)
    add('contact', a.contactId, a.contactName)
    add('company', a.companyId, a.companyName)
    add('order', a.orderId, a.orderName)
    ;(a.links ?? []).forEach((link) => {
        if (
            link.entityType === 'deal' ||
            link.entityType === 'contact' ||
            link.entityType === 'company' ||
            link.entityType === 'order'
        ) {
            add(link.entityType, link.entityId, link.nameSnapshot)
        }
    })
    return out
}

const fmt = (ms: number, withDate = true) =>
    dayjs(ms).format(withDate ? 'DD.MM.YYYY HH:mm' : 'HH:mm')

/** Строка «время» события: интервал start—end, либо срок, либо дата создания. */
const timeText = (a: Activity): string => {
    const start = toEpochMs(a.startDate)
    const end = toEpochMs(a.endDate)
    const due = toEpochMs(a.dueDate)
    const created = toEpochMs(a.createdAt)
    if (start) {
        if (end) {
            const sameDay =
                dayjs(end).format('DD.MM.YYYY') === dayjs(start).format('DD.MM.YYYY')
            return `${fmt(start)} — ${fmt(end, !sameDay)}`
        }
        return fmt(start)
    }
    if (due) return `Срок: ${fmt(due)}`
    if (created) return fmt(created)
    return 'Дата не указана'
}

const POPOVER_W = 288
const GAP = 8

const computePosition = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = rect.left
    if (left + POPOVER_W + GAP > vw) left = vw - POPOVER_W - GAP
    if (left < GAP) left = GAP
    // По умолчанию снизу; если внизу мало места — сверху.
    const below = rect.bottom + GAP
    const openUp = below > vh - 120 && rect.top > vh - rect.bottom
    const top = openUp ? undefined : below
    const bottom = openUp ? vh - rect.top + GAP : undefined
    return { left, top, bottom }
}

export interface ActivityCalendarPreviewProps {
    activity: Activity | null
    anchorEl: HTMLElement | null
    onClose: () => void
    onOpen: (id: string) => void
    onEntityClick: (kind: PreviewLink['kind'], id: string) => void
}

/**
 * Поповер-предпросмотр события календаря активностей (T-019 / FR-MACT).
 * Показывает время, тип, связанную сущность (линк) и ответственного,
 * плюс кнопку «Открыть» карточки активности. Самодостаточный портал —
 * без внешних зависимостей позиционирования (в модуле нет @floating-ui).
 */
const ActivityCalendarPreview = ({
    activity,
    anchorEl,
    onClose,
    onOpen,
    onEntityClick,
}: ActivityCalendarPreviewProps) => {
    const open = Boolean(activity && anchorEl)
    const popoverRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState<{
        left: number
        top?: number
        bottom?: number
    } | null>(null)

    useLayoutEffect(() => {
        if (!open || !anchorEl) {
            setPos(null)
            return
        }
        const update = () => setPos(computePosition(anchorEl))
        update()
        window.addEventListener('scroll', update, true)
        window.addEventListener('resize', update)
        return () => {
            window.removeEventListener('scroll', update, true)
            window.removeEventListener('resize', update)
        }
    }, [open, anchorEl])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        const onPointer = (e: MouseEvent) => {
            const target = e.target as Node
            if (popoverRef.current?.contains(target)) return
            if (anchorEl?.contains(target)) return
            onClose()
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('mousedown', onPointer, true)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('mousedown', onPointer, true)
        }
    }, [open, anchorEl, onClose])

    const links = useMemo(
        () => (activity ? collectLinks(activity) : []),
        [activity],
    )

    if (!open || !activity || !pos) return null

    const assignee = personDisplayName(
        activity.assigneeName,
        (activity as { assigneeEmail?: string }).assigneeEmail,
        activity.assigneeId,
    )

    return createPortal(
        <div
            ref={popoverRef}
            role="dialog"
            aria-label="Предпросмотр активности"
            style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
                width: POPOVER_W,
                zIndex: 60,
            }}
            className="max-w-[calc(100vw-1rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-600 dark:bg-gray-800"
            {...qa('activities.calendarPreview.popover', {
                activity: activity.id,
            })}
        >
            <div className="mb-2 flex items-start justify-between gap-2">
                <h6 className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
                    {activity.title}
                </h6>
                <Tag
                    className={`shrink-0 ${typeTagClass[activity.type] || 'bg-gray-100 text-gray-700'}`}
                >
                    {typeLabel[activity.type]}
                </Tag>
            </div>

            <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <PiClockDuotone className="h-4 w-4 shrink-0 text-gray-400" />
                    <span>{timeText(activity)}</span>
                </div>

                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <PiCircleDuotone
                        className={`h-4 w-4 shrink-0 ${statusDotClass[activity.status] || 'text-gray-400'}`}
                    />
                    <span>{statusLabel[activity.status] || activity.status}</span>
                </div>

                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <PiUserDuotone className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className="truncate">{assignee}</span>
                </div>

                {links.length > 0 ? (
                    <div className="space-y-1">
                        {links.map((link) => {
                            const Icon = linkMeta[link.kind].icon
                            const canOpen =
                                Boolean(link.id) &&
                                Boolean(linkEntityPath(link.kind, link.id!))
                            return (
                                <div
                                    key={`${link.kind}-${link.id ?? link.name}`}
                                    className="flex items-center gap-2"
                                >
                                    <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                                    {canOpen ? (
                                        <button
                                            type="button"
                                            className="truncate text-left text-blue-600 hover:underline dark:text-blue-400"
                                            onClick={() =>
                                                onEntityClick(link.kind, link.id!)
                                            }
                                            {...qa(
                                                'activities.calendarPreview.entityLink',
                                                { entity: link.kind },
                                            )}
                                        >
                                            {link.name}
                                        </button>
                                    ) : (
                                        <span className="truncate text-gray-600 dark:text-gray-300">
                                            {link.name}
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-gray-400">
                        <PiHandshakeDuotone className="h-4 w-4 shrink-0" />
                        <span>Нет связей</span>
                    </div>
                )}
            </div>

            <div className="mt-3 flex justify-end">
                <Button
                    variant="solid"
                    color="primary"
                    size="sm"
                    icon={<PiArrowRightDuotone />}
                    onClick={() => onOpen(activity.id)}
                    {...qa('activities.calendarPreview.open', {
                        activity: activity.id,
                    })}
                >
                    Открыть
                </Button>
            </div>
        </div>,
        document.body,
    )
}

export default ActivityCalendarPreview
