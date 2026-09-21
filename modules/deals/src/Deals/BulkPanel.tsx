import { useMemo, useState } from 'react'
import {
    PiUsersDuotone,
    PiArrowsLeftRightDuotone,
    PiTrashDuotone,
    PiXDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import {
    apiBulkAcceptDealDrift,
    apiBulkUpdateDeals,
    apiDeleteDeal,
} from '@/services/CrmService'
import usePermission from '@/utils/hooks/usePermission'
import type { BulkAcceptDriftResult, BulkUpdateResult, ProjectMember } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

type Props = {
    selectedIds: string[]
    /** Selected deals flagged with drift — subset of `selectedIds` (FR-DEALS-290). */
    driftDealIds: string[]
    members: ProjectMember[]
    stageOptions: { value: string; label: string }[]
    onClear: () => void
    /** Called after a successful bulk op so the caller can refetch. */
    onDone: () => void
}

/**
 * SCR-DEALS-BULK-PANEL — mass operations over selected deals.
 * Reassign/department change = transfer of ownership → manager+ only
 * (pipe contract §14). Delete = soft delete, manager+ (`deals:delete`).
 * Partial success is surfaced from `{updated[],skipped[]}` (ST-31).
 */
const BulkPanel = ({
    selectedIds,
    driftDealIds,
    members,
    stageOptions,
    onClear,
    onDone,
}: Props) => {
    const can = usePermission()
    const canWrite = can('deals', 'write')
    const canManage = can('deals', 'manage')
    const canMove = can('deals.stage', 'move')
    const canDelete = can('deals', 'delete')

    const [mode, setMode] = useState<'assign' | 'stage' | null>(null)
    const [assigneeId, setAssigneeId] = useState('')
    const [stageId, setStageId] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const memberOptions = useMemo(
        () => members.map((m) => ({ value: m.id, label: m.name })),
        [members],
    )

    const reportResult = (res: BulkUpdateResult | undefined, verb: string) => {
        if (res?.async) {
            notifySuccess(
                `${verb}: задача поставлена в очередь${res.jobId ? ` (${res.jobId})` : ''}`,
            )
            return
        }
        const updated = res?.updated?.length ?? selectedIds.length
        const skipped = res?.skipped?.length ?? 0
        if (skipped > 0) {
            notifySuccess(`${verb}: ${updated}, пропущено: ${skipped}`)
        } else {
            notifySuccess(`${verb}: ${updated}`)
        }
    }

    const handleBulkAssign = async () => {
        if (!assigneeId) return
        setSubmitting(true)
        try {
            const res = await apiBulkUpdateDeals<BulkUpdateResult>({
                dealIds: selectedIds,
                change: { assigneeId },
            })
            reportResult(res, 'Назначено')
            setMode(null)
            setAssigneeId('')
            onDone()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось назначить ответственного'))
        } finally {
            setSubmitting(false)
        }
    }

    const handleBulkMove = async () => {
        if (!stageId) return
        setSubmitting(true)
        try {
            const res = await apiBulkUpdateDeals<BulkUpdateResult>({
                dealIds: selectedIds,
                change: { stageId },
            })
            reportResult(res, 'Перемещено')
            setMode(null)
            setStageId('')
            onDone()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось переместить сделки'))
        } finally {
            setSubmitting(false)
        }
    }

    const handleBulkAcceptDrift = async () => {
        if (driftDealIds.length === 0) return
        setSubmitting(true)
        try {
            const res = await apiBulkAcceptDealDrift<BulkAcceptDriftResult>({
                dealIds: driftDealIds,
            })
            const accepted = res?.accepted?.length ?? 0
            const skipped = res?.skipped?.length ?? 0
            if (skipped > 0) {
                notifySuccess(`Drift принят: ${accepted}, пропущено: ${skipped}`)
            } else {
                notifySuccess(`Drift принят: ${accepted}`)
            }
            onDone()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось принять изменения'))
        } finally {
            setSubmitting(false)
        }
    }

    const handleBulkDelete = async () => {
        if (!window.confirm(`Удалить выбранные сделки (${selectedIds.length})?`)) return
        setSubmitting(true)
        try {
            const results = await Promise.allSettled(
                selectedIds.map((id) => apiDeleteDeal(id)),
            )
            const ok = results.filter((r) => r.status === 'fulfilled').length
            const failed = results.length - ok
            if (failed > 0) {
                notifyError(`Удалено: ${ok}, не удалось: ${failed}`)
            } else {
                notifySuccess(`Удалено: ${ok}`)
            }
            onDone()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось удалить сделки'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div
            className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-4 py-3"
            {...qa('deals.bulk.panel')}
        >
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Выбрано: {selectedIds.length}
            </span>

            {mode === null && (
                <>
                    {canMove && (
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<PiArrowsLeftRightDuotone />}
                            onClick={() => setMode('stage')}
                            {...qa('deals.bulk.moveStage')}
                        >
                            Переместить стадию
                        </Button>
                    )}
                    {canManage && (
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<PiUsersDuotone />}
                            onClick={() => setMode('assign')}
                            {...qa('deals.bulk.assign')}
                        >
                            Назначить
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            size="sm"
                            variant="plain"
                            className="text-red-600 hover:text-red-500"
                            icon={<PiTrashDuotone />}
                            loading={submitting}
                            onClick={handleBulkDelete}
                            {...qa('deals.bulk.delete')}
                        >
                            Удалить
                        </Button>
                    )}
                    {canWrite && driftDealIds.length > 0 && (
                        <>
                            <Button
                                size="sm"
                                variant="plain"
                                icon={<PiWarningDuotone />}
                                loading={submitting}
                                onClick={handleBulkAcceptDrift}
                                {...qa('deals.bulk.driftAccept')}
                            >
                                Принять изменения ({driftDealIds.length})
                            </Button>
                            <Button
                                size="sm"
                                variant="plain"
                                onClick={onClear}
                                disabled={submitting}
                                {...qa('deals.bulk.driftDefer')}
                            >
                                Отложить
                            </Button>
                        </>
                    )}
                    <Button size="sm" variant="plain" icon={<PiXDuotone />} onClick={onClear}>
                        Снять выбор
                    </Button>
                </>
            )}

            {mode === 'assign' && (
                <div className="flex items-center gap-2">
                    <div className="w-[220px]">
                        <Select
                            placeholder="Новый ответственный"
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === assigneeId) || null}
                            onChange={(opt) => setAssigneeId(opt?.value || '')}
                            components={{ Option: makeSelectOption('deals.bulk.assignSelect') }}
                            {...qa('deals.bulk.assignSelect')}
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        loading={submitting}
                        disabled={!assigneeId}
                        onClick={handleBulkAssign}
                        {...qa('deals.bulk.assignConfirm')}
                    >
                        Применить
                    </Button>
                    <Button size="sm" variant="plain" onClick={() => setMode(null)}>
                        Отмена
                    </Button>
                </div>
            )}

            {mode === 'stage' && (
                <div className="flex items-center gap-2">
                    <div className="w-[220px]">
                        <Select
                            placeholder="Целевая стадия"
                            options={stageOptions}
                            value={stageOptions.find((o) => o.value === stageId) || null}
                            onChange={(opt) => setStageId(opt?.value || '')}
                            components={{ Option: makeSelectOption('deals.bulk.stageSelect') }}
                            {...qa('deals.bulk.stageSelect')}
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        loading={submitting}
                        disabled={!stageId}
                        onClick={handleBulkMove}
                        {...qa('deals.bulk.moveConfirm')}
                    >
                        Применить
                    </Button>
                    <Button size="sm" variant="plain" onClick={() => setMode(null)}>
                        Отмена
                    </Button>
                </div>
            )}
        </div>
    )
}

export default BulkPanel
