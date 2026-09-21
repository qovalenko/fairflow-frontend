import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiFindCompanyDuplicates,
    apiFindContactDuplicates,
    apiQualifyDeal,
    apiRestoreCompany,
    apiRestoreContact,
} from '@/services/CrmService'
import type { DuplicateCandidate } from '@/services/CrmService'
import type { Deal } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'
import {
    COMPANY_MATCH_LABELS,
    TRASH_DUPLICATE_HINT,
    type CompanyDupCandidate,
} from './qualifyDealDuplicates'

type Props = {
    deal: Deal
    isOpen: boolean
    onClose: () => void
    /** Called with the updated deal after qualification (link or create). */
    onQualified: (deal: Deal) => void
}

/**
 * SCR-DEALS-QUALIFY-DIALOG — turn a light deal lead into a real contact.
 *
 * Soft dedup (FR-MDEAL-2/3/4, FR-DEALS-040): we look up candidate duplicates by
 * phone/email and by company name (including the trash) and let the user either
 * link an existing contact, create a brand-new one, or restore a trashed candidate.
 */
const QualifyDealDialog = ({ deal, isOpen, onClose, onQualified }: Props) => {
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canReadCompanies = can('companies', 'read')

    const [firstName, setFirstName] = useState(deal.lightName ?? deal.contactName ?? '')
    const [phone, setPhone] = useState(deal.lightPhone ?? deal.contactPhone ?? '')
    const [email, setEmail] = useState(deal.lightEmail ?? deal.contactEmail ?? '')
    const [companyName, setCompanyName] = useState(deal.lightCompanyName ?? deal.companyName ?? '')
    const [submitting, setSubmitting] = useState(false)

    const { data: dupData, isLoading: dupLoading } = useSWR(
        isOpen && (phone.trim() || email.trim()) ? ['/api/v1/contacts/duplicates', deal.id, phone, email] : null,
        () =>
            apiFindContactDuplicates({
                projectId: pid,
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const { data: companyDupData, isLoading: companyDupLoading } = useSWR(
        isOpen && canReadCompanies && companyName.trim()
            ? ['/api/v1/companies/duplicates', deal.id, companyName]
            : null,
        () =>
            apiFindCompanyDuplicates<{ candidates: CompanyDupCandidate[] }>({
                projectId: pid,
                name: companyName.trim(),
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const candidates = useMemo<DuplicateCandidate[]>(() => dupData?.candidates ?? [], [dupData])
    const companyCandidates = useMemo<CompanyDupCandidate[]>(
        () => companyDupData?.candidates ?? [],
        [companyDupData],
    )

    const run = async (fn: () => Promise<Deal>, successMsg: string) => {
        setSubmitting(true)
        try {
            const updated = await fn()
            notifySuccess(successMsg)
            onQualified(updated ?? deal)
            onClose()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось квалифицировать сделку'))
        } finally {
            setSubmitting(false)
        }
    }

    const handleLink = (c: DuplicateCandidate) =>
        run(
            () =>
                apiQualifyDeal<Deal>(deal.id, {
                    target: 'contact',
                    contactId: c.contactId,
                }),
            'Контакт привязан к сделке',
        )

    const handleRestoreAndLink = (c: DuplicateCandidate) =>
        run(async () => {
            const restored = await apiRestoreContact(c.contactId, undefined, {
                projectId: pid,
            })
            if (restored?.outcome === 'collision') {
                throw new Error(
                    'Контакт в корзине конфликтует с живой записью — восстановите его в модуле «Контакты»',
                )
            }
            return apiQualifyDeal<Deal>(deal.id, {
                target: 'contact',
                contactId: c.contactId,
            })
        }, 'Контакт восстановлен и привязан к сделке')

    const handleLinkCompany = (c: CompanyDupCandidate) =>
        run(
            () =>
                apiQualifyDeal<Deal>(deal.id, {
                    target: 'company',
                    companyId: c.id,
                }),
            'Компания привязана к сделке',
        )

    const handleRestoreAndLinkCompany = (c: CompanyDupCandidate) =>
        run(async () => {
            await apiRestoreCompany(c.id, undefined, { projectId: pid })
            return apiQualifyDeal<Deal>(deal.id, {
                target: 'company',
                companyId: c.id,
            })
        }, 'Компания восстановлена и привязана к сделке')

    const handleCreate = () => {
        if (!firstName.trim() && !phone.trim() && !email.trim()) {
            notifyError('Укажите имя, телефон или email')
            return
        }
        return run(
            () =>
                apiQualifyDeal<Deal>(deal.id, {
                    target: 'contact',
                    create: {
                        firstName: firstName.trim() || undefined,
                        phone: phone.trim() || undefined,
                        email: email.trim() || undefined,
                    },
                }),
            'Контакт создан и привязан',
        )
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} width={560} {...qa('deals.qualify.dialog')}>
            <h5 className="mb-1">Квалифицировать сделку</h5>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Превратите лёгкий лид в полноценный контакт. Если похожий контакт уже есть — привяжите его, чтобы не плодить дубли.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Имя</label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Иван Иванов" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Телефон</label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 920 123-45-67" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Эл. почта</label>
                    <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@example.com" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Компания (для поиска дублей)</label>
                    <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="ООО Ромашка"
                    />
                </div>
            </div>

            {dupLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <Spinner size={16} /> Поиск похожих контактов…
                </div>
            )}

            {!dupLoading && candidates.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                    <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                        Похожий контакт уже есть. Привязать существующий? Объединение возможно позже в модуле «Контакты».
                    </p>
                    <div className="flex flex-col gap-2">
                        {candidates.map((c) => (
                            <div
                                key={c.contactId}
                                className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-gray-800 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {c.displayName || c.contactId}
                                        {c.deleted ? (
                                            <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                                                {TRASH_DUPLICATE_HINT}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        Совпадение по {c.matchedOn === 'email' ? 'email' : 'телефону'}: {c.maskedValue}
                                    </div>
                                </div>
                                {c.deleted ? (
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        disabled={submitting}
                                        onClick={() => handleRestoreAndLink(c)}
                                        {...qa('deals.qualify.restore', { contact: c.contactId })}
                                    >
                                        Восстановить
                                    </Button>
                                ) : (
                                    <Button size="xs" variant="solid" disabled={submitting} onClick={() => handleLink(c)} {...qa('deals.qualify.link', { contact: c.contactId })}>
                                        Привязать
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {canReadCompanies && companyDupLoading && companyName.trim() && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <Spinner size={16} /> Поиск похожих компаний…
                </div>
            )}

            {canReadCompanies && !companyDupLoading && companyCandidates.length > 0 && (
                <div className="mb-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3">
                    <p className="text-sm text-sky-700 dark:text-sky-300 mb-2">
                        Похожая компания уже есть. Привяжите её или восстановите из корзины.
                    </p>
                    <div className="flex flex-col gap-2">
                        {companyCandidates.map((c) => (
                            <div
                                key={c.id}
                                className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-gray-800 px-3 py-2"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {c.name || c.id}
                                        {c.deleted ? (
                                            <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-300">
                                                {TRASH_DUPLICATE_HINT}
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        Совпадение{' '}
                                        {c.matchReason
                                            ? COMPANY_MATCH_LABELS[c.matchReason] ?? c.matchReason
                                            : 'по названию'}
                                        {c.inn ? ` · ИНН ${c.inn}` : ''}
                                    </div>
                                </div>
                                {c.deleted ? (
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        disabled={submitting}
                                        onClick={() => handleRestoreAndLinkCompany(c)}
                                        {...qa('deals.qualify.companyRestore', { company: c.id })}
                                    >
                                        Восстановить
                                    </Button>
                                ) : (
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        disabled={submitting}
                                        onClick={() => handleLinkCompany(c)}
                                        {...qa('deals.qualify.companyLink', { company: c.id })}
                                    >
                                        Привязать
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
                <Button variant="plain" onClick={onClose} disabled={submitting}>
                    Отмена
                </Button>
                <Button variant="solid" color="primary" loading={submitting} onClick={handleCreate} {...qa('deals.qualify.createContact')}>
                    {candidates.length > 0 ? 'Создать новый всё равно' : 'Создать контакт'}
                </Button>
            </div>
        </Dialog>
    )
}

export default QualifyDealDialog
