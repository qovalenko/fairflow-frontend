import { useMemo, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { apiReopenDeal } from '@/services/CrmService'
import type { Deal, Pipeline } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

type Props = {
    deal: Deal
    /** Pipeline of the deal — used to offer active target stages. */
    pipeline?: Pipeline | null
    isOpen: boolean
    onClose: () => void
    onReopened: (deal: Deal) => void
}

/**
 * SCR-DEALS-REOPEN-DIALOG — reopen a closed deal onto an active stage.
 * Manager+ only (pipe contract §10 → 403 PERMISSION_DENIED otherwise).
 * `reason` and an active `targetStageId` are required (→ 422 otherwise).
 */
const ReopenDealDialog = ({ deal, pipeline, isOpen, onClose, onReopened }: Props) => {
    const [reason, setReason] = useState('')
    const [targetStageId, setTargetStageId] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // Only active stages are valid reopen targets (won/lost are terminal).
    const stageOptions = useMemo(() => {
        if (!pipeline) return []
        return pipeline.stages
            .filter((s) => {
                const kind = (s as { kind?: string }).kind
                return !kind || kind === 'active'
            })
            .map((s) => ({ value: s.id, label: s.name }))
    }, [pipeline])

    const canSubmit = !submitting && reason.trim().length > 0 && !!targetStageId

    const handleConfirm = async () => {
        setSubmitting(true)
        try {
            const updated = await apiReopenDeal<Deal>(deal.id, {
                reason: reason.trim(),
                targetStageId,
            })
            notifySuccess('Сделка переоткрыта')
            onReopened(updated ?? { ...deal, status: 'open' })
            onClose()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось переоткрыть сделку'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} {...qa('deals.reopen.dialog')}>
            <h5 className="mb-4">Переоткрыть сделку</h5>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
                Сделка вернётся в работу на выбранную активную стадию. Действие доступно
                руководителю.
            </p>
            <div className="flex flex-col gap-3">
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Причина <span className="text-red-500">*</span>
                    </label>
                    <Input
                        textArea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Почему сделка переоткрывается"
                        {...qa('deals.reopen.reason')}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Стадия <span className="text-red-500">*</span>
                    </label>
                    <Select
                        placeholder="Выберите активную стадию"
                        options={stageOptions}
                        value={stageOptions.find((o) => o.value === targetStageId) || null}
                        onChange={(opt) => setTargetStageId(opt?.value || '')}
                        components={{ Option: makeSelectOption('deals.reopen.stage') }}
                        {...qa('deals.reopen.stage')}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
                <Button variant="plain" onClick={onClose} disabled={submitting}>
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={submitting}
                    disabled={!canSubmit}
                    onClick={handleConfirm}
                    {...qa('deals.reopen.submit')}
                >
                    Переоткрыть
                </Button>
            </div>
        </Dialog>
    )
}

export default ReopenDealDialog
