import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiArrowSquareOutDuotone, PiWarningDuotone } from 'react-icons/pi'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiDrillReport,
    formatRub,
    type DrillCell,
    type RunParams,
} from '@/services/ReportsService'
import { ErrorState, errMessage } from './shared'
import { qa } from './qa'

/**
 * SCR-REPORTS-DRILLDOWN (TO-BE Should) — оверлей со списком записей за агрегатом.
 * Самосогласованность (М-MREP-5): счётчик берётся из ответа drill, не из агрегата
 * пресета; расхождение → ST-28 (метка задержки).
 */

export interface DrillContext {
    reportId: string
    cell: DrillCell
    /** Подпись ячейки в заголовке («Won», «Иванов А.»). */
    label: string
    /** Тип целевой области для перехода на карточку / в список. */
    target: 'deals' | 'contacts' | 'companies' | 'orders' | 'activities'
    /** Значение агрегата пресета (для проверки самосогласованности). */
    aggregate?: number
    params?: RunParams
}

const TARGET_ROUTE: Record<DrillContext['target'], string> = {
    deals: '/deals',
    contacts: '/contacts',
    companies: '/companies',
    orders: '/orders',
    activities: '/activities',
}

const TARGET_READ: Record<DrillContext['target'], string> = {
    deals: 'deals',
    contacts: 'contacts',
    companies: 'companies',
    orders: 'orders',
    activities: 'activities',
}

const DrillDownPanel = ({
    open,
    projectId,
    ctx,
    onClose,
}: {
    open: boolean
    projectId?: string
    ctx: DrillContext | null
    onClose: () => void
}) => {
    const navigate = useNavigate()
    const can = usePermission()

    const targetSubject = ctx ? TARGET_READ[ctx.target] : ''
    const canReadTarget = ctx ? can(targetSubject, 'read') : false

    const swrKey =
        open && ctx && projectId
            ? ['/reports/drill', projectId, ctx.reportId, ctx.cell.dimension, ctx.cell.value]
            : null

    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        () =>
            apiDrillReport(
                ctx!.reportId,
                { params: ctx!.params, cell: ctx!.cell, limit: 50 },
                { projectId: projectId! },
            ),
        { revalidateOnFocus: false },
    )

    const items = data?.items ?? []
    // ST-28: самосогласованность — счётчик из drill, расхождение с агрегатом → метка.
    const count = data?.total ?? items.length
    const lag = ctx?.aggregate != null && data != null && ctx.aggregate !== count

    const openRecord = (id: string) => {
        if (!ctx || !canReadTarget) return
        navigate(`${TARGET_ROUTE[ctx.target]}/${id}`)
        onClose()
    }

    const openList = () => {
        if (!ctx) return
        navigate(TARGET_ROUTE[ctx.target])
        onClose()
    }

    return (
        <Drawer
            isOpen={open}
            onClose={onClose}
            onRequestClose={onClose}
            width={520}
            title={
                <div className="flex flex-col">
                    <span className="font-semibold">
                        Записи за «{ctx?.label ?? ''}»
                    </span>
                    {!isLoading && !error && (
                        <span className="text-xs text-gray-500">
                            {count} {count === 1 ? 'запись' : 'записей'}
                            {lag && (
                                <span className="inline-flex items-center gap-1 ml-2 text-amber-500">
                                    <PiWarningDuotone className="w-3.5 h-3.5" />
                                    данные обновляются с задержкой
                                </span>
                            )}
                        </span>
                    )}
                </div>
            }
        >
            <div className="flex flex-col gap-3" {...qa('reports.drill.drawer')}>
                <Button size="sm" variant="plain" onClick={onClose} {...qa('reports.drill.close')}>
                    Закрыть
                </Button>
                {/* ST-1: загрузка */}
                {isLoading && (
                    <div className="flex flex-col gap-2" {...qa('reports.drill.skeleton')}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} height={40} className="rounded-lg" />
                        ))}
                    </div>
                )}

                {/* ST-6: ошибка + retry */}
                {!isLoading && error && (
                    <ErrorState
                        message={errMessage(error, 'Не удалось загрузить записи')}
                        onRetry={() => mutate()}
                    />
                )}

                {/* ST-9: пусто (рассинхрон) — drill вызван по ненулевому агрегату */}
                {!isLoading && !error && items.length === 0 && (
                    <p className="text-center py-8 text-gray-400 text-sm">
                        Записи не найдены — возможно, данные обновляются с задержкой.
                    </p>
                )}

                {/* Данные */}
                {!isLoading && !error && items.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-2 font-semibold">Название</th>
                                    <th className="text-right py-2 font-semibold">Сумма</th>
                                    <th className="text-left py-2 font-semibold">Ответственный</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it) => (
                                    <tr key={it.id} className="border-b last:border-0">
                                        <td className="py-2">
                                            {/* ST-11/12: кликабельно только при праве на цель */}
                                            {canReadTarget ? (
                                                <button
                                                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                                                    onClick={() => openRecord(it.id)}
                                                    {...qa('reports.drill.record', { record: it.id })}
                                                >
                                                    {it.name}
                                                </button>
                                            ) : (
                                                <span className="font-medium">{it.name}</span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                            {typeof it.amount === 'number'
                                                ? formatRub(it.amount)
                                                : '—'}
                                        </td>
                                        <td className="py-2 text-gray-500">
                                            {it.ownerId ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* EL-DRILL-3: открыть полный список области */}
                        {canReadTarget && (
                            <button
                                className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={openList}
                                {...qa('reports.drill.openInSection')}
                            >
                                <PiArrowSquareOutDuotone className="w-4 h-4" />
                                Открыть в разделе
                            </button>
                        )}
                    </div>
                )}
            </div>
        </Drawer>
    )
}

export default DrillDownPanel
