import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { useSessionUser } from '@/store/authStore'
import { PROJECT_MANAGE_ROLES } from '@/configs/permission.config'
import useCompanyNames from '@/utils/hooks/useCompanyNames'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiClockCounterClockwiseDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Loading from '@/components/shared/Loading'
import {
    apiGetContact,
    apiGetDeals,
    apiGetActivities,
    apiGetContactHistory,
    apiDeleteContact,
    apiFindContactDuplicates,
} from '@/services/CrmService'
import type { Contact, Deal, Activity } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'
import HistoryTimeline, {
    type HistoryTimelineEvent,
} from '@/components/shared/HistoryTimeline'
import ContactHeaderWidget from './ContactHeaderWidget'
import ContactHeaderStats from './ContactHeaderStats'
import ContactInfoWidget from './ContactInfoWidget'
import ContactDealsWidget from './ContactDealsWidget'
import ContactMergedSourcesWidget from './ContactMergedSourcesWidget'
import { CompanyActivitiesWidget } from '@fairflow/shared-ui'
import DocumentsTab from '@/components/shared/documents/DocumentsTab'
import useDocumentsModuleEnabled from '@/utils/hooks/useDocumentsModuleEnabled'
import HostSlot from '@/components/shared/HostSlot'
import UserProfileLink from '@/components/shared/UserProfileLink'
import RecordShareControl from '@/components/shared/RecordShareControl'

/** History item shape returned by GET /v1/contacts/{id}/history (audit-backed). */
type ContactHistoryEvent = {
    id?: string
    type?: string
    userId?: string
    userName?: string
    timestamp?: string | number
    summary?: string
    changedFields?: { field: string; old?: string; new?: string }[]
}

const ContactDetails = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // TODO-370: чтение гейтится явно — сервер требует contacts:read
    // (v1-data-bff.controller.ts GET /v1/contacts/:id), без гейта пользователь
    // получал не экран «нет доступа», а красную ошибку загрузки.
    const canRead = can('contacts', 'read')
    const canWrite = can('contacts', 'write')
    const canDelete = can('contacts', 'delete')
    const canManage = can('contacts', 'manage')
    const { projects } = useWorkspaceRole()
    const sessionUserId = useSessionUser((s) => s.user.userId)
    const projectRole = useMemo(
        () => projects.find((p) => p.id === pid)?.role,
        [projects, pid],
    )
    const roleAtLeastManager = Boolean(
        projectRole && PROJECT_MANAGE_ROLES.includes(projectRole),
    )
    const documentsModuleEnabled = useDocumentsModuleEnabled()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [mergeBusy, setMergeBusy] = useState(false)

    const {
        data: contact,
        isLoading: contactLoading,
        error: contactError,
        mutate: mutateContact,
    } = useSWR(
        id && pid && canRead ? [`/v1/contacts/${id}`, id, pid] : null,
        () => apiGetContact<Contact>(id!, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // FR-MDEAL-480: сделки контакта берём СЕРВЕРНЫМ фильтром `contactId`
    // (gateway GET /v1/deals?contactId=… → pipe filters.contactId). Раньше здесь
    // тянулся весь список с pageSize:1000, который gateway всё равно режет до 100
    // (parsePageSize), а отбор шёл на клиенте — в проекте с >100 сделок часть
    // сделок контакта просто не доезжала до карточки.
    const { data: dealsData, isLoading: dealsLoading } = useSWR(
        contact && pid ? ['/api/v1/deals', 'byContact', contact.id, pid] : null,
        () =>
            apiGetDeals<
                { list: Deal[]; total: number },
                { projectId: string; contactId: string; pageSize: number }
            >({
                projectId: pid!,
                contactId: contact!.id,
                pageSize: 100,
            }),
        { revalidateOnFocus: false },
    )

    // TODO-168: активности контакта — тоже СЕРВЕРНЫМ фильтром. Контракт ручки
    // GET /v1/activities (gateway `crm-bff.controller.ts#listActivities`) — это
    // пара `linkEntityType`/`linkEntityId` (параметра `contactId` у неё нет);
    // домен кладёт её предикатом в Mongo (`activity.service.ts#list`:
    // `{'links.entityType':…, 'links.entityId':…}`), а плоский `contactId` в
    // ответе как раз и выводится из этой связи (`toRow`: `flat('contact')`).
    // Раньше тянулся весь список без projectId и с pageSize:1000, который
    // gateway режет до 100 (`parsePageSize`), а отбор шёл на клиенте — в проекте
    // с >100 активностей часть активностей контакта до карточки не доезжала.
    const { data: activitiesData, isLoading: activitiesLoading } = useSWR(
        contact && pid ? ['/api/v1/activities', 'byContact', contact.id, pid] : null,
        () =>
            apiGetActivities<
                { list: Activity[]; total: number },
                {
                    projectId: string
                    linkEntityType: string
                    linkEntityId: string
                    pageSize: number
                }
            >({
                projectId: pid!,
                linkEntityType: 'contact',
                linkEntityId: contact!.id,
                pageSize: 100,
            }),
        { revalidateOnFocus: false },
    )

    // Источник истины по составу — сервер (`contactId` уже в запросе выше).
    // Клиентский повтор `deal.contactId === contact.id` убран: он дублировал
    // условие и, если BFF перестанет отдавать `contactId` в списке, схлопывал бы
    // блок в пустой — тихо и без ошибки.
    const deals = useMemo(
        () => (Array.isArray(dealsData?.list) ? dealsData.list : []),
        [dealsData],
    )

    // Состав определяет сервер (`linkEntityId` уже в запросе). Клиентский повтор
    // `activity.contactId === contact.id` убран: он схлопывал бы блок в пустой,
    // если BFF перестанет дублировать связь в плоское поле.
    const activities = useMemo(
        () => (Array.isArray(activitiesData?.list) ? activitiesData.list : []),
        [activitiesData],
    )

    // T-010: BE-ответ контакта отдаёт только companyId(s) без названия →
    // резолвим связанную компанию в имя (переиспользуемый хук по проекту).
    const { companyName: resolveCompanyName } = useCompanyNames(pid ?? undefined)
    const contactWithCompanies = useMemo(() => {
        if (!contact) return contact
        const ids =
            contact.companyIds && contact.companyIds.length > 0
                ? contact.companyIds
                : contact.companyId
                  ? [contact.companyId]
                  : []
        const companies = ids
            .map((cid) => ({
                id: cid,
                name: resolveCompanyName(cid) ?? contact.companyName ?? '',
            }))
            .filter((c) => c.name)
        return {
            ...contact,
            companyName: resolveCompanyName(contact.companyId) ?? contact.companyName,
            companies: companies.length > 0 ? companies : contact.companies,
        }
    }, [contact, resolveCompanyName])

    // Real change history from the immutable audit chain (mirrors CompanyDetails).
    // Falls back to empty state if the endpoint is unavailable.
    const { data: historyData } = useSWR(
        id && pid && contact ? [`/v1/contacts/${id}/history`, id, pid] : null,
        () =>
            apiGetContactHistory<{ items: ContactHistoryEvent[] }>(id!, {
                projectId: pid!,
                limit: 50,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const historyEvents: HistoryTimelineEvent[] = useMemo(() => {
        const items = historyData?.items ?? []
        const mapped: HistoryTimelineEvent[] = items.map((ev, idx) => {
            const ts =
                typeof ev.timestamp === 'number'
                    ? ev.timestamp
                    : ev.timestamp
                      ? dayjs(ev.timestamp).unix()
                      : 0
            return {
                id: ev.id ?? `h${idx}`,
                timestamp: ts,
                time: ts ? dayjs.unix(ts).format('DD.MM.YYYY HH:mm') : '',
                user: ev.userName ?? ev.userId ?? 'Система',
                action: ev.summary ?? ev.type ?? 'Изменение',
                details: ev.summary ?? '',
                diff: ev.changedFields?.map((c) => ({
                    field: c.field,
                    old: c.old ?? '—',
                    new: c.new ?? '—',
                })),
            }
        })
        // No audit rows yet (e.g. a contact created before history was wired):
        // show the truthful creation fact rather than an empty card.
        if (!mapped.length && contact) {
            const name = `${contact.firstName} ${contact.lastName}`.trim()
            return [
                {
                    id: 'created',
                    timestamp: contact.createdAt,
                    time: dayjs.unix(contact.createdAt).format('DD.MM.YYYY HH:mm'),
                    user: '—',
                    action: 'Создание',
                    details: `Контакт "${name}" создан`,
                },
            ]
        }
        return mapped
    }, [historyData, contact])

    const handleEdit = () => {
        navigate(`/contacts/${id}/edit`)
    }

    // EL-DET-15: «Слить дубль» — ищем кандидата (§3.8) и ведём в SCR-CONTACTS-MERGE.
    const handleMerge = async () => {
        if (!id || !pid || !contact) return
        setMergeBusy(true)
        try {
            const res = await apiFindContactDuplicates({
                projectId: pid,
                email: contact.email || undefined,
                phone: contact.phone || undefined,
                excludeId: id,
            })
            const candidate = res?.candidates?.[0]
            if (candidate) {
                navigate(`/contacts/merge?source=${candidate.contactId}&target=${id}`)
            } else {
                notifySuccess('Похожих контактов не найдено')
            }
        } catch (err) {
            const { message } = extractApiError(err)
            notifyError(message)
        } finally {
            setMergeBusy(false)
        }
    }

    const handleDelete = async () => {
        if (!id || !pid) return
        setDeleting(true)
        try {
            await apiDeleteContact(id, { projectId: pid })
            notifySuccess('Контакт перемещён в корзину')
            setConfirmOpen(false)
            navigate('/contacts')
        } catch (err) {
            const { message } = extractApiError(err)
            notifyError(message)
        } finally {
            setDeleting(false)
        }
    }

    // ST-10 No-permission (TODO-370): нет contacts:read → аккуратный экран,
    // а не 403 из-под загрузки. Гейт FE — UX; сервер остаётся источником истины.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Карточка контакта недоступна</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Нужно право на просмотр контактов (contacts:read)
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-1 Loading.
    if (contactLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    const errStatus = (extractApiError(contactError).status)

    // ST-9 Not found / вне видимости (404) или soft-deleted.
    if (!contact && (errStatus === 404 || (!contactError && !contactLoading))) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8">
                        <p className="text-gray-500">Контакт не найден</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate('/contacts')}
                        >
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-6 Error загрузки (не 404).
    if (!contact && contactError) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                        <p className="text-gray-600 dark:text-gray-300">
                            Не удалось загрузить контакт
                        </p>
                        <div className="flex gap-2">
                            <Button variant="solid" onClick={() => mutateContact()} {...qa('contacts.details.retry')}>
                                Повторить
                            </Button>
                            <Button variant="plain" onClick={() => navigate('/contacts')}>
                                К списку
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    if (!contact) return null

    const fullName = `${contact.firstName} ${contact.lastName}${contact.middleName ? ` ${contact.middleName}` : ''}`

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <ContactHeaderWidget
                    contact={contact}
                    fullName={fullName}
                    onEdit={canWrite ? handleEdit : undefined}
                    onDelete={canDelete ? () => setConfirmOpen(true) : undefined}
                    onMerge={canManage ? handleMerge : undefined}
                    mergeBusy={mergeBusy}
                />

                <ContactHeaderStats deals={deals} loading={dealsLoading} />

                {/* TODO-161: доноры слияний + «Отменить слияние» (FR-CONTACTS-260).
                    Блока нет, пока сливать нечего: домен отдаёт только тени, по
                    которым 30-дневное окно ещё открыто. */}
                {(contact.mergedSources?.length ?? 0) > 0 && (
                    <ContactMergedSourcesWidget
                        sources={contact.mergedSources ?? []}
                        projectId={pid ?? undefined}
                        canUnmerge={canManage}
                        onUnmerged={(restored, sourceId) => {
                            // Мастер перечитываем: донор уходит из списка теней.
                            mutateContact()
                            navigate(`/contacts/${restored?.id ?? sourceId}`)
                        }}
                    />
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 flex flex-col min-h-0">
                        <ContactInfoWidget
                            contact={contactWithCompanies ?? contact}
                            onEditNotes={handleEdit}
                            onCompanyClick={(companyId) => navigate(`/companies/${companyId}`)}
                        />
                    </div>
                    <div className="flex flex-col min-h-0 gap-4">
                        <ContactDealsWidget
                            deals={deals}
                            onDealClick={(deal) => navigate(`/deals/${deal.id}`)}
                            loading={dealsLoading}
                        />
                        <HostSlot
                            id="contact.card.sidebar"
                            context={{ contactId: contact.id }}
                            className="flex flex-col gap-4 min-h-0"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* FR-ACTIVITIES-150 / RFC-3 §1.2: mount-point `contact.card.tab`.
                        Врезка «Активности» приезжает из модуля activities
                        (ActivityCardTab: хронология + «следующий шаг» + «+ Активность»),
                        если модуль включён в проекте и есть право. Иначе (модуль
                        выключен, standalone-режим) остаётся встроенный
                        read-only-таймлайн — дублирования на экране нет. */}
                    <div className="flex flex-col min-h-0" {...qa('contacts.details.activities')}>
                        <HostSlot
                            id="contact.card.tab"
                            context={{ contactId: contact.id }}
                            className="flex flex-col gap-4 min-h-0"
                            fallback={
                                <CompanyActivitiesWidget
                                    activities={activities}
                                    onActivityClick={(activity) => navigate(`/activities/${activity.id}`)}
                                    loading={activitiesLoading}
                                    renderAssignee={(activity) =>
                                        activity.assigneeId && activity.assigneeName ? (
                                            <UserProfileLink userId={activity.assigneeId}>
                                                {activity.assigneeName}
                                            </UserProfileLink>
                                        ) : (
                                            activity.assigneeName
                                        )
                                    }
                                />
                            }
                        />
                    </div>
                    <div className="flex flex-col min-h-0">
                        <Card
                            className="w-full flex-1 flex flex-col min-h-0 max-h-[60vh] border border-gray-200 dark:border-gray-700"
                            bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden"
                            {...qa('contacts.details.history')}
                            header={{
                                content: (
                                    <div className="flex items-center gap-2">
                                        <PiClockCounterClockwiseDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                        <h4 className="text-base font-semibold">История</h4>
                                    </div>
                                ),
                                extra: (
                                    <span className="inline-flex p-2 rounded-lg" aria-hidden>
                                        <span className="w-4 h-4" />
                                    </span>
                                ),
                                bordered: true,
                            }}
                        >
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <HistoryTimeline
                                    events={historyEvents}
                                    emptyMessage="Нет записей истории"
                                />
                            </div>
                        </Card>
                    </div>
                </div>

                {/* FR-DOCS-300/400: врезка «Документы» по записи (тот же общий
                    компонент, что в карточках сделки и продажи). Права/пустое
                    состояние компонент обрабатывает сам. */}
                {documentsModuleEnabled && (
                    <Card
                        className="w-full border border-gray-200 dark:border-gray-700"
                        bodyClass="p-5"
                        {...qa('contacts.details.documents')}
                    >
                        <DocumentsTab contextType="contact" recordId={contact.id} />
                    </Card>
                )}

                {(roleAtLeastManager ||
                    Boolean(contact.assigneeId && contact.assigneeId === sessionUserId)) && (
                    <AdaptiveCard {...qa('contacts.details.recordShare')}>
                        <RecordShareControl
                            projectId={pid!}
                            resource="contacts"
                            recordId={contact.id}
                            recordOwnerUserId={contact.assigneeId}
                        />
                    </AdaptiveCard>
                )}
            </div>

            <Dialog
                isOpen={confirmOpen}
                onClose={() => !deleting && setConfirmOpen(false)}
                onRequestClose={() => !deleting && setConfirmOpen(false)}
            >
                <h5 className="mb-4">Удалить контакт</h5>
                <p>
                    Контакт «{fullName}» будет перемещён в корзину. Связанные продажи и
                    документы сохранятся.
                </p>
                <div className="text-right mt-6 flex justify-end gap-2">
                    <Button variant="plain" disabled={deleting} onClick={() => setConfirmOpen(false)}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        className="bg-red-500 hover:bg-red-600 text-white"
                        loading={deleting}
                        onClick={handleDelete}
                        {...qa('contacts.details.deleteConfirm')}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default ContactDetails
