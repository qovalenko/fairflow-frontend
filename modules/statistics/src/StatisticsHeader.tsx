/**
 * Общий header/toolbar обоих экранов области (EL-DASH-1..4 / EL-ANL-1/4/11):
 * заголовок, селектор периода, индикатор scope, метка asOf + «Обновить»,
 * бейдж partial. Read-only-природа: никаких write-контролов.
 */
import { PERIOD_OPTIONS, PartialBadge, formatAsOf, scopeLabel } from './statistics.shared'
import type { CustomRange, Period, ScopeLevel } from './statistics.shared'
import { qa } from './qa'

const CONTROL_CLASS =
    'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800'

export const StatisticsHeader = ({
    title,
    period,
    onPeriodChange,
    range,
    onRangeChange,
    rangeIncomplete,
    asOf,
    partial,
    scopeLevel,
    onRefresh,
    isRefreshing,
    children,
}: {
    title: string
    period: Period
    onPeriodChange: (p: Period) => void
    /** Произвольный диапазон (`period === 'custom'`, FR-MSTAT-7). */
    range: CustomRange
    onRangeChange: (r: CustomRange) => void
    rangeIncomplete: boolean
    asOf: number | string | null
    partial: boolean
    scopeLevel?: ScopeLevel
    onRefresh: () => void
    isRefreshing: boolean
    /** Доп. контролы справа (срезы/экспорт на ANALYTICS). */
    children?: React.ReactNode
}) => {
    const asOfText = formatAsOf(asOf)
    const scope = scopeLabel(scopeLevel)
    return (
        <div className="flex flex-col gap-3" {...qa('statistics.header.root')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-bold">{title}</h3>
                <div className="flex flex-wrap items-center gap-2">
                    {/* EL-DASH-1 Селектор периода (FR-MSTAT-7/8) */}
                    <select
                        className={CONTROL_CLASS}
                        value={period}
                        onChange={(e) =>
                            onPeriodChange(e.target.value as Period)
                        }
                        {...qa('statistics.header.period')}
                    >
                        {PERIOD_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    {/* Произвольный диапазон: gateway/домен принимают from/to
                        (epoch ms, custom требует from ≤ to) — FR-MSTAT-7. */}
                    {period === 'custom' && (
                        <span className="inline-flex items-center gap-1">
                            <input
                                type="date"
                                aria-label="Начало периода"
                                className={CONTROL_CLASS}
                                value={range.from}
                                max={range.to || undefined}
                                onChange={(e) =>
                                    onRangeChange({
                                        ...range,
                                        from: e.target.value,
                                    })
                                }
                                {...qa('statistics.header.rangeFrom')}
                            />
                            <span className="text-sm text-gray-400">—</span>
                            <input
                                type="date"
                                aria-label="Конец периода"
                                className={CONTROL_CLASS}
                                value={range.to}
                                min={range.from || undefined}
                                onChange={(e) =>
                                    onRangeChange({
                                        ...range,
                                        to: e.target.value,
                                    })
                                }
                                {...qa('statistics.header.rangeTo')}
                            />
                        </span>
                    )}
                    {children}
                    {/* EL-DASH-2 Метка asOf + «Обновить» (FR-MSTAT-14) */}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-700"
                        {...qa('statistics.header.refresh')}
                    >
                        <span className={isRefreshing ? 'animate-spin' : ''}>
                            ↻
                        </span>
                        Обновить
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                {scope && (
                    <span
                        className="inline-flex items-center gap-1"
                        {...qa('statistics.header.scope')}
                    >
                        👁 смотрю: {scope}
                    </span>
                )}
                {asOfText && (
                    <span
                        title="данные могут обновляться с задержкой"
                        {...qa('statistics.header.asOf')}
                    >
                        {asOfText}
                    </span>
                )}
                {rangeIncomplete && (
                    <span
                        className="text-amber-600 dark:text-amber-400"
                        {...qa('statistics.header.rangeIncomplete')}
                    >
                        укажите обе даты диапазона (начало ≤ конец)
                    </span>
                )}
                {partial && <PartialBadge />}
            </div>
        </div>
    )
}

export default StatisticsHeader
