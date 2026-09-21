import { useState } from 'react'
import dayjs from 'dayjs'
import { PiGitMergeDuotone, PiArrowCounterClockwiseDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { apiUnmergeContact } from '@/services/CrmService'
import type { Contact, MergedSource } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'

/**
 * TODO-161 (FR-CONTACTS-260) — «Отменить слияние».
 *
 * Единственная точка входа в откат: тень слияния не видна ни в списке, ни в
 * корзине (TODO-175 её оттуда убрал), поэтому id донора пользователю взять
 * неоткуда. Домен отдаёт доноров в карточке мастера (GET /v1/contacts/:id →
 * `merged_sources`), здесь они показываются вместе с оставшимся сроком отката.
 */
type Props = {
    /** Доноры, слитые в этот контакт (только те, по которым окно ещё открыто). */
    sources: MergedSource[]
    projectId?: string
    /** Шлюз требует contacts:manage — та же операция, что merge (DECISIONS). */
    canUnmerge: boolean
    onUnmerged: (restored: Contact | undefined, sourceId: string) => void
}

const sourceName = (s: MergedSource) =>
    `${s.lastName ?? ''} ${s.firstName ?? ''} ${s.middleName ?? ''}`.trim() || 'Без имени'

/** Сколько ещё можно откатывать. Пусто — срок неизвестен (легаси-слияние). */
const deadlineLabel = (unmergeUntil?: number): string => {
    if (!unmergeUntil) return 'срок не ограничен'
    const days = dayjs.unix(unmergeUntil).diff(dayjs(), 'day')
    if (days < 0) return 'срок отката истёк'
    if (days === 0) return 'откат доступен только сегодня'
    return `откат доступен ещё ${days} дн.`
}

const ContactMergedSourcesWidget = ({ sources, projectId, canUnmerge, onUnmerged }: Props) => {
    const [confirming, setConfirming] = useState<MergedSource | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)

    const doUnmerge = async (source: MergedSource) => {
        if (!projectId) return
        setBusyId(source.id)
        try {
            const restored = await apiUnmergeContact<Contact>(source.id, { projectId })
            notifySuccess(`Слияние отменено: «${sourceName(source)}» снова отдельный контакт`)
            setConfirming(null)
            onUnmerged(restored, source.id)
        } catch (err) {
            // 409 unmerge_expired приходит с осмысленным текстом домена — показываем его.
            const { message } = extractApiError(err)
            notifyError(message)
        } finally {
            setBusyId(null)
        }
    }

    return (
        <Card
            className="w-full border border-gray-200 dark:border-gray-700"
            bodyClass="p-5"
            {...qa('contacts.details.mergedSources')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiGitMergeDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Слитые контакты</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <p className="text-sm text-gray-500 mb-3">
                Эти контакты объединены с текущим. Слияние можно отменить в течение 30 дней.
            </p>
            <ul className="flex flex-col gap-2">
                {sources.map((s) => (
                    <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2"
                    >
                        <div className="min-w-0">
                            <div className="font-medium truncate">{sourceName(s)}</div>
                            <div className="text-xs text-gray-500 truncate">
                                {[s.email, s.phone].filter(Boolean).join(' · ') || '—'}
                            </div>
                            <div className="text-xs text-gray-400">
                                {s.mergedAt
                                    ? `слит ${dayjs.unix(s.mergedAt).format('DD.MM.YYYY HH:mm')} · `
                                    : ''}
                                {deadlineLabel(s.unmergeUntil)}
                            </div>
                        </div>
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<PiArrowCounterClockwiseDuotone />}
                            loading={busyId === s.id}
                            disabled={!canUnmerge || busyId === s.id}
                            title={
                                canUnmerge
                                    ? undefined
                                    : 'Требуется право contacts:manage'
                            }
                            onClick={() => setConfirming(s)}
                            {...qa('contacts.details.unmerge', { source: s.id })}
                        >
                            Отменить слияние
                        </Button>
                    </li>
                ))}
            </ul>

            <Dialog
                isOpen={!!confirming}
                onClose={() => !busyId && setConfirming(null)}
                onRequestClose={() => !busyId && setConfirming(null)}
                {...qa('contacts.details.unmergeDialog')}
            >
                <h5 className="mb-4">Отменить слияние</h5>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Контакт «{confirming ? sourceName(confirming) : ''}» снова станет отдельной
                    записью. Значения полей, перенесённые в текущий контакт при слиянии, останутся
                    у него — при необходимости поправьте их вручную.
                </p>
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button
                        variant="plain"
                        disabled={!!busyId}
                        onClick={() => setConfirming(null)}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={!!busyId}
                        onClick={() => confirming && doUnmerge(confirming)}
                        {...qa('contacts.details.unmergeConfirm')}
                    >
                        Отменить слияние
                    </Button>
                </div>
            </Dialog>
        </Card>
    )
}

export default ContactMergedSourcesWidget
