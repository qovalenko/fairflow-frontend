import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiArrowLeftDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiGetDeal,
    apiUpdateDeal,
    apiGetPipelines,
    apiGetContacts,
    apiGetCompanies,
    apiGetProducts,
    apiGetDealSources,
    apiGetMembers,
} from '@/services/CrmService'
import type { Deal, Pipeline, Contact, Company, Product, DealSource, ProjectMember } from '@/@types/crm'
import {
    isClosed,
    extractError,
    notifyError,
    notifySuccess,
    buildUpdateDealPayload,
} from './dealUtils'
import type { DealEditForm } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object' && 'list' in value && Array.isArray((value as { list?: unknown }).list)) {
        return (value as { list: T[] }).list
    }
    return []
}

type FormState = DealEditForm

const emptyForm: FormState = {
    name: '',
    amount: '',
    currency: 'RUB',
    pipelineId: '',
    stageId: '',
    contactId: '',
    companyId: '',
    productId: '',
    source: '',
    assigneeId: '',
    expectedCloseDate: '',
    notes: '',
}

/**
 * SCR-DEALS-EDIT — full edit form. Loads the deal by :id and saves via
 * UpdateDeal. Funnel fields are read-only on closed deals (FR-MDEAL-14);
 * notes/tags stay editable. All option sources come from the API.
 */
const DealEdit = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canWrite = can('deals', 'write')

    const { data: deal, isLoading, error } = useSWR(
        id && pid ? [`/api/v1/deals/${id}`, id, pid] : null,
        () => apiGetDeal<Deal>(id!, pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: pipelinesData } = useSWR(['/api/v1/pipelines'], () => apiGetPipelines<Pipeline[]>(), { revalidateOnFocus: false })
    const { data: contactsData } = useSWR(
        pid ? ['/v1/contacts', pid] : null,
        () => apiGetContacts<{ list: Contact[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const { data: companiesData } = useSWR(
        pid ? ['/v1/companies', pid] : null,
        () => apiGetCompanies<{ list: Company[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const { data: productsData } = useSWR(
        pid ? ['/v1/products', pid] : null,
        () => apiGetProducts<{ list: Product[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const { data: sourcesData } = useSWR(['/api/v1/deal-sources'], () => apiGetDealSources<DealSource[]>(), { revalidateOnFocus: false })
    const { data: membersData } = useSWR(['/api/v1/members'], () => apiGetMembers<ProjectMember[]>(), { revalidateOnFocus: false })

    const [form, setForm] = useState<FormState>(emptyForm)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)

    useEffect(() => {
        if (deal) {
            setForm({
                name: deal.name ?? '',
                amount: deal.amount != null ? String(deal.amount) : '',
                currency: deal.currency ?? 'RUB',
                pipelineId: deal.pipelineId ?? '',
                stageId: deal.stageId ?? '',
                contactId: deal.contactId ?? '',
                companyId: deal.companyId ?? '',
                productId: deal.productId ?? '',
                source: deal.source ?? '',
                assigneeId: deal.assigneeId ?? '',
                expectedCloseDate: deal.expectedCloseDate
                    ? dayjs.unix(deal.expectedCloseDate).format('YYYY-MM-DD')
                    : '',
                notes: deal.notes ?? '',
            })
        }
    }, [deal])

    const closed = deal ? isClosed(deal) : false

    const handleChange = (field: keyof FormState, value: string) => {
        setDirty(true)
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    const pipelineOptions = useMemo(() => (pipelinesData ?? []).map((p) => ({ value: p.id, label: p.name })), [pipelinesData])
    const stageOptions = useMemo(() => {
        const p = (pipelinesData ?? []).find((x) => x.id === form.pipelineId)
        return (p?.stages ?? []).map((s) => ({ value: s.id, label: s.name }))
    }, [pipelinesData, form.pipelineId])
    const contactOptions = useMemo(() => (contactsData?.list ?? []).map((c) => ({ value: c.id, label: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.id })), [contactsData])
    const companyOptions = useMemo(() => (companiesData?.list ?? []).map((c) => ({ value: c.id, label: c.name })), [companiesData])
    const productOptions = useMemo(() => (productsData?.list ?? []).map((p) => ({ value: p.id, label: p.name })), [productsData])
    const sourceOptions = useMemo(() => normalizeList<DealSource>(sourcesData).map((s) => ({ value: s.name, label: s.name })), [sourcesData])
    const memberOptions = useMemo(() => normalizeList<ProjectMember>(membersData).map((m) => ({ value: m.id, label: m.name })), [membersData])

    const handleSave = async () => {
        if (!deal) return
        if (!form.name.trim()) {
            notifyError('Укажите название сделки')
            return
        }
        setSaving(true)
        try {
            // TODO-385 + merge-семантика UpdateDeal: отсутствующий ключ не трогается,
            // пустая строка / 0 очищают. Правила снятия связей и даты — в
            // buildUpdateDealPayload (сравнение с исходной сделкой); закрытая сделка —
            // только название и заметки (FR-MDEAL-14).
            const payload = buildUpdateDealPayload(form, deal, closed)
            await apiUpdateDeal<Deal>(deal.id, payload)
            notifySuccess('Сделка сохранена')
            setDirty(false)
            navigate(`/deals/${deal.id}`)
        } catch (err) {
            // 409 DEAL_CLOSED / 422 stage not in pipeline (FR-MDEAL-14/15).
            notifyError(extractError(err, 'Не удалось сохранить сделку'))
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = () => {
        if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Продолжить?')) return
        navigate(-1)
    }

    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    if (error || !deal) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa(error ? 'deals.edit.error' : 'deals.edit.notFound')}>
                        <p className="text-gray-500">
                            {error ? 'Не удалось загрузить сделку' : 'Сделка не найдена'}
                        </p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate(`/deals`)}
                            {...qa('deals.edit.backToList')}
                        >
                            К списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container {...qa('deals.edit.root')}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={handleCancel}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">Редактирование сделки</h3>
                </div>

                {closed && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                        Сделка закрыта — вороночные поля недоступны для изменения. Можно
                        редактировать только название и заметки.
                    </div>
                )}

                <AdaptiveCard>
                    <h5 className="mb-4">Основная информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Название сделки *</label>
                            <Input value={form.name} disabled={!canWrite} onChange={(e) => handleChange('name', e.target.value)} {...qa('deals.edit.name')} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Сумма *</label>
                            <Input
                                type="number"
                                value={form.amount}
                                disabled={!canWrite || closed}
                                onChange={(e) => handleChange('amount', e.target.value)}
                                {...qa('deals.edit.amount')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Воронка и стадия</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Воронка</label>
                            <Select
                                options={pipelineOptions}
                                isDisabled={!canWrite || closed}
                                value={pipelineOptions.find((o) => o.value === form.pipelineId) || null}
                                onChange={(opt) => {
                                    handleChange('pipelineId', opt?.value || '')
                                    handleChange('stageId', '')
                                }}
                                components={{ Option: makeSelectOption('deals.edit.pipeline') }}
                                {...qa('deals.edit.pipeline')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Стадия</label>
                            <Select
                                options={stageOptions}
                                isDisabled={!canWrite || closed}
                                value={stageOptions.find((o) => o.value === form.stageId) || null}
                                onChange={(opt) => handleChange('stageId', opt?.value || '')}
                                components={{ Option: makeSelectOption('deals.edit.stage') }}
                                {...qa('deals.edit.stage')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Связи</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Контакт</label>
                            <Select
                                options={contactOptions}
                                isDisabled={!canWrite || closed}
                                value={contactOptions.find((o) => o.value === form.contactId) || null}
                                onChange={(opt) => handleChange('contactId', opt?.value || '')}
                                placeholder="Поиск контакта..."
                                isClearable
                                components={{ Option: makeSelectOption('deals.edit.contact') }}
                                {...qa('deals.edit.contact')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Компания</label>
                            <Select
                                options={companyOptions}
                                isDisabled={!canWrite || closed}
                                value={companyOptions.find((o) => o.value === form.companyId) || null}
                                onChange={(opt) => handleChange('companyId', opt?.value || '')}
                                placeholder="Поиск компании..."
                                isClearable
                                components={{ Option: makeSelectOption('deals.edit.company') }}
                                {...qa('deals.edit.company')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Продукт</label>
                            <Select
                                options={productOptions}
                                isDisabled={!canWrite || closed}
                                value={productOptions.find((o) => o.value === form.productId) || null}
                                onChange={(opt) => handleChange('productId', opt?.value || '')}
                                placeholder="Выберите продукт"
                                isClearable
                                components={{ Option: makeSelectOption('deals.edit.product') }}
                                {...qa('deals.edit.product')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Источник</label>
                            <Select
                                options={sourceOptions}
                                isDisabled={!canWrite || closed}
                                value={sourceOptions.find((o) => o.value === form.source) || null}
                                onChange={(opt) => handleChange('source', opt?.value || '')}
                                placeholder="Выберите источник"
                                isClearable
                                components={{ Option: makeSelectOption('deals.edit.source') }}
                                {...qa('deals.edit.source')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Ответственный</label>
                            {/* Без isClearable: домен намеренно игнорирует пустого
                                ответственного (правило «нет бесхозных записей» —
                                сделка без владельца невидима для own-scope), так что
                                крестик «снять» молча откатывался бы при сохранении.
                                Ответственного меняют выбором другого участника. */}
                            <Select
                                options={memberOptions}
                                isDisabled={!canWrite || closed}
                                value={memberOptions.find((o) => o.value === form.assigneeId) || null}
                                onChange={(opt) => handleChange('assigneeId', opt?.value || '')}
                                placeholder="Выберите ответственного"
                                components={{ Option: makeSelectOption('deals.edit.assignee') }}
                                {...qa('deals.edit.assignee')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Ожидаемая дата закрытия</label>
                            <Input
                                type="date"
                                value={form.expectedCloseDate}
                                disabled={!canWrite || closed}
                                onChange={(e) => handleChange('expectedCloseDate', e.target.value)}
                                {...qa('deals.edit.expectedCloseDate')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <div>
                        <label className="block text-sm font-medium mb-1">Заметки</label>
                        <Input
                            textArea
                            rows={4}
                            value={form.notes}
                            disabled={!canWrite}
                            onChange={(e) => handleChange('notes', e.target.value)}
                            {...qa('deals.edit.notes')}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button variant="plain" onClick={handleCancel} {...qa('deals.edit.cancel')}>
                            Отмена
                        </Button>
                        {canWrite && (
                            <Button variant="solid" color="primary" loading={saving} onClick={handleSave} {...qa('deals.edit.save')}>
                                Сохранить
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default DealEdit
