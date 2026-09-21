import { useState } from 'react'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiArrowRightDuotone, PiWarningDuotone } from 'react-icons/pi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { apiGetDealDrift, apiAcceptDealDrift } from '@/services/CrmService'
import type { Deal, DealDrift } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'

type Props = {
    deal: Deal
    isOpen: boolean
    onClose: () => void
    /** Called with the updated deal after the snapshot is refreshed. */
    onAccepted: (deal: Deal) => void
}

const fieldLabels: Record<string, string> = {
    phone: 'Телефон',
    email: 'Email',
    name: 'Имя',
    firstName: 'Имя',
    lastName: 'Фамилия',
    companyName: 'Компания',
    inn: 'ИНН',
    domain: 'Домен',
}

/**
 * SCR-DEALS-DRIFT-PANEL — shows snapshot↔source divergence for the linked
 * contact/company (pipe contract §4 `GetDealDrift`) and lets the user accept
 * the changes (§13 `AcceptContactDrift`). Drift is soft — it never blocks
 * other operations (FR-MDEAL-30).
 */
const DriftPanel = ({ deal, isOpen, onClose, onAccepted }: Props) => {
    const pid = useCurrentProjectId()
    const [accepting, setAccepting] = useState(false)

    const { data, isLoading, error, mutate } = useSWR(
        isOpen ? [`/api/v1/deals/${deal.id}/drift`, deal.id, pid] : null,
        () => apiGetDealDrift<DealDrift>(deal.id, pid),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const drift = data?.drift ?? []
    const sourceDeleted = data?.sourceDeleted

    const handleAccept = async () => {
        setAccepting(true)
        try {
            const updated = await apiAcceptDealDrift<Deal>(deal.id)
            notifySuccess('Изменения приняты, снимок обновлён')
            onAccepted(updated ?? { ...deal, driftFlag: false })
            onClose()
        } catch (err) {
            // 409 no active drift; 403.
            notifyError(extractError(err, 'Не удалось принять изменения'))
        } finally {
            setAccepting(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} width={600} {...qa('deals.drift.dialog')}>
            <div className="flex items-center gap-2 mb-1">
                <PiWarningDuotone className="w-5 h-5 text-amber-500" />
                <h5>Изменения привязанного контакта</h5>
            </div>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Данные источника изменились после привязки. Сравните и примите изменения, чтобы обновить снимок сделки.
            </p>

            {isLoading && <Loading loading={true} />}

            {!isLoading && error && (
                <div className="text-center py-6" {...qa('deals.drift.error')}>
                    <p className="text-sm text-gray-500 mb-3">Не удалось загрузить изменения</p>
                    <Button size="sm" variant="default" onClick={() => mutate()} {...qa('deals.drift.errorRetry')}>
                        Повторить
                    </Button>
                </div>
            )}

            {!isLoading && !error && sourceDeleted && (
                <div
                    className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                    {...qa('deals.drift.sourceDeleted')}
                >
                    Привязанный контакт/компания удалён. Принять изменения нельзя — отвяжите источник через редактирование сделки.
                </div>
            )}

            {!isLoading && !error && !sourceDeleted && drift.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-500" {...qa('deals.drift.noDiff')}>
                    Расхождений нет — снимок актуален.
                </div>
            )}

            {!isLoading && !error && !sourceDeleted && drift.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                    {drift.map((d) => (
                        <div
                            key={d.field}
                            className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2"
                        >
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                                {fieldLabels[d.field] || d.field}
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="line-through text-gray-400 truncate">{d.snapshotValue ?? '—'}</span>
                                <PiArrowRightDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="font-medium text-gray-800 dark:text-gray-100 truncate">
                                    {d.currentValue ?? '—'}
                                </span>
                            </div>
                            {(d.changedBy || d.changedAt) && (
                                <div className="text-xs text-gray-400 mt-1">
                                    {d.changedBy && <>Изменил: {d.changedBy} </>}
                                    {d.changedAt && <>· {dayjs(d.changedAt).format('DD.MM.YYYY HH:mm')}</>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
                <Button variant="plain" onClick={onClose} disabled={accepting} {...qa('deals.drift.defer')}>
                    Отложить
                </Button>
                {!sourceDeleted && drift.length > 0 && (
                    <Button variant="solid" color="primary" loading={accepting} onClick={handleAccept} {...qa('deals.drift.accept')}>
                        Принять изменения
                    </Button>
                )}
            </div>
        </Dialog>
    )
}

export default DriftPanel
