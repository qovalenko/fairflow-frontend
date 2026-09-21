import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import {
    PiArrowLeftDuotone,
    PiWarningCircleDuotone,
    PiArrowsMergeDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Loading from '@/components/shared/Loading'
import Button from '@/components/ui/Button'
import Radio from '@/components/ui/Radio'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiGetCompany,
    apiPreviewCompanyMerge,
    apiMergeCompanies,
    type CompanyMergePreview,
} from '@/services/CrmService'
import type { Company } from '@/@types/crm'
import { qa } from '../../../qa'

const FIELD_LABELS: Record<string, string> = {
    name: 'Название',
    inn: 'ИНН',
    kpp: 'КПП',
    ogrn: 'ОГРН',
    phone: 'Телефон',
    email: 'Email',
    website: 'Веб-сайт',
    industry: 'Отрасль',
    legalAddress: 'Юридический адрес',
    actualAddress: 'Фактический адрес',
}

const RELATION_LABELS: { key: keyof CompanyMergePreview['relations']; label: string }[] = [
    { key: 'contacts', label: 'Контакты' },
    { key: 'deals', label: 'Сделки' },
    { key: 'orders', label: 'Продажи' },
    { key: 'activities', label: 'Активности' },
    { key: 'documents', label: 'Документы' },
]

const CompanyMerge = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    // Право на объединение — то же, что проверяет gateway: companies:manage
    // (@RequirePermission('companies','manage') на merge/preview и merge, TODO-153).
    // Ключа companies:execute в каталоге прав нет, как и субъекта 'companies.merge',
    // поэтому оба прежних варианта давали deny у любой роли.
    const canMerge = can('companies', 'manage')

    const masterId = searchParams.get('master') || ''
    const loserId = searchParams.get('loser') || ''

    const sameRecord = !!masterId && masterId === loserId

    // field_decisions: field -> 'master' | 'loser' (default master)
    const [decisions, setDecisions] = useState<Record<string, 'master' | 'loser'>>({})
    const [merging, setMerging] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const enabled = !!pid && !!masterId && !!loserId && !sameRecord && canMerge

    const { data: master, isLoading: masterLoading, error: masterError } = useSWR(
        enabled ? [`/v1/companies/${masterId}`, masterId, pid] : null,
        () => apiGetCompany<Company>(masterId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const { data: loser, isLoading: loserLoading, error: loserError } = useSWR(
        enabled ? [`/v1/companies/${loserId}`, loserId, pid] : null,
        () => apiGetCompany<Company>(loserId, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const {
        data: preview,
        isLoading: previewLoading,
        error: previewError,
    } = useSWR(
        enabled ? ['/v1/companies/merge/preview', masterId, loserId, pid] : null,
        () => apiPreviewCompanyMerge({ masterId, loserId }, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const conflicts = preview?.fieldConflicts ?? []

    useEffect(() => {
        // По умолчанию все конфликты разрешаются в пользу master.
        if (conflicts.length) {
            setDecisions((prev) => {
                const next = { ...prev }
                for (const c of conflicts) {
                    if (!(c.field in next)) next[c.field] = 'master'
                }
                return next
            })
        }
    }, [conflicts])

    const relations = preview?.relations ?? {}

    const previewReady = !!preview && !previewError

    const handleMerge = async () => {
        if (!enabled) return
        setMerging(true)
        try {
            await apiMergeCompanies(
                { masterId, loserId, fieldDecisions: decisions },
                { projectId: pid! },
            )
            toast.push('Компании объединены')
            // инвалидация списка/карточек обеих записей
            mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, {
                revalidate: true,
            })
            mutate([`/v1/companies/${masterId}`, masterId, pid])
            mutate([`/v1/companies/${loserId}`, loserId, pid])
            setConfirmOpen(false)
            navigate(`/companies/${masterId}`)
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            toast.push(err?.response?.data?.error?.message ?? 'Не удалось объединить компании')
        } finally {
            setMerging(false)
        }
    }

    const masterName = master?.name ?? masterId
    const loserName = loser?.name ?? loserId

    const loadError = masterError || loserError

    // ── ST-10/12: нет права на merge ──
    if (!canMerge) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.merge.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Раздел недоступен</h4>
                        <p className="text-gray-500">У вас нет права на слияние компаний.</p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ── валидация параметров: master/loser обязательны и различны (VAL-MCOM-7) ──
    if (!masterId || !loserId) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.merge.noSelection')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-amber-400" />
                        <h4>Не выбраны компании</h4>
                        <p className="text-gray-500">
                            Чтобы объединить дубли, выберите две компании в списке и нажмите «Объединить».
                        </p>
                        <Button variant="solid" color="primary" onClick={() => navigate('/companies')}>
                            К списку компаний
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    if (sameRecord) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.merge.sameRecord')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-amber-400" />
                        <h4>Нельзя объединить компанию саму с собой</h4>
                        <p className="text-gray-500">Master и loser должны быть разными записями (VAL-MCOM-7).</p>
                        <Button variant="solid" color="primary" onClick={() => navigate('/companies')}>
                            К списку компаний
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ── ST-1: загрузка записей/preview ──
    if (masterLoading || loserLoading || previewLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ── ST-9: одна из записей не найдена/не видна ──
    if (loadError || !master || !loser) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.merge.unavailable')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Одна из компаний недоступна</h4>
                        <p className="text-gray-500">
                            Запись удалена, уже слита или вне зоны видимости. Слияние невозможно.
                        </p>
                        <Button variant="solid" color="primary" onClick={() => navigate('/companies')}>
                            К списку компаний
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
                        {...qa('companies.merge.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3>Объединение дублей</h3>
                </div>

                {/* master / loser */}
                <AdaptiveCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-4"
                            {...qa('companies.merge.master', { company: masterId })}
                        >
                            <div className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-semibold">
                                Основная (master) — останется
                            </div>
                            <div className="text-lg font-semibold mt-1">{masterName}</div>
                            {master.inn && <div className="text-sm text-gray-500">ИНН {master.inn}</div>}
                        </div>
                        <div
                            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-4"
                            {...qa('companies.merge.loser', { company: loserId })}
                        >
                            <div className="text-xs uppercase text-gray-500 font-semibold">
                                Дубль (loser) — будет поглощён
                            </div>
                            <div className="text-lg font-semibold mt-1">{loserName}</div>
                            {loser.inn && <div className="text-sm text-gray-500">ИНН {loser.inn}</div>}
                        </div>
                    </div>
                </AdaptiveCard>

                {/* ST-6: ошибка построения preview (счётчики/конфликты) */}
                {previewError && (
                    <AdaptiveCard className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                        <div
                            className="flex items-center gap-2 text-amber-700 dark:text-amber-400"
                            {...qa('companies.merge.previewError')}
                        >
                            <PiWarningCircleDuotone className="w-5 h-5" />
                            <span>
                                Не удалось построить превью слияния. Объединение по умолчанию возьмёт значения
                                основной компании.
                            </span>
                        </div>
                    </AdaptiveCard>
                )}

                {/* Счётчики связей */}
                {previewReady && (
                    <AdaptiveCard>
                        <h5 className="mb-3" {...qa('companies.merge.preview')}>
                            Что переедет к основной компании
                        </h5>
                        <div className="flex flex-wrap gap-3">
                            {RELATION_LABELS.map(({ key, label }) => (
                                <div
                                    key={key}
                                    className="rounded-lg bg-gray-100 dark:bg-gray-800 px-4 py-2 text-center min-w-[100px]"
                                    {...qa('companies.merge.relationCount', { relation: key })}
                                >
                                    <div className="text-xl font-semibold">{relations[key] ?? 0}</div>
                                    <div className="text-xs text-gray-500">{label}</div>
                                </div>
                            ))}
                        </div>
                    </AdaptiveCard>
                )}

                {/* Разрешение конфликтов полей (field_decisions) */}
                {conflicts.length > 0 && (
                    <AdaptiveCard>
                        <h5 className="mb-3">Конфликты полей — выберите значение</h5>
                        <div className="flex flex-col gap-4">
                            {conflicts.map((c) => (
                                <div
                                    key={c.field}
                                    className="border-b border-gray-100 dark:border-gray-700 pb-3"
                                    {...qa('companies.merge.conflict', { field: c.field })}
                                >
                                    <div className="text-sm font-medium mb-2">
                                        {FIELD_LABELS[c.field] ?? c.field}
                                    </div>
                                    <Radio.Group
                                        value={decisions[c.field] ?? 'master'}
                                        onChange={(val) =>
                                            setDecisions((prev) => ({
                                                ...prev,
                                                [c.field]: val as 'master' | 'loser',
                                            }))
                                        }
                                    >
                                        <Radio
                                            value="master"
                                            {...qa('companies.merge.conflictMaster', {
                                                field: c.field,
                                            })}
                                        >
                                            Основная: <b>{c.master ?? '—'}</b>
                                        </Radio>
                                        <Radio
                                            value="loser"
                                            {...qa('companies.merge.conflictLoser', {
                                                field: c.field,
                                            })}
                                        >
                                            Дубль: <b>{c.loser ?? '—'}</b>
                                        </Radio>
                                    </Radio.Group>
                                </div>
                            ))}
                        </div>
                    </AdaptiveCard>
                )}

                {/* ST-25: предупреждение о снимках drift */}
                <p className="text-xs text-gray-400" {...qa('companies.merge.disclaimer')}>
                    Снимки реквизитов на ранее оформленных продажах не перезаписываются. Пересвязка контактов,
                    сделок и продаж выполняется потребителями асинхронно после слияния.
                </p>

                <div className="flex justify-end gap-3">
                    <Button
                        variant="plain"
                        onClick={() => navigate(-1)}
                        disabled={merging}
                        {...qa('companies.merge.cancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        icon={<PiArrowsMergeDuotone />}
                        onClick={() => setConfirmOpen(true)}
                        disabled={merging}
                        {...qa('companies.merge.submit')}
                    >
                        Объединить
                    </Button>
                </div>
            </div>

            {/* DLG-COMPANIES-MERGE-PREVIEW → confirm */}
            <Dialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onRequestClose={() => setConfirmOpen(false)}
            >
                <h5 className="mb-2" {...qa('companies.merge.confirmDialog')}>
                    Подтвердите объединение
                </h5>
                <p className="text-gray-500">
                    «{loserName}» будет поглощена компанией «{masterName}». Операция обратима в течение 30 дней
                    (откат доступен администратору).
                </p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setConfirmOpen(false)}
                        disabled={merging}
                        {...qa('companies.merge.confirmCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={handleMerge}
                        loading={merging}
                        {...qa('companies.merge.confirmSubmit')}
                    >
                        Объединить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default CompanyMerge
