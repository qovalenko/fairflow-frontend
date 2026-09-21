import { useState } from 'react'
import { PiFlaskDuotone } from 'react-icons/pi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import { apiDryRun, type DryRunResult } from '@/services/AutomationService'
import { ErrorState, errMessage } from './shared'
import { qa } from './qa'

/**
 * SCR-AUTOMATION-DRYRUN — overlay над FORM. Прогон без внешних эффектов.
 * FR-MAUT-37. Право automation:execute (гейтится на FORM, EL-FORM-12).
 */
const DryRunOverlay = ({
    isOpen,
    onClose,
    ruleId,
    projectId,
    hasExternalEffect,
}: {
    isOpen: boolean
    onClose: () => void
    ruleId: string
    projectId: string
    hasExternalEffect: boolean
}) => {
    const [lastN, setLastN] = useState('10')
    const [running, setRunning] = useState(false)
    const [results, setResults] = useState<DryRunResult[] | null>(null)
    const [error, setError] = useState<unknown>(null)

    const run = async () => {
        setRunning(true)
        setError(null)
        setResults(null)
        try {
            const res = await apiDryRun(
                ruleId,
                { lastN: Number(lastN) || 10 },
                { projectId },
            )
            setResults(res.results)
        } catch (e) {
            setError(e)
        } finally {
            setRunning(false)
        }
    }

    const close = () => {
        setResults(null)
        setError(null)
        onClose()
    }

    return (
        <Dialog isOpen={isOpen} onClose={close} onRequestClose={close} width={560}>
            <div {...qa('automation.dryRun.overlay')}>
            <h5 className="mb-1 flex items-center gap-2">
                <PiFlaskDuotone /> Тест правила (dry-run)
            </h5>
            <p className="text-sm text-gray-500 mb-4">
                Прогон на последних событиях без реальных внешних эффектов —
                webhook и email не отправляются.
            </p>

            {hasExternalEffect && (
                <p className="text-xs text-purple-600 mb-3" {...qa('automation.dryRun.externalWarning')}>
                    Действия с внешним эффектом будут показаны как «выполнились
                    бы», но не запустятся.
                </p>
            )}

            <div className="flex items-end gap-2 mb-4">
                <div className="w-40">
                    <label className="block text-sm font-medium mb-1">
                        Последних событий
                    </label>
                    <Input
                        type="number"
                        value={lastN}
                        onChange={(e) => setLastN(e.target.value)}
                        {...qa('automation.dryRun.lastN')}
                    />
                </div>
                <Button
                    variant="solid"
                    color="primary"
                    loading={running}
                    onClick={run}
                    {...qa('automation.dryRun.run')}
                >
                    Прогнать
                </Button>
            </div>

            {/* ST-26: прогон в процессе */}
            {running && (
                <div className="flex items-center gap-2 text-gray-500 py-4">
                    <Spinner /> Выполняется прогон…
                </div>
            )}

            {/* ST-6: ошибка прогона */}
            {!running && error != null && (
                <ErrorState
                    message={errMessage(error, 'Не удалось выполнить прогон')}
                    onRetry={run}
                />
            )}

            {/* ST-3: нет образцов */}
            {!running && error == null && results?.length === 0 && (
                <p className="text-center text-gray-500 py-6" {...qa('automation.dryRun.empty')}>
                    Нет образцов событий для прогона.
                </p>
            )}

            {/* ST-29: результат */}
            {!running && results && results.length > 0 && (
                <div className="space-y-2 max-h-80 overflow-y-auto" {...qa('automation.dryRun.results')}>
                    {results.map((r, i) => (
                        <div
                            key={i}
                            className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-medium text-sm">
                                    {r.eventName}
                                </span>
                                <Tag
                                    className={
                                        r.matched && r.conditionsPassed
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                    }
                                >
                                    {r.matched && r.conditionsPassed
                                        ? 'Сматчилось'
                                        : r.matched
                                          ? 'Условия не выполнены'
                                          : 'Не подходит'}
                                </Tag>
                            </div>
                            {r.actions.length > 0 && (
                                <ul className="text-xs text-gray-500 list-disc ml-4">
                                    {r.actions.map((a, j) => (
                                        <li key={j}>
                                            {a.type} —{' '}
                                            {a.wouldRun
                                                ? 'выполнилось бы'
                                                : `пропуск${a.reason ? ` (${a.reason})` : ''}`}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-end mt-4">
                <Button variant="plain" onClick={close} {...qa('automation.dryRun.close')}>
                    Закрыть
                </Button>
            </div>
            </div>
        </Dialog>
    )
}

export default DryRunOverlay
