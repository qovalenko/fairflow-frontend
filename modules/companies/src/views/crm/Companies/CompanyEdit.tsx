import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import useSWR, { useSWRConfig } from 'swr'
import { PiArrowLeftDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Loading from '@/components/shared/Loading'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import { apiGetCompany, apiUpdateCompany, apiGetMembers } from '@/services/CrmService'
import type { Company, ProjectMember } from '@/@types/crm'
import { qa } from '../../../qa'

const industryOptions = [
    { value: 'Производство', label: 'Производство' },
    { value: 'Финансы', label: 'Финансы' },
    { value: 'Торговля', label: 'Торговля' },
    { value: 'ИТ', label: 'ИТ' },
    { value: 'Услуги', label: 'Услуги' },
    { value: 'Энергетика', label: 'Энергетика' },
    { value: 'Строительство', label: 'Строительство' },
    { value: 'Логистика', label: 'Логистика' },
    { value: 'Телеком', label: 'Телеком' },
    { value: 'Образование', label: 'Образование' },
]

const statusOptions = [
    { value: 'lead', label: 'Лид' },
    { value: 'client', label: 'Клиент' },
    { value: 'partner', label: 'Партнёр' },
    { value: 'former', label: 'Бывший' },
]

/**
 * Поля формы = ровно те поля, которые доходят до хранилища.
 *
 * `employeeCount` и `actualAddress` отсюда убраны: их нет НИ В ОДНОМ звене пути —
 * ни в `CreateCompanyRequest`/`UpdateCompanyRequest`/`Company` (proto company v1),
 * ни в маппинге gateway (`createCompany`/`updateCompany`/`mapCompany`), ни в домене
 * company. Пользователь вводил значение, получал «Сохранено» и терял его на первой
 * же перезагрузке карточки. Пока их не примет бэкенд, поля не показываем.
 */
type FormState = {
    name: string
    inn: string
    kpp: string
    ogrn: string
    industry: string
    status: string
    legalAddress: string
    phone: string
    email: string
    website: string
    assigneeId: string
    /** W-6: отдел-владелец записи (`department_id` в create/update компании). */
    departmentId: string
    tags: string
    notes: string
}

const toForm = (c: Company): FormState => ({
    name: c.name ?? '',
    inn: c.inn ?? '',
    kpp: c.kpp ?? '',
    ogrn: c.ogrn ?? '',
    industry: c.industry ?? '',
    status: c.status ?? '',
    legalAddress: c.legalAddress ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    website: c.website ?? '',
    assigneeId: c.assigneeId ?? '',
    departmentId: c.departmentId ?? '',
    tags: (c.tags ?? []).join(', '),
    notes: c.notes ?? '',
})

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object' && 'list' in value && Array.isArray((value as { list?: unknown }).list)) {
        return (value as { list: T[] }).list
    }
    return []
}

const CompanyEdit = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()

    const canWrite = can('companies', 'write')
    const canReassignOwner = can('companies.owner', 'write') || can('companies', 'manage')

    const [form, setForm] = useState<FormState | null>(null)
    const [initial, setInitial] = useState<FormState | null>(null)
    const [saving, setSaving] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)
    const [leaveOpen, setLeaveOpen] = useState(false)

    const { data: company, isLoading, error } = useSWR(
        id && pid && canWrite ? [`/v1/companies/${id}`, id, pid] : null,
        () => apiGetCompany<Company>(id!, { projectId: pid! }),
        { revalidateOnFocus: false }
    )

    const { data: membersData } = useSWR(
        canWrite ? ['/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false }
    )

    // W-6: справочник отделов Системы для селекта «Отдел».
    const { options: departmentOptions, unavailable: departmentsUnavailable } =
        useDepartmentOptions(canWrite)

    useEffect(() => {
        if (company) {
            const f = toForm(company)
            setForm(f)
            setInitial(f)
        }
    }, [company])

    const memberOptions = useMemo(
        () =>
            normalizeList<ProjectMember>(membersData)
                .filter((m) => m && m.id)
                .map((m) => ({ value: String(m.id), label: m.name ? String(m.name) : 'Без имени' })),
        [membersData]
    )

    const dirty = useMemo(
        () => !!form && !!initial && JSON.stringify(form) !== JSON.stringify(initial),
        [form, initial]
    )

    const handleChange = (field: keyof FormState, value: string) => {
        setForm((prev) => (prev ? { ...prev, [field]: value } : prev))
        if (field === 'name') setNameError(null)
    }

    const handleBack = () => {
        if (dirty) setLeaveOpen(true)
        else navigate(-1)
    }

    const handleSave = async () => {
        if (!form || !id) return
        if (!form.name.trim()) {
            setNameError('Название обязательно')
            return
        }
        setSaving(true)
        try {
            const payload: Record<string, unknown> = {
                name: form.name.trim(),
                inn: form.inn.replace(/\D/g, '') || undefined,
                kpp: form.kpp || undefined,
                ogrn: form.ogrn || undefined,
                industry: form.industry || undefined,
                status: form.status || undefined,
                legalAddress: form.legalAddress || undefined,
                phone: form.phone || undefined,
                email: form.email || undefined,
                website: form.website || undefined,
                tags: form.tags
                    ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
                    : [],
                notes: form.notes || undefined,
                // W-6: отдел отправляем ВСЕГДА, в том числе '' («без отдела»).
                // `department_id` — обычное proto3-string поле UpdateCompanyRequest,
                // и домен пишет его в $set как есть: не прислать поле = стереть
                // отдел записи на любом сохранении формы.
                departmentId: form.departmentId,
            }
            if (canReassignOwner) payload.assigneeId = form.assigneeId || undefined
            // Проект gateway берёт ТОЛЬКО из query (@Query('projectId')), а не из тела:
            // раньше projectId ехал в payload и до домена не доходил.
            await apiUpdateCompany<Company>(id, payload, { projectId: pid })
            toast.push('Сохранено')
            setInitial(form)
            mutate([`/v1/companies/${id}`, id, pid])
            mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, { revalidate: true })
            navigate(`/companies/${id}`)
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            toast.push(err?.response?.data?.error?.message ?? 'Не удалось сохранить компанию')
        } finally {
            setSaving(false)
        }
    }

    // ── ST-10/11: нет права на редактирование ──
    if (!canWrite) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.edit.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Редактирование недоступно</h4>
                        <p className="text-gray-500">У вас нет права на изменение компаний.</p>
                        <Button variant="solid" color="primary" onClick={() => navigate(`/companies/${id}`)}>
                            Открыть карточку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ── ST-1: загрузка ──
    if (isLoading || (!form && !error)) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ── ST-9 / ST-6: не найдена ──
    if (error || !form) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('companies.edit.notFound')}>
                        <p className="text-gray-500">Компания не найдена</p>
                        <Button variant="solid" color="primary" className="mt-4" onClick={() => navigate('/companies')}>
                            Вернуться к списку
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
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={handleBack}
                        title="Назад"
                        {...qa('companies.edit.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">Редактирование компании</h3>
                </div>

                <AdaptiveCard>
                    <h5 className="mb-4">Основная информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">
                                Название <span className="text-red-500">*</span>
                            </label>
                            <Input
                                value={form.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                {...qa('companies.edit.name')}
                            />
                            {nameError && (
                                <p className="text-red-500 text-xs mt-1" {...qa('companies.edit.nameError')}>
                                    {nameError}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">ИНН</label>
                            <Input
                                value={form.inn}
                                onChange={(e) => handleChange('inn', e.target.value)}
                                {...qa('companies.edit.inn')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">КПП</label>
                            <Input
                                value={form.kpp}
                                onChange={(e) => handleChange('kpp', e.target.value)}
                                {...qa('companies.edit.kpp')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">ОГРН</label>
                            <Input
                                value={form.ogrn}
                                onChange={(e) => handleChange('ogrn', e.target.value)}
                                {...qa('companies.edit.ogrn')}
                            />
                        </div>
                        <div {...qa('companies.edit.industry')}>
                            <label className="block text-sm font-medium mb-1">Отрасль</label>
                            <Select
                                options={industryOptions}
                                isClearable
                                value={industryOptions.find((o) => o.value === form.industry) || null}
                                onChange={(opt) => handleChange('industry', opt?.value || '')}
                                placeholder="Выберите отрасль"
                            />
                        </div>
                        <div {...qa('companies.edit.status')}>
                            <label className="block text-sm font-medium mb-1">Статус</label>
                            <Select
                                options={statusOptions}
                                isClearable
                                value={statusOptions.find((o) => o.value === form.status) || null}
                                onChange={(opt) => handleChange('status', opt?.value || '')}
                                placeholder="Выберите статус"
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Адреса</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Юридический адрес</label>
                            <Input
                                value={form.legalAddress}
                                onChange={(e) => handleChange('legalAddress', e.target.value)}
                                {...qa('companies.edit.legalAddress')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Контактная информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Телефон</label>
                            <Input
                                value={form.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                {...qa('companies.edit.phone')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Эл. почта</label>
                            <Input
                                value={form.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                {...qa('companies.edit.email')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Веб-сайт</label>
                            <Input
                                value={form.website}
                                onChange={(e) => handleChange('website', e.target.value)}
                                {...qa('companies.edit.website')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Дополнительно</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div {...qa('companies.edit.assignee')}>
                            <label className="block text-sm font-medium mb-1">Ответственный</label>
                            <Select
                                options={memberOptions}
                                isClearable
                                isDisabled={!canReassignOwner}
                                value={memberOptions.find((o) => o.value === form.assigneeId) || null}
                                onChange={(opt) => handleChange('assigneeId', opt?.value || '')}
                                placeholder={canReassignOwner ? 'Выберите ответственного' : 'Нет прав на смену владельца'}
                            />
                        </div>
                        {/* W-6: отдел-владелец записи — второй (после ответственного)
                            атрибут видимости ABAC. Меняется обычным сохранением формы:
                            домен company, в отличие от контакта, принимает department_id
                            в update. */}
                        <div {...qa('companies.edit.department')}>
                            <label className="block text-sm font-medium mb-1">Отдел</label>
                            <Select
                                options={departmentOptions}
                                isClearable
                                isDisabled={!canReassignOwner || departmentsUnavailable}
                                value={
                                    departmentOptions.find((o) => o.value === form.departmentId) ||
                                    null
                                }
                                onChange={(opt) => handleChange('departmentId', opt?.value || '')}
                                placeholder={
                                    departmentsUnavailable
                                        ? 'Справочник отделов недоступен'
                                        : canReassignOwner
                                          ? 'Выберите отдел'
                                          : 'Нет прав на смену владельца'
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Теги</label>
                            <Input
                                value={form.tags}
                                onChange={(e) => handleChange('tags', e.target.value)}
                                placeholder="Через запятую"
                                {...qa('companies.edit.tags')}
                            />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-medium mb-1">Заметки</label>
                        <Input
                            textArea
                            rows={4}
                            value={form.notes}
                            onChange={(e) => handleChange('notes', e.target.value)}
                            {...qa('companies.edit.notes')}
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button
                            variant="plain"
                            onClick={handleBack}
                            disabled={saving}
                            {...qa('companies.edit.cancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            onClick={handleSave}
                            loading={saving}
                            disabled={!dirty || saving}
                            {...qa('companies.edit.save')}
                        >
                            Сохранить
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>

            {/* ST-30: dirty-guard */}
            <Dialog isOpen={leaveOpen} onClose={() => setLeaveOpen(false)} onRequestClose={() => setLeaveOpen(false)}>
                <h5 className="mb-2" {...qa('companies.edit.dirtyGuard')}>
                    Несохранённые изменения
                </h5>
                <p className="text-gray-500">Вы внесли изменения. Покинуть страницу без сохранения?</p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setLeaveOpen(false)}
                        {...qa('companies.edit.dirtyGuardStay')}
                    >
                        Остаться
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        onClick={() => navigate(-1)}
                        {...qa('companies.edit.dirtyGuardLeave')}
                    >
                        Уйти без сохранения
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default CompanyEdit
