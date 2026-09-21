import { useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiListDuotone,
    PiCalendarDuotone as PiCalendarIcon,
    PiPlusDuotone,
    PiFunnelDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import CalendarView from '@/components/shared/CalendarView'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import Segment from '@/components/ui/Segment'
import Dropdown from '@/components/ui/Dropdown'
import Checkbox from '@/components/ui/Checkbox'
import Loading from '@/components/shared/Loading'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import { useRememberProfileDefaultView } from '@/utils/profile/rememberDefaultView'
import { apiGetActivitiesCalendar, apiGetActivity } from '@/services/CrmService'
import usePermission from '@/utils/hooks/usePermission'
import PermissionCheck from '@/components/shared/PermissionCheck'
import type { Activity, ActivityType } from '@/@types/crm'
import {
    ActivityEmptyState,
    ActivityEmptyFilterState,
    ActivityErrorState,
    ActivityNoPermissionState,
} from './ActivityStatePanels'
import ActivityCalendarPreview, {
    type PreviewLink,
} from './ActivityCalendarPreview'
import {
    linkEntityPath,
    normalizeActivity,
    normalizeList,
    toSafeNumber,
    toSafeString,
    typeLabel,
} from './activityShared'
import { qa } from '../qa'

/**
 * Экран «Календарь активностей» (FR-ACTIVITIES-140).
 *
 * Источник данных — готовая серверная проекция `GET /v1/activities/calendar`
 * (`crm-bff.controller.ts` → `ActivityGrpc.ListActivitiesCalendar`), а НЕ общий
 * список активностей. Грани события считает домен: встреча — интервал
 * start/end, задача — all-day метка на сроке, звонок — точка, цвет по типу,
 * просроченное — красным. Раньше экран грузил `apiGetActivities({pageSize:1000})`
 * и раскладывал события сам: при >1000 активностей в проекте часть месяца
 * молча пропадала из календаря, а признак просрочки не показывался вовсе.
 *
 * Заметки без даты в календарь не попадают — так их и не отдаёт домен
 * (в календарной проекции у события обязателен старт), поэтому в легенде
 * их нет: показывать «Заметки» в легенде при пустой выборке было бы враньём.
 */

/** Событие календаря в форме, которую отдаёт gateway (даты уже ISO-строки). */
type CalendarEventDto = {
    id: string
    title: string
    start: string
    end?: string
    allDay?: boolean
    color?: string
    extendedProps?: { type?: string; overdue?: boolean }
}

/** Тип активности → ключ палитры CalendarView (см. defaultColorList). */
const paletteByType: Record<string, string> = {
    task: 'blue',
    call: 'purple',
    meeting: 'green',
    note: 'orange',
}

const FILTER_TYPES: ActivityType[] = ['task', 'call', 'meeting', 'note']

/** ISO/epoch из ответа → ISO-строка для FullCalendar (или undefined). */
const toIsoOrUndefined = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
    }
    const num = toSafeNumber(value)
    if (num === undefined || num <= 0) return undefined
    // Тот же порог, что в toEpochMs: секунды vs миллисекунды.
    const ms = num > 1e12 ? num : num * 1000
    const d = new Date(ms)
    return Number.isFinite(d.getTime()) ? d.toISOString() : undefined
}

/** Диапазон видимости FullCalendar → миллисекунды для API (dateFrom/dateTo). */
const buildVisibleRange = (start: Date, end: Date): { from: number; to: number } => ({
    from: dayjs(start).startOf('day').valueOf(),
    to: dayjs(end).subtract(1, 'millisecond').endOf('day').valueOf(),
})

/** Стартовый диапазон до первого datesSet — текущий календарный месяц. */
const getInitialVisibleRange = (): { from: number; to: number } =>
    buildVisibleRange(
        dayjs().startOf('month').toDate(),
        dayjs().add(1, 'month').startOf('month').toDate(),
    )

const normalizeEvent = (value: unknown): CalendarEventDto | null => {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>
    const id = toSafeString(raw.id || raw._id)
    const start = toIsoOrUndefined(raw.start)
    if (!id || !start) return null
    const extended = (raw.extendedProps ?? {}) as Record<string, unknown>
    return {
        id,
        title: toSafeString(raw.title) || 'Без названия',
        start,
        end: toIsoOrUndefined(raw.end),
        allDay: Boolean(raw.allDay ?? raw.all_day),
        color: toSafeString(raw.color) || undefined,
        extendedProps: {
            type: toSafeString(extended.type) || undefined,
            overdue: Boolean(extended.overdue),
        },
    }
}

const ActivityCalendar = () => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const location = useLocation()
    const isCalendarView = location.pathname.includes('/calendar')
    const can = usePermission()
    const canRead = can('activities', 'read')
    const canWrite = can('activities', 'write')

    /**
     * Фильтры ровно те, что понимает ручка: `type` — ОДИН тип (сервер валидирует
     * значение, списка не принимает), `mine=self` — только мои в рамках моего
     * visibility-scope. Диапазон — видимое окно календаря (`dateFrom`/`dateTo`).
     * Стартуем с текущего месяца, иначе SWR-ключ был бы null до `datesSet`,
     * empty-state монтировался вместо CalendarView и datesSet никогда не приходил.
     * TODO-071: домен режет окно только по `dueDate` — встречи без срока в
     * выборку не попадут, пока фильтр не научится смотреть start/end.
     */
    const [typeFilter, setTypeFilter] = useState<ActivityType | ''>('')
    const [mineOnly, setMineOnly] = useState(false)
    const [visibleRange, setVisibleRange] = useState(getInitialVisibleRange)
    const [calendarViewType, setCalendarViewType] = useState('dayGridMonth')
    const hasFilters = Boolean(typeFilter) || mineOnly
    const calendarGridRef = useRef<HTMLDivElement>(null)

    /** FullCalendar toolbar — сторонний DOM; qa навешиваем после mount/datesSet. */
    const tagCalendarToolbar = useCallback((root: HTMLElement | null) => {
        if (!root) return
        const mapping: Record<string, string> = {
            'fc-dayGridMonth-button': 'month',
            'fc-timeGridWeek-button': 'week',
            'fc-timeGridDay-button': 'day',
            'fc-prev-button': 'prev',
            'fc-next-button': 'next',
        }
        for (const [className, view] of Object.entries(mapping)) {
            const btn = root.querySelector(`.${className}`)
            if (!btn) continue
            const attrs = qa('activities.calendar.toolbar', { view })
            for (const name of Object.keys(attrs)) {
                const value = attrs[name as keyof typeof attrs]
                if (value !== undefined) btn.setAttribute(name, value)
            }
        }
    }, [])

    const handleDatesSet = useCallback(
        (arg: { start: Date; end: Date; view: { type: string } }) => {
            setVisibleRange(buildVisibleRange(arg.start, arg.end))
            setCalendarViewType(arg.view.type)
            tagCalendarToolbar(calendarGridRef.current)
        },
        [tagCalendarToolbar],
    )

    // pid в SWR-ключе: при смене проекта кэш не должен отдавать чужие активности
    const { data, isLoading, isValidating, error, mutate } = useSWR(
        canRead
            ? ['/api/v1/activities/calendar', pid, typeFilter, mineOnly, visibleRange.from, visibleRange.to]
            : null,
        () =>
            apiGetActivitiesCalendar<CalendarEventDto[]>({
                type: typeFilter || undefined,
                mine: mineOnly ? 'self' : undefined,
                dateFrom: visibleRange.from,
                dateTo: visibleRange.to,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true },
    )

    const isInitialLoading = canRead && isLoading && data === undefined
    const isRefreshing = isValidating && data !== undefined

    const [preview, setPreview] = useState<{
        activity: Activity
        anchorEl: HTMLElement
    } | null>(null)

    const events = useMemo(
        () =>
            normalizeList<unknown>(data)
                .map(normalizeEvent)
                .filter((e): e is CalendarEventDto => Boolean(e))
                .map((e) => ({
                    id: e.id,
                    title: e.title,
                    start: e.start,
                    // Точечные события (звонок, задача) домен отдаёт с end === start;
                    // FullCalendar трактует end как исключающий, поэтому не передаём.
                    end: e.end && e.end !== e.start ? e.end : undefined,
                    allDay: e.allDay,
                    extendedProps: {
                        eventColor: e.extendedProps?.overdue
                            ? 'red'
                            : paletteByType[e.extendedProps?.type ?? ''] || 'blue',
                        type: e.extendedProps?.type,
                        overdue: e.extendedProps?.overdue,
                    },
                })),
        [data],
    )

    const showEmptyState =
        data !== undefined &&
        !isValidating &&
        events.length === 0 &&
        (hasFilters || calendarViewType === 'dayGridMonth')

    const rememberActivitiesView = useRememberProfileDefaultView('defaultActivitiesView')

    const navigateToView = (value: string) => {
        rememberActivitiesView(value)
        if (value === 'calendar') {
            navigate(`/activities/calendar`)
        } else {
            navigate(`/activities`)
        }
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(
        isCalendarView ? 'calendar' : 'list',
        navigateToView,
    )

    /**
     * Календарная проекция намеренно компактна (id/заголовок/грани/цвет) —
     * связей и ответственного в ней нет. Для поповера дотягиваем карточку
     * точечным `GET /v1/activities/:id`; не открылась — уводим на страницу
     * активности, чтобы клик никогда не «проваливался» молча.
     */
    const handleEventClick = async (info: {
        event: { id: string }
        el: HTMLElement
        jsEvent?: { preventDefault?: () => void }
    }) => {
        info.jsEvent?.preventDefault?.()
        const { id, el } = { id: info.event.id, el: info.el }
        try {
            const raw = await apiGetActivity<Activity>(id, pid)
            const activity = normalizeActivity(raw)
            if (!activity) {
                navigate(`/activities/${id}`)
                return
            }
            setPreview({ activity, anchorEl: el })
        } catch {
            navigate(`/activities/${id}`)
        }
    }

    /**
     * data-qa-id для событий: их DOM рисует FullCalendar, пропсы через React
     * не пробросить — навешиваем атрибуты на смонтированный элемент, чтобы e2e
     * адресовал событие по id активности, а не по тексту/позиции.
     */
    const handleEventDidMount = useCallback(
        (arg: { event: { id: string }; el: HTMLElement }) => {
            const attrs = qa('activities.calendar.event', {
                activity: arg.event.id,
            })
            Object.keys(attrs).forEach((name) => {
                const value = attrs[name as keyof typeof attrs]
                if (value !== undefined) arg.el.setAttribute(name, value)
            })
        },
        [],
    )

    const handleEntityClick = (kind: PreviewLink['kind'], id: string) => {
        const path = linkEntityPath(kind, id)
        setPreview(null)
        if (path) navigate(path)
    }

    const resetFilters = () => {
        setTypeFilter('')
        setMineOnly(false)
    }

    /** FR-ACTIVITIES-030: клик по слоту → форма создания с предзаполненной датой/временем. */
    // Структурный тип вместо import type из '@fullcalendar/interaction': пакет —
    // зависимость host, в node_modules модуля его нет (typecheck модуля падал бы).
    const handleDateClick = useCallback(
        (arg: { date: Date; view: { type: string } }) => {
            if (!canWrite) return
            const hasTime = arg.view.type.includes('timeGrid')
            const dueDate = hasTime
                ? dayjs(arg.date).format('YYYY-MM-DDTHH:mm')
                : dayjs(arg.date).format('YYYY-MM-DD')
            navigate(`/activities/new?dueDate=${encodeURIComponent(dueDate)}`)
        },
        [canWrite, navigate],
    )

    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityNoPermissionState />
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3>Активности</h3>
                        <div className="flex items-center gap-2">
                            <PermissionCheck subject="activities" action="write">
                                <Tooltip title="Создать активность">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => navigate(`/activities/new`)}
                                            {...qa('activities.calendar.create')}
                                        />
                                    </span>
                                </Tooltip>
                            </PermissionCheck>
                            <Dropdown
                                renderTitle={
                                    <Button
                                        variant={hasFilters ? 'default' : 'plain'}
                                        size="sm"
                                        title="Фильтр"
                                        aria-label="Фильтр"
                                        icon={
                                            <PiFunnelDuotone className="w-4 h-4" />
                                        }
                                        {...qa('activities.calendar.filter')}
                                    />
                                }
                                placement="bottom-end"
                                menuClass="!min-w-[220px] !p-3"
                            >
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                    Тип активности
                                </div>
                                {FILTER_TYPES.map((t) => (
                                    <Dropdown.Item
                                        key={t}
                                        variant="custom"
                                        className="!p-0"
                                    >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setTypeFilter((prev) =>
                                                    prev === t ? '' : t,
                                                )
                                            }}
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === 'Enter' ||
                                                    e.key === ' '
                                                ) {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    setTypeFilter((prev) =>
                                                        prev === t ? '' : t,
                                                    )
                                                }
                                            }}
                                            {...qa('activities.calendar.typeFilter', {
                                                type: t,
                                            })}
                                        >
                                            <Checkbox
                                                checked={typeFilter === t}
                                                readOnly
                                            />
                                            <span className="text-sm">
                                                {typeLabel[t]}
                                            </span>
                                        </div>
                                    </Dropdown.Item>
                                ))}
                                <div className="my-2 border-t border-gray-200 dark:border-gray-600" />
                                <Dropdown.Item variant="custom" className="!p-0">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setMineOnly((v) => !v)
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                setMineOnly((v) => !v)
                                            }
                                        }}
                                        {...qa('activities.calendar.mineOnly')}
                                    >
                                        <Checkbox checked={mineOnly} readOnly />
                                        <span className="text-sm">Только мои</span>
                                    </div>
                                </Dropdown.Item>
                                {hasFilters && (
                                    <Dropdown.Item
                                        variant="custom"
                                        className="!p-0"
                                    >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            className="mt-1 px-2 py-1.5 cursor-pointer rounded-lg text-sm text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-700"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                resetFilters()
                                            }}
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === 'Enter' ||
                                                    e.key === ' '
                                                ) {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                    resetFilters()
                                                }
                                            }}
                                            {...qa('activities.calendar.filterReset')}
                                        >
                                            Сбросить фильтры
                                        </div>
                                    </Dropdown.Item>
                                )}
                            </Dropdown>
                            <Segment
                                value={segmentValue}
                                onChange={(val) =>
                                    handleViewToggle(val as string)
                                }
                                size="sm"
                            >
                                <Segment.Item
                                    value="list"
                                    {...qa('activities.calendar.viewList')}
                                >
                                    <div className="flex items-center gap-1">
                                        <PiListDuotone className="w-4 h-4" />
                                        <span>Список</span>
                                    </div>
                                </Segment.Item>
                                <Segment.Item
                                    value="calendar"
                                    {...qa('activities.calendar.viewCalendar')}
                                >
                                    <div className="flex items-center gap-1">
                                        <PiCalendarIcon className="w-4 h-4" />
                                        <span>Календарь</span>
                                    </div>
                                </Segment.Item>
                            </Segment>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 items-center text-sm" {...qa('activities.calendar.legend')}>
                        <span className="text-gray-500">Легенда:</span>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-[#bce9fb]" />
                            <span>Задачи</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-[#ccbbfc]" />
                            <span>Звонки</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-[#bee9d3]" />
                            <span>Встречи</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-[#fbddd9]" />
                            <span>Просрочено</span>
                        </div>
                        {hasFilters && (
                            <span className="text-gray-500">
                                Фильтр:{' '}
                                {[
                                    typeFilter ? typeLabel[typeFilter] : null,
                                    mineOnly ? 'только мои' : null,
                                ]
                                    .filter(Boolean)
                                    .join(', ')}
                            </span>
                        )}
                    </div>

                    {error ? (
                        <ActivityErrorState onRetry={() => mutate()} />
                    ) : showEmptyState ? (
                        hasFilters ? (
                            <ActivityEmptyFilterState onReset={resetFilters} />
                        ) : (
                            <ActivityEmptyState
                                onCreate={
                                    canWrite
                                        ? () => navigate(`/activities/new`)
                                        : undefined
                                }
                            />
                        )
                    ) : (
                        <Loading loading={isInitialLoading || isRefreshing} type="cover">
                            <div {...qa('activities.calendar.grid')} ref={calendarGridRef}>
                            <CalendarView
                                events={events}
                                eventClick={handleEventClick}
                                eventDidMount={handleEventDidMount}
                                dateClick={handleDateClick}
                                datesSet={handleDatesSet}
                                initialView="dayGridMonth"
                                headerToolbar={{
                                    left: 'title',
                                    center: '',
                                    right: 'dayGridMonth,timeGridWeek,timeGridDay prev,next',
                                }}
                                locale="ru"
                                height="auto"
                                nowIndicator={true}
                                dayMaxEvents={4}
                            />
                            </div>
                        </Loading>
                    )}
                </div>
            </AdaptiveCard>

            <ActivityCalendarPreview
                activity={preview?.activity ?? null}
                anchorEl={preview?.anchorEl ?? null}
                onClose={() => setPreview(null)}
                onOpen={(id) => {
                    setPreview(null)
                    navigate(`/activities/${id}`)
                }}
                onEntityClick={handleEntityClick}
            />
        </Container>
    )
}

export default ActivityCalendar
