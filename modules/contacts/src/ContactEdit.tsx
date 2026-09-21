import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useDepartmentOptions from '@/utils/hooks/useDepartmentOptions'
import { PiArrowLeftDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import {
    apiGetContact,
    apiUpdateContact,
    apiGetCompanies,
    apiGetMembers,
    apiGetDealSources,
    apiReassignContacts,
} from '@/services/CrmService'
import type { Contact, Company, ProjectMember, DealSource } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'

type EditForm = {
    firstName: string
    lastName: string
    middleName: string
    phone: string
    email: string
    position: string
    companyIds: string[]
    source: string
    tags: string
    notes: string
}

const emptyForm: EditForm = {
    firstName: '',
    lastName: '',
    middleName: '',
    phone: '',
    email: '',
    position: '',
    companyIds: [],
    source: '',
    tags: '',
    notes: '',
}

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

const toForm = (c: Contact): EditForm => ({
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    middleName: c.middleName ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    position: c.position ?? '',
    companyIds: c.companyIds ?? (c.companyId ? [c.companyId] : []),
    source: c.source ?? '',
    tags: (c.tags ?? []).join(', '),
    notes: c.notes ?? '',
})

const ContactEdit = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // TODO-370: экран редактирования сначала ЧИТАЕТ контакт — без contacts:read
    // GET /v1/contacts/:id вернёт 403, поэтому гейт явный.
    const canRead = can('contacts', 'read')
    const canWrite = can('contacts', 'write')
    // TODO-177: смена владельца — только contacts:manage (POST /v1/contacts/reassign).
    const canManage = can('contacts', 'manage')

    const [form, setForm] = useState<EditForm>(emptyForm)
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [reassignOpen, setReassignOpen] = useState(false)
    // W-6: у контакта владение взаимоисключающее — сотрудник ИЛИ отдел
    // (`contacts.service.ts#reassign` снимает парное поле), поэтому один диалог
    // на два режима, а не два независимых виджета «владельца».
    const [reassignMode, setReassignMode] = useState<'owner' | 'department'>('owner')
    const [reassignTo, setReassignTo] = useState('')
    const [reassigning, setReassigning] = useState(false)

    const {
        data: contact,
        isLoading,
        error,
        mutate,
    } = useSWR(
        id && pid && canRead ? [`/v1/contacts/${id}`, 'edit', id, pid] : null,
        () => apiGetContact<Contact>(id!, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    useEffect(() => {
        if (contact) {
            setForm(toForm(contact))
            setDirty(false)
        }
    }, [contact])

    const { data: companiesData } = useSWR(
        pid ? ['/v1/companies', 'edit', pid] : null,
        () =>
            apiGetCompanies<{ list: Company[] }, { pageSize: number; projectId: string }>({
                pageSize: 1000,
                projectId: pid!,
            }),
        { revalidateOnFocus: false },
    )
    // pid обязателен: BFF читает @Query('projectId'), без него список пуст и селект
    // «Ответственный» декоративен. pid в ключе — чтобы кэш не тёк между проектами.
    const { data: membersData } = useSWR(
        pid ? ['/api/v1/members', pid] : null,
        () => apiGetMembers<ProjectMember[]>({ projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const { data: sourcesData } = useSWR(['/api/v1/deal-sources'], () => apiGetDealSources<DealSource[]>(), {
        revalidateOnFocus: false,
    })
    // W-6: справочник отделов Системы — только для чтения текущего значения и
    // диалога переназначения (форма отдел не сохраняет, см. ниже).
    const {
        options: departmentOptions,
        departmentName,
        unavailable: departmentsUnavailable,
    } = useDepartmentOptions(canRead)

    const companyOptions = useMemo(
        () => (companiesData?.list ?? []).map((c) => ({ value: c.id, label: c.name })),
        [companiesData],
    )
    const memberOptions = useMemo(
        () => normalizeList<ProjectMember>(membersData).map((m) => ({ value: m.id, label: m.name })),
        [membersData],
    )
    const sourceOptions = useMemo(
        () => normalizeList<DealSource>(sourcesData).map((s) => ({ value: s.name, label: s.name })),
        [sourcesData],
    )

    const handleChange = (field: keyof EditForm, value: string | string[]) => {
        setForm((prev) => ({ ...prev, [field]: value }))
        setDirty(true)
    }

    const handleBack = () => {
        if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) {
            return
        }
        navigate(-1)
    }

    const handleSave = async () => {
        if (!id || !pid) return
        if (!form.firstName && !form.lastName) {
            notifyError('Укажите имя или фамилию')
            return
        }
        if (!form.phone && !form.email) {
            notifyError('Укажите телефон или email')
            return
        }
        setSaving(true)
        try {
            await apiUpdateContact(
                id,
                {
                    firstName: form.firstName,
                    lastName: form.lastName,
                    middleName: form.middleName || undefined,
                    phone: form.phone || undefined,
                    email: form.email || undefined,
                    position: form.position || undefined,
                    companyIds: form.companyIds,
                    companyId: form.companyIds[0] || undefined,
                    source: form.source || undefined,
                    // TODO-177: assigneeId сюда НЕ кладём — домен вычёркивает ownerId
                    // из update (contacts.service.ts STRIPPED_UPDATE_FIELDS, FR-MCON-24),
                    // смена владельца идёт только через POST /v1/contacts/reassign.
                    tags: form.tags
                        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
                        : [],
                    notes: form.notes || undefined,
                },
                { projectId: pid },
            )
            notifySuccess('Сохранено')
            setDirty(false)
            navigate(`/contacts/${id}`)
        } catch (err) {
            const { message } = extractApiError(err)
            notifyError(message)
        } finally {
            setSaving(false)
        }
    }

    const openReassign = (mode: 'owner' | 'department') => {
        setReassignMode(mode)
        setReassignTo((mode === 'owner' ? contact?.assigneeId : contact?.departmentId) ?? '')
        setReassignOpen(true)
    }

    /**
     * TODO-177 / W-6 — смена владельца записи через `POST /v1/contacts/reassign`
     * (`v1-data-bff.controller.ts#reassignContacts`, `contacts:manage`).
     * Единственный путь: UpdateContact вычёркивает и ownerId, и departmentId.
     * Домен принимает РОВНО ОДНО поле и снимает парное — отсюда режим диалога.
     */
    const handleReassign = async () => {
        if (!id || !pid || !reassignTo) return
        setReassigning(true)
        try {
            await apiReassignContacts(
                reassignMode === 'owner'
                    ? { contactIds: [id], newOwnerId: reassignTo }
                    : { contactIds: [id], newDepartmentId: reassignTo },
                { projectId: pid },
            )
            notifySuccess(reassignMode === 'owner' ? 'Ответственный изменён' : 'Отдел изменён')
            setReassignOpen(false)
            await mutate()
        } catch (err) {
            const { status, message } = extractApiError(err)
            notifyError(
                status === 403
                    ? reassignMode === 'owner'
                        ? 'Нет права на смену ответственного (contacts:manage)'
                        : 'Нет права на смену отдела (contacts:manage)'
                    : message,
            )
        } finally {
            setReassigning(false)
        }
    }

    // ST-10 No-permission (TODO-370): без contacts:read форму даже не читаем.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10">
                        <p className="text-gray-500">Контакт недоступен</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Нужно право на просмотр контактов (contacts:read)
                        </p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            К списку контактов
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-10 No-permission: нет права write → не открываем форму, ведём на просмотр.
    if (!canWrite) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10">
                        <p className="text-gray-500">Редактирование недоступно</p>
                        <Button
                            variant="solid"
                            className="mt-4"
                            onClick={() => navigate(id ? `/contacts/${id}` : '/contacts')}
                        >
                            К контакту
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-1 Loading формы.
    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    const errStatus = extractApiError(error).status

    // ST-9 Not found (404 / вне видимости).
    if (!contact && errStatus === 404) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10">
                        <p className="text-gray-500">Контакт не найден</p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-6 Error загрузки.
    if (!contact && error) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                        <p className="text-gray-600 dark:text-gray-300">Не удалось загрузить контакт</p>
                        <Button variant="solid" onClick={() => mutate()} {...qa('contacts.edit.retry')}>
                            Повторить
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    if (!contact) return null

    // Имя текущего владельца: справочник участников → фоллбэк на assigneeName из BFF
    // (AssigneeNameInterceptor), чтобы не показывать сырой UUID.
    const currentAssigneeLabel =
        memberOptions.find((o) => o.value === contact.assigneeId)?.label ??
        contact.assigneeName ??
        ''

    // W-6: имя отдела-владельца; неизвестный справочнику id хук отдаёт как есть,
    // чтобы «чужой» отдел не выглядел как отсутствие отдела.
    const currentDepartmentLabel = departmentName(contact.departmentId) ?? ''

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={handleBack}
                        title="Назад"
                        {...qa('contacts.edit.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">Редактирование контакта</h3>
                </div>

                <AdaptiveCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Фамилия</label>
                            <Input
                                value={form.lastName}
                                onChange={(e) => handleChange('lastName', e.target.value)}
                                {...qa('contacts.edit.lastName')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Имя</label>
                            <Input
                                value={form.firstName}
                                onChange={(e) => handleChange('firstName', e.target.value)}
                                {...qa('contacts.edit.firstName')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Отчество</label>
                            <Input
                                value={form.middleName}
                                onChange={(e) => handleChange('middleName', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Телефон{' '}
                                <span className="text-gray-400 text-xs">(или email)</span>
                            </label>
                            <Input
                                value={form.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                {...qa('contacts.edit.phone')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Эл. почта</label>
                            <Input
                                value={form.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                {...qa('contacts.edit.email')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Должность</label>
                            <Input
                                value={form.position}
                                onChange={(e) => handleChange('position', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Компании</label>
                            <Select
                                isMulti
                                options={companyOptions}
                                value={companyOptions.filter((o) => form.companyIds.includes(o.value))}
                                onChange={(opts) => {
                                    const ids = Array.isArray(opts) ? opts.map((o) => o.value) : []
                                    handleChange('companyIds', ids)
                                }}
                                placeholder="Выберите компании"
                                {...qa('contacts.edit.companies')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Источник</label>
                            <Select
                                isClearable
                                options={sourceOptions}
                                value={sourceOptions.find((o) => o.value === form.source) || null}
                                onChange={(opt) => handleChange('source', opt?.value || '')}
                                placeholder="Выберите источник"
                            />
                        </div>
                        {/* TODO-177: раньше здесь был Select «Ответственный» — рабочий
                            на вид, но мёртвый: gateway передавал assignee_id, а домен
                            вычёркивал ownerId из update, и значение молча терялось.
                            Показываем текущего владельца и ведём на единственное
                            рабочее действие — POST /v1/contacts/reassign (contacts:manage). */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Ответственный</label>
                            <div className="flex items-center gap-2">
                                <Input
                                    readOnly
                                    value={currentAssigneeLabel}
                                    placeholder="Не назначен"
                                />
                                {canManage && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => openReassign('owner')}
                                        {...qa('contacts.edit.reassignOwner')}
                                    >
                                        Сменить
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                {canManage
                                    ? 'Смена ответственного — отдельное действие, вне сохранения формы.'
                                    : 'Сменить ответственного может пользователь с правом contacts:manage.'}
                            </p>
                        </div>
                        {/* W-6: отдел-владелец. Как и ответственный, из update домен его
                            вычёркивает (STRIPPED_UPDATE_FIELDS) — поэтому поле read-only,
                            а изменение идёт через reassign. */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Отдел</label>
                            <div className="flex items-center gap-2">
                                <Input
                                    readOnly
                                    value={currentDepartmentLabel}
                                    placeholder="Не назначен"
                                />
                                {canManage && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={departmentsUnavailable}
                                        onClick={() => openReassign('department')}
                                        {...qa('contacts.edit.reassignDepartment')}
                                    >
                                        Сменить отдел
                                    </Button>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                {departmentsUnavailable
                                    ? 'Справочник отделов недоступен — смена отдела временно невозможна.'
                                    : canManage
                                      ? 'Запись принадлежит либо сотруднику, либо отделу: назначение отдела снимет ответственного.'
                                      : 'Сменить отдел может пользователь с правом contacts:manage.'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Теги</label>
                            <Input
                                value={form.tags}
                                onChange={(e) => handleChange('tags', e.target.value)}
                                placeholder="Через запятую"
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
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                        <Button variant="plain" disabled={saving} onClick={handleBack}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={saving || !dirty}
                            onClick={handleSave}
                            {...qa('contacts.edit.save')}
                        >
                            Сохранить
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>

            {/* TODO-177: смена ответственного — отдельная операция (reassign), не update. */}
            <Dialog
                isOpen={reassignOpen}
                onClose={() => !reassigning && setReassignOpen(false)}
                onRequestClose={() => !reassigning && setReassignOpen(false)}
                {...qa('contacts.edit.reassignDialog')}
            >
                <h5 className="mb-3">
                    {reassignMode === 'owner' ? 'Сменить ответственного' : 'Сменить отдел'}
                </h5>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Владелец записи меняется отдельной операцией и сразу — сохранять форму не
                    нужно.{' '}
                    {reassignMode === 'owner'
                        ? 'Назначение сотрудника снимет отдел-владелец.'
                        : 'Назначение отдела снимет ответственного сотрудника.'}
                </p>
                <Select
                    options={reassignMode === 'owner' ? memberOptions : departmentOptions}
                    value={
                        (reassignMode === 'owner' ? memberOptions : departmentOptions).find(
                            (o) => o.value === reassignTo,
                        ) || null
                    }
                    onChange={(opt) => setReassignTo(opt?.value || '')}
                    placeholder={
                        reassignMode === 'owner' ? 'Выберите ответственного' : 'Выберите отдел'
                    }
                    {...qa(
                        reassignMode === 'owner'
                            ? 'contacts.edit.reassignOwnerSelect'
                            : 'contacts.edit.reassignDepartmentSelect',
                    )}
                />
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button
                        variant="plain"
                        disabled={reassigning}
                        onClick={() => setReassignOpen(false)}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={reassigning}
                        disabled={
                            reassigning ||
                            !reassignTo ||
                            reassignTo ===
                                ((reassignMode === 'owner'
                                    ? contact.assigneeId
                                    : contact.departmentId) ?? '')
                        }
                        onClick={handleReassign}
                        {...qa('contacts.edit.reassignSubmit')}
                    >
                        Сменить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default ContactEdit
