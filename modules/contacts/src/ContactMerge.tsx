import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import useSWR from 'swr'
import { PiArrowLeftDuotone, PiGitMergeDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import {
    apiGetContact,
    apiGetContactLinks,
    apiMergeContacts,
    newIdempotencyKey,
    type ContactLinks,
} from '@/services/CrmService'
import type { Contact } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'

const fullName = (c?: Contact) =>
    c ? `${c.firstName} ${c.lastName}${c.middleName ? ` ${c.middleName}` : ''}`.trim() : '—'

// Поля, по которым выбирается победитель (survivor_fields, §3.10).
const SURVIVOR_FIELDS: { key: keyof Contact; label: string }[] = [
    { key: 'firstName', label: 'Имя' },
    { key: 'lastName', label: 'Фамилия' },
    { key: 'middleName', label: 'Отчество' },
    { key: 'phone', label: 'Телефон' },
    { key: 'email', label: 'Email' },
    { key: 'position', label: 'Должность' },
]

const linkCount = (links?: ContactLinks): number =>
    links
        ? links.deals.length +
          links.orders.length +
          links.activities.length +
          links.documents.length +
          links.companies.length
        : 0

const ContactMerge = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const [params] = useSearchParams()
    const can = usePermission()
    const canManage = can('contacts', 'manage')
    // TODO-370: экран не только сливает (contacts:manage), но и ЧИТАЕТ обе карточки
    // и их связи — GET /v1/contacts/:id и /:id/links требуют contacts:read.
    const canRead = can('contacts', 'read')

    const sourceId = params.get('source') || ''
    const targetId = params.get('target') || ''

    // Master по умолчанию = target (OQ-MCON-3 / EL-MRG-1).
    const [masterId, setMasterId] = useState<string>(targetId)
    // survivorFields[field] = 'source' | 'target'.
    const [survivor, setSurvivor] = useState<Record<string, 'source' | 'target'>>({})
    const [merging, setMerging] = useState(false)

    const {
        data: source,
        isLoading: loadingSource,
        error: errSource,
        mutate: mutateSource,
    } = useSWR(
        sourceId && pid && canRead ? [`/v1/contacts/${sourceId}`, 'merge', pid] : null,
        () => apiGetContact<Contact>(sourceId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const {
        data: target,
        isLoading: loadingTarget,
        error: errTarget,
        mutate: mutateTarget,
    } = useSWR(
        targetId && pid && canRead ? [`/v1/contacts/${targetId}`, 'merge', pid] : null,
        () => apiGetContact<Contact>(targetId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const { data: sourceLinks } = useSWR(
        sourceId && pid && canRead ? [`/v1/contacts/${sourceId}/links`, pid] : null,
        () => apiGetContactLinks(sourceId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const { data: targetLinks } = useSWR(
        targetId && pid && canRead ? [`/v1/contacts/${targetId}/links`, pid] : null,
        () => apiGetContactLinks(targetId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const masterContact = masterId === sourceId ? source : target
    const slaveContact = masterId === sourceId ? target : source

    const survivorFieldsPayload = useMemo(() => {
        // Реальный survivor: какие поля master взять из source.
        const out: Record<string, string> = {}
        for (const f of SURVIVOR_FIELDS) {
            const pick = survivor[f.key as string]
            if (pick === 'source' && masterId !== sourceId) out[f.key as string] = 'source'
            if (pick === 'target' && masterId === sourceId) out[f.key as string] = 'source'
        }
        return out
    }, [survivor, masterId, sourceId])

    /**
     * TODO-176: merge разрушающий — повторный POST после таймаута/двойного клика
     * не должен сливать второй раз. Ключ привязан к самому плану слияния
     * (кто в кого + какие поля выживают): пока план тот же, повтор переиспользует
     * ключ и домен реиграет первый ответ; изменил план — это другая операция,
     * ключ новый. Живёт до успеха.
     */
    const mergeKeyRef = useRef<{ sig: string; key: string } | null>(null)

    const handleMerge = async () => {
        if (!pid || !source || !target) return
        const realSourceId = masterId === sourceId ? targetId : sourceId
        const realTargetId = masterId
        const sig = `${pid}|${realSourceId}|${realTargetId}|${JSON.stringify(survivorFieldsPayload)}`
        if (mergeKeyRef.current?.sig !== sig) {
            mergeKeyRef.current = { sig, key: newIdempotencyKey() }
        }
        const idempotencyKey = mergeKeyRef.current.key
        setMerging(true)
        try {
            const master = await apiMergeContacts(
                {
                    sourceId: realSourceId,
                    targetId: realTargetId,
                    survivorFields: survivorFieldsPayload,
                },
                { projectId: pid },
                idempotencyKey,
            )
            mergeKeyRef.current = null
            notifySuccess('Контакты слиты')
            navigate(`/contacts/${master?.id ?? realTargetId}`)
        } catch (err) {
            const { message } = extractApiError(err)
            notifyError(message)
        } finally {
            setMerging(false)
        }
    }

    const loading = loadingSource || loadingTarget
    const err = errSource || errTarget

    // ST-10 No-permission (TODO-370): без contacts:read обе карточки не читаются.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Слияние недоступно</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Нужно право на просмотр контактов (contacts:read)
                        </p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            К контактам
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-10 No-permission → fallback «запросить слияние» (FR-MCON-10/M6).
    if (!canManage) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Слияние требует роли Manager</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Запросите слияние у руководителя
                        </p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate(-1)}>
                            Назад
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // Невалидные параметры.
    if (!sourceId || !targetId || sourceId === targetId) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Не выбраны два разных контакта для слияния</p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            К контактам
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => navigate(-1)}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3
                        className="text-2xl font-bold flex items-center gap-2"
                        {...qa('contacts.merge.heading')}
                    >
                        <PiGitMergeDuotone className="w-6 h-6 text-gray-500" /> Слияние дублей
                    </h3>
                </div>

                {loading ? (
                    // ST-1 Loading.
                    <AdaptiveCard>
                        <Loading loading={true} />
                    </AdaptiveCard>
                ) : err || !source || !target ? (
                    // ST-6/ST-9 Error / not found + retry.
                    <AdaptiveCard>
                        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">
                                Один из контактов недоступен или не найден
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="solid"
                                    onClick={() => {
                                        mutateSource()
                                        mutateTarget()
                                    }}
                                    {...qa('contacts.merge.retry')}
                                >
                                    Повторить
                                </Button>
                                <Button variant="plain" onClick={() => navigate('/contacts')}>
                                    К списку
                                </Button>
                            </div>
                        </div>
                    </AdaptiveCard>
                ) : (
                    <>
                        {/* EL-MRG-1: выбор master. */}
                        <AdaptiveCard>
                            <h4 className="mb-3 font-semibold">Какую запись оставить (master)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                    { c: source, id: sourceId, tag: 'Контакт A' },
                                    { c: target, id: targetId, tag: 'Контакт B' },
                                ].map(({ c, id, tag }) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setMasterId(id)}
                                        className={`text-left rounded-lg border p-3 transition-colors ${
                                            masterId === id
                                                ? 'border-primary ring-1 ring-primary bg-primary/5'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                        {...qa('contacts.merge.master', { contact: id })}
                                    >
                                        <div className="text-xs text-gray-400">{tag}</div>
                                        <div className="font-medium">{fullName(c)}</div>
                                        <div className="text-sm text-gray-500">
                                            {c.email || '—'} · {c.phone || '—'}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </AdaptiveCard>

                        {/* EL-MRG-2: поля-победители. */}
                        <AdaptiveCard>
                            <h4 className="mb-3 font-semibold">Значения полей</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                            <th className="py-2 px-3">Поле</th>
                                            <th className="py-2 px-3">Контакт A</th>
                                            <th className="py-2 px-3">Контакт B</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SURVIVOR_FIELDS.map((f) => {
                                            const a = (source[f.key] as string) || '—'
                                            const b = (target[f.key] as string) || '—'
                                            const differ = a !== b
                                            const pick = survivor[f.key as string]
                                            const masterIsTarget = masterId === targetId
                                            // По умолчанию подсвечиваем значение master.
                                            const aActive = differ
                                                ? pick === 'source'
                                                    ? true
                                                    : pick === 'target'
                                                      ? false
                                                      : !masterIsTarget
                                                : true
                                            const bActive = differ ? !aActive : true
                                            return (
                                                <tr
                                                    key={f.key as string}
                                                    className="border-b border-gray-100 dark:border-gray-800"
                                                >
                                                    <td className="py-2 px-3 text-gray-500">
                                                        {f.label}
                                                    </td>
                                                    <td
                                                        className={`py-2 px-3 ${differ ? 'cursor-pointer' : ''} ${aActive && differ ? 'font-medium text-primary' : ''}`}
                                                        onClick={() =>
                                                            differ &&
                                                            setSurvivor((p) => ({
                                                                ...p,
                                                                [f.key as string]: 'source',
                                                            }))
                                                        }
                                                        {...(differ
                                                            ? qa('contacts.merge.survivor', {
                                                                  field: String(f.key),
                                                                  side: 'a',
                                                              })
                                                            : {})}
                                                    >
                                                        {a}
                                                    </td>
                                                    <td
                                                        className={`py-2 px-3 ${differ ? 'cursor-pointer' : ''} ${bActive && differ ? 'font-medium text-primary' : ''}`}
                                                        onClick={() =>
                                                            differ &&
                                                            setSurvivor((p) => ({
                                                                ...p,
                                                                [f.key as string]: 'target',
                                                            }))
                                                        }
                                                        {...(differ
                                                            ? qa('contacts.merge.survivor', {
                                                                  field: String(f.key),
                                                                  side: 'b',
                                                              })
                                                            : {})}
                                                    >
                                                        {b}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </AdaptiveCard>

                        {/* EL-MRG-3: Preview связей «что переедет». */}
                        <AdaptiveCard>
                            <h4 className="mb-2 font-semibold">Что переедет в master</h4>
                            <p className="text-sm text-gray-500" {...qa('contacts.merge.preview')}>
                                Связи присоединяемой записи (
                                {linkCount(masterId === sourceId ? targetLinks : sourceLinks)}):
                                сделки, продажи, активности, документы и компании будут
                                перенаправлены на «{fullName(masterContact)}». Запись «
                                {fullName(slaveContact)}» отправится в архив слияния (откат доступен
                                30 дней).
                            </p>
                        </AdaptiveCard>

                        <div className="flex justify-end gap-2">
                            <Button variant="plain" disabled={merging} onClick={() => navigate(-1)}>
                                Отмена
                            </Button>
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiGitMergeDuotone />}
                                loading={merging}
                                disabled={merging}
                                onClick={handleMerge}
                                {...qa('contacts.merge.submit')}
                            >
                                Слить
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Container>
    )
}

export default ContactMerge
