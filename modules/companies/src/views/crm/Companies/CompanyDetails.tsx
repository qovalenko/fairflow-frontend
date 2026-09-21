import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiWarningCircleDuotone,
    PiArrowCounterClockwiseDuotone,
    PiTrashDuotone,
    PiArrowsMergeDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import Dialog from '@/components/ui/Dialog'
import Select from '@/components/ui/Select'
import toast from '@/components/ui/toast'
import {
    apiGetCompany,
    apiGetCompanyCard,
    apiGetMembers,
    apiDeleteCompany,
    apiRestoreCompany,
    apiReassignCompanyOwner,
    apiFindCompanyDuplicates,
} from '@/services/CrmService'
import type { Company, Contact, Deal, Order, Activity, ProjectMember } from '@/@types/crm'
import { type HistoryTimelineEvent } from '@/components/shared/HistoryTimeline'
import CompanyHeaderWidget from './CompanyHeaderWidget'
import CompanyHeaderStats from './CompanyHeaderStats'
import CompanyRequisitesWidget from './CompanyRequisitesWidget'
import CompanyInfoWidget from './CompanyInfoWidget'
import CompanyDealsWidget from './CompanyDealsWidget'
import CompanyOrdersWidget from './CompanyOrdersWidget'
import CompanyHistoryWidget from './CompanyHistoryWidget'
import { CompanyActivitiesWidget } from '@fairflow/shared-ui'
import RestoreCollisionDialog, {
    parseRestoreCollision,
    type RestoreCollision,
    type RestoreStrategy,
} from './RestoreCollisionDialog'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import DocumentsTab from '@/components/shared/documents/DocumentsTab'
import useDocumentsModuleEnabled from '@/utils/hooks/useDocumentsModuleEnabled'
import HostSlot from '@/components/shared/HostSlot'
import UserProfileLink from '@/components/shared/UserProfileLink'
import { qa } from '../../../qa'

type AuditEvent = {
    id?: string
    type?: string
    userId?: string
    userName?: string
    timestamp?: string | number
    summary?: string
    changedFields?: { field: string; old?: string; new?: string }[]
}

/**
 * Ответ GET /v1/companies/:id/card (gateway BFF, контракт §3.3).
 * Все блоки опциональны: донор, который лёг, приходит пустым (fail-soft на
 * gateway), поэтому карточка деградирует по секциям, а не падает целиком.
 */
type CompanyCard = {
    company?: Company
    contacts?: Contact[]
    deals?: Deal[]
    orders?: Order[]
    activities?: Activity[]
    history?: AuditEvent[]
    stats?: {
        dealsTotal?: number
        dealsWon?: number
        ordersTotal?: number
        /**
         * Внимание: для сделок/продаж это `total` домена, а для контактов —
         * размер того, что нашёл ОГРАНИЧЕННЫЙ свип на gateway (у домена контактов
         * ещё нет фильтра по company_id, `contactsOfCompany`). Поэтому здесь это
         * нижняя граница, а не total.
         */
        contactsCount?: number
        /** true ⇒ свип упёрся в потолок страниц: связи показаны НЕ все. */
        contactsTruncated?: boolean
    }
}

const requisiteLines = (company: Company): string[] => {
    const lines: string[] = []
    if (company.ogrn) lines.push(`ОГРН: ${company.ogrn}`)
    if (company.kpp) lines.push(`КПП: ${company.kpp}`)
    if (company.legalAddress) lines.push(`Юридический адрес: ${company.legalAddress}`)
    if (company.actualAddress) lines.push(`Фактический адрес: ${company.actualAddress}`)
    if (company.bankName) lines.push(`Банк: ${company.bankName}`)
    if (company.bik) lines.push(`БИК: ${company.bik}`)
    if (company.correspondentAccount) lines.push(`К/с: ${company.correspondentAccount}`)
    if (company.settlementAccount) lines.push(`Р/с: ${company.settlementAccount}`)
    return lines
}

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object' && 'list' in value && Array.isArray((value as { list?: unknown }).list)) {
        return (value as { list: T[] }).list
    }
    return []
}

/** Русская форма числительного: 1 запись / 2 записи / 5 записей. */
const pluralRu = (n: number, one: string, few: string, many: string): string => {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
    return many
}

const CompanyDetails = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()

    const canRead = can('companies', 'read')
    const canWrite = can('companies', 'write')
    const canDelete = can('companies', 'delete')
    const canReassign = can('companies.owner', 'write') || can('companies', 'manage')
    // Мастер объединения гейтится ровно тем правом, что проверяет gateway:
    // @RequirePermission('companies','manage') на `companies/merge/preview` и
    // `companies/merge` (TODO-110/TODO-153). Ключ должен существовать в каталоге
    // (shared/module-registry: actions companies = read|write|delete|manage|export|
    // import) — иначе он никогда не попадёт в проекцию allowed[] и кнопка окажется
    // невидимой у всех ролей, включая владельца. Именно так было с прежними
    // 'companies.merge' и 'companies:execute': субъекта/действия в каталоге нет.
    const canMerge = can('companies', 'manage')
    const documentsModuleEnabled = useDocumentsModuleEnabled()

    const [contactDrawerOpen, setContactDrawerOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [reassignOpen, setReassignOpen] = useState(false)
    const [reassignTo, setReassignTo] = useState<string>('')
    const [reassigning, setReassigning] = useState(false)
    const [mergeOpen, setMergeOpen] = useState(false)
    const [mergeCandidates, setMergeCandidates] = useState<
        { id: string; name: string; inn?: string; matchReason?: string }[]
    >([])
    // Сколько кандидатов отсеяно как лежащие в корзине: слияние работает только с
    // живыми записями, но молча прятать такой дубль нельзя — пользователь должен
    // понимать, почему «дубль есть, а сливать не с чем» (TODO-362).
    const [mergeTrashedCount, setMergeTrashedCount] = useState(0)
    const [mergeLoading, setMergeLoading] = useState(false)
    const [restoring, setRestoring] = useState(false)
    const [restoreCollision, setRestoreCollision] = useState<RestoreCollision | null>(null)
    const [restoreStrategy, setRestoreStrategy] = useState<RestoreStrategy | null>(null)

    const { data: company, isLoading: companyLoading, error: companyError } = useSWR(
        id && pid && canRead ? [`/v1/companies/${id}`, id, pid] : null,
        () => apiGetCompany<Company>(id!, { projectId: pid! }),
        { revalidateOnFocus: false }
    )

    const isTrashed = !!company?.deletedAt

    // Связанные сущности карточки — ОДИН композитный запрос (FR-COMPANIES-050,
    // контракт company.md §3.3).
    // Было: четыре списка проекта по pageSize:1000 (контакты/сделки/продажи/
    // активности) с фильтрацией по company.id в памяти — трафик всего проекта на
    // каждую карточку и «потолок» в 1000 записей, за которым связи молча пропадали.
    // Стало: gateway фильтрует у доменов-доноров (deals/orders — company_id,
    // activities — link_entity_type=company, contacts — обратный M2M) и отдаёт
    // честные счётчики в stats. Запрос идёт параллельно с самой компанией (ключ не
    // ждёт её загрузки) — водопада нет.
    const { data: cardData, isLoading: cardLoading } = useSWR(
        id && pid && canRead ? [`/v1/companies/${id}/card`, id, pid] : null,
        () => apiGetCompanyCard<CompanyCard>(id!, { projectId: pid! }),
        { revalidateOnFocus: false }
    )

    const { data: membersData } = useSWR(
        canReassign ? ['/v1/members'] : null,
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false }
    )

    // M:M контакт↔компания (FR-MCOM-18): связь ищет gateway по всему массиву
    // company_ids, а не по legacy-скаляру companyId (= companyIds[0]), поэтому
    // контакт, привязанный к нескольким компаниям, виден в карточке каждой.
    const contacts = useMemo(() => cardData?.contacts ?? [], [cardData])

    const deals = useMemo(() => cardData?.deals ?? [], [cardData])

    const orders = useMemo(() => cardData?.orders ?? [], [cardData])

    // Виджет показывает только НЕзавершённые задачи по компании — отбор по статусу
    // остаётся на клиенте (это представление), выборка по компании — уже на сервере.
    const currentActivities = useMemo(
        () =>
            (cardData?.activities ?? [])
                .filter((a) => a.status !== 'completed' && a.status !== 'cancelled')
                .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)),
        [cardData],
    )

    // Свип контактов на gateway ограничен потолком страниц (CONTACT_SWEEP_MAX_PAGES),
    // и когда он в него упёрся, список связей заведомо неполный. Флаг едет вместе с
    // числом — карточка обязана сказать «показаны не все связи», иначе пользователь
    // видит заниженное количество без единого признака неполноты.
    const contactsTruncated = cardData?.stats?.contactsTruncated === true

    // Суммы считаем по отданным сделкам (в ответе есть amount). Количества сделок и
    // продаж — честный total домена, а не длина страницы композита. Для контактов
    // total-а нет: stats.contactsCount — размер выборки ограниченного свипа, то есть
    // НИЖНЯЯ граница (см. contactsTruncated выше).
    const headerStats = useMemo(() => {
        if (!company) return undefined
        const dealsTotalAmount = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0)
        const dealsWonAmount = deals
            .filter((d) => d.result === 'won')
            .reduce((sum, d) => sum + (d.amount ?? 0), 0)
        return {
            dealsTotalAmount,
            dealsWonAmount,
            dealsCount: cardData?.stats?.dealsTotal ?? deals.length,
            ordersCount: cardData?.stats?.ordersTotal ?? orders.length,
            contactsCount: cardData?.stats?.contactsCount ?? contacts.length,
        }
    }, [company, cardData, deals, orders, contacts])

    // История изменений (FR-COMPANIES-210 / FR-MCOM-23) приходит тем же композитом (блок `history`
    // строится тем же mapHistoryEvent, что и GET /companies/:id/history) — отдельный
    // запрос к audit больше не нужен; недоступный audit даёт пустую ленту.

    const historyEvents: HistoryTimelineEvent[] = useMemo(() => {
        const items = cardData?.history ?? []
        return items.map((ev, idx) => {
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
                    old: c.old ?? '-',
                    new: c.new ?? '-',
                })),
            }
        })
    }, [cardData])

    const memberOptions = useMemo(
        () =>
            normalizeList<ProjectMember>(membersData)
                .filter((m) => m && m.id)
                .map((m) => ({ value: String(m.id), label: m.name ? String(m.name) : 'Без имени' })),
        [membersData]
    )

    const handleEdit = () => navigate(`/companies/${id}/edit`)

    const handleDelete = async () => {
        if (!id) return
        setDeleting(true)
        try {
            await apiDeleteCompany<{ ok?: boolean }>(id, { projectId: pid })
            toast.push('Компания перемещена в корзину')
            setDeleteOpen(false)
            mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, { revalidate: true })
            navigate('/companies')
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            toast.push(err?.response?.data?.error?.message ?? 'Не удалось удалить компанию')
        } finally {
            setDeleting(false)
        }
    }

    const handleRestore = async (strategy?: RestoreStrategy) => {
        if (!id) return
        setRestoring(true)
        try {
            await apiRestoreCompany<Company>(id, strategy ? { strategy } : undefined, {
                projectId: pid,
            })
            setRestoreCollision(null)
            toast.push(
                strategy === 'merge'
                    ? 'Компания объединена с активным дублем'
                    : 'Компания восстановлена',
            )
            mutate([`/v1/companies/${id}`, id, pid])
            mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, {
                revalidate: true,
            })
        } catch (e) {
            // Живой дубль по ключу идентичности: домен присылает список стратегий
            // (merge / clear_key / as_new) — даём выбрать и повторяем запрос.
            const conflict = parseRestoreCollision(e)
            if (conflict) {
                setRestoreCollision(conflict)
                setRestoreStrategy(conflict.options[0] ?? null)
            } else {
                const err = e as { response?: { data?: { error?: { message?: string } } } }
                toast.push(
                    err?.response?.data?.error?.message ?? 'Не удалось восстановить компанию',
                )
            }
        } finally {
            setRestoring(false)
        }
    }

    const handleReassign = async () => {
        if (!id || !reassignTo) return
        setReassigning(true)
        try {
            await apiReassignCompanyOwner<Company>(id, { ownerId: reassignTo }, { projectId: pid })
            toast.push('Владелец переназначен')
            setReassignOpen(false)
            setReassignTo('')
            mutate([`/v1/companies/${id}`, id, pid])
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            toast.push(err?.response?.data?.error?.message ?? 'Не удалось переназначить владельца')
        } finally {
            setReassigning(false)
        }
    }

    // ── Merge: подобрать кандидата-дубль (ИНН / домен из e-mail-сайта / название)
    //    → SCR-COMPANIES-MERGE ──
    const openMerge = async () => {
        if (!company || !pid) return
        setMergeOpen(true)
        setMergeLoading(true)
        try {
            const res = await apiFindCompanyDuplicates<{
                candidates: {
                    id: string
                    name: string
                    inn?: string
                    matchReason?: string
                    deleted?: boolean
                }[]
            }>({
                projectId: pid,
                inn: company.inn || undefined,
                name: company.inn ? undefined : company.name,
                // TODO-362: домен-сервис выводит домен из e-mail/сайта — без них
                // дубль «та же компания, другой ИНН/без ИНН» не находился.
                email: company.email || undefined,
                website: company.website || undefined,
            })
            const others = (res?.candidates ?? []).filter((c) => c.id !== company.id)
            // Записи из корзины домен теперь возвращает намеренно, но merge читает
            // только живые: выбор такой записи лузером упал бы ошибкой. Отсеиваем
            // и показываем счётчик со ссылкой на корзину.
            setMergeCandidates(others.filter((c) => !c.deleted))
            setMergeTrashedCount(others.filter((c) => c.deleted).length)
        } catch {
            setMergeCandidates([])
            setMergeTrashedCount(0)
        } finally {
            setMergeLoading(false)
        }
    }

    // ── ST-10: нет права на чтение ──
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.card.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Раздел недоступен</h4>
                        <p className="text-gray-500">У вас нет доступа к этой компании.</p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ── ST-1: загрузка ──
    if (companyLoading) {
        return (
            <Container>
                <div {...qa('companies.card.loading')}>
                    <Loading loading={true} />
                </div>
            </Container>
        )
    }

    // ── ST-9 / ST-6: не найдена или ошибка (маскировка 404) ──
    if (!company || companyError) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('companies.card.notFound')}>
                        <p className="text-gray-500">Компания не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate(`/companies`)}
                            {...qa('companies.card.backToList')}
                        >
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
                {/* ST-23: запись в корзине */}
                {isTrashed && (
                    <AdaptiveCard className="border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                        <div
                            className="flex items-center justify-between gap-3"
                            {...qa('companies.card.trashedBanner')}
                        >
                            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                <PiTrashDuotone className="w-5 h-5" />
                                <span>
                                    Компания находится в корзине
                                    {company.deletedAt
                                        ? ` (удалена ${dayjs.unix(company.deletedAt).format('DD.MM.YYYY HH:mm')})`
                                        : ''}
                                </span>
                            </div>
                            {canWrite && (
                                <Button
                                    variant="solid"
                                    size="sm"
                                    icon={<PiArrowCounterClockwiseDuotone />}
                                    loading={restoring}
                                    onClick={() => void handleRestore()}
                                    {...qa('companies.card.restore')}
                                >
                                    Восстановить
                                </Button>
                            )}
                        </div>
                    </AdaptiveCard>
                )}

                {/* Мини-действия «позвонить/написать» в шапке (FR-MCOM-5): кнопки
                    рисовались всегда, но обработчики из карточки не приходили —
                    клик не делал ничего. Передаём только при наличии канала связи;
                    без обработчика кнопка больше не рендерится (см. виджет). */}
                <CompanyHeaderWidget
                    company={company}
                    onEdit={canWrite ? handleEdit : undefined}
                    onPrint={() => window.print()}
                    onCopyLink={() => {
                        const url = `${window.location.origin}/companies/${id}`
                        navigator.clipboard.writeText(url).then(() => toast.push('Ссылка скопирована'))
                    }}
                    onRequisitesCopy={() => {
                        const lines = requisiteLines(company)
                        if (lines.length > 0) {
                            navigator.clipboard.writeText(lines.join('\n')).then(() => toast.push('Реквизиты скопированы'))
                        }
                    }}
                    onDelete={canDelete && !isTrashed ? () => setDeleteOpen(true) : undefined}
                    onPhone={
                        company.phone
                            ? () => {
                                  window.location.href = `tel:${company.phone!.replace(/[^\d+]/g, '')}`
                              }
                            : undefined
                    }
                    onEmail={
                        company.email
                            ? () => {
                                  window.location.href = `mailto:${company.email}`
                              }
                            : undefined
                    }
                    isPinned
                />

                {/* Действия владельца (FR-MCOM-29) + аудит (FR-MCOM-32) + merge (FR-MCOM-8) */}
                {(canReassign || canMerge || company.createdBy || company.updatedBy) && (
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-gray-500">
                        <div {...qa('companies.card.audit')}>
                            {company.createdBy && (
                                <span className={company.updatedBy ? 'mr-4' : ''}>
                                    Создал: {company.createdBy},{' '}
                                    {dayjs.unix(company.createdAt).format('DD.MM.YYYY HH:mm')}
                                </span>
                            )}
                            {company.updatedBy && (
                                <span>
                                    Изменил: {company.updatedBy},{' '}
                                    {dayjs.unix(company.updatedAt).format('DD.MM.YYYY HH:mm')}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {canMerge && !isTrashed && (
                                <Button
                                    variant="plain"
                                    size="sm"
                                    icon={<PiArrowsMergeDuotone />}
                                    onClick={openMerge}
                                    {...qa('companies.card.merge')}
                                >
                                    Объединить дубль
                                </Button>
                            )}
                            {canReassign && !isTrashed && (
                                <Button
                                    variant="plain"
                                    size="sm"
                                    onClick={() => setReassignOpen(true)}
                                    {...qa('companies.card.reassign')}
                                >
                                    Переназначить владельца
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <CompanyHeaderStats
                    stats={headerStats ?? { dealsTotalAmount: 0, dealsWonAmount: 0, dealsCount: 0, ordersCount: 0, contactsCount: 0 }}
                    loading={cardLoading}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div
                        className="md:col-span-2 lg:col-span-2 flex flex-col min-h-0"
                        {...qa('companies.card.infoWidget')}
                    >
                        <CompanyInfoWidget
                            company={company}
                            contacts={contacts}
                            contactsTruncated={contactsTruncated}
                            onAddContact={() => setContactDrawerOpen(true)}
                            onContactClick={(contact) => navigate(`/contacts/${contact.id}`)}
                            onCompanyClick={(companyId) => navigate(`/companies/${companyId}`)}
                            onEditNotes={canWrite ? handleEdit : undefined}
                        />
                    </div>
                    <div
                        className="flex flex-col min-h-0 gap-4"
                        {...qa('companies.card.requisitesWidget')}
                    >
                        <CompanyRequisitesWidget
                            company={company}
                            onCopy={() => {
                                const lines = requisiteLines(company)
                                if (lines.length > 0) {
                                    navigator.clipboard.writeText(lines.join('\n')).then(() => toast.push('Реквизиты скопированы'))
                                }
                            }}
                        />
                        <HostSlot
                            id="company.card.sidebar"
                            context={{ companyId: company.id }}
                            className="flex flex-col gap-4 min-h-0"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col min-h-0" {...qa('companies.card.dealsWidget')}>
                        <CompanyDealsWidget
                            deals={deals}
                            onDealClick={(deal) => navigate(`/deals/${deal.id}`)}
                            loading={cardLoading}
                        />
                    </div>
                    <div className="flex flex-col min-h-0" {...qa('companies.card.ordersWidget')}>
                        <CompanyOrdersWidget
                            orders={orders}
                            onOrderClick={(order) => navigate(`/orders/${order.id}`)}
                            loading={cardLoading}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col min-h-0" {...qa('companies.card.historyWidget')}>
                        <CompanyHistoryWidget events={historyEvents} />
                    </div>
                    {/* FR-ACTIVITIES-150 / RFC-3 §1.2: mount-point `company.card.tab`.
                        Врезка «Активности» приезжает из модуля activities
                        (ActivityCardTab: хронология + «следующий шаг» + «+ Активность»),
                        если модуль включён в проекте и есть право. Иначе (модуль
                        выключен, standalone-режим) остаётся встроенный
                        read-only-таймлайн — дублирования на экране нет. */}
                    <div className="flex flex-col min-h-0" {...qa('companies.card.activitiesWidget')}>
                        <HostSlot
                            id="company.card.tab"
                            context={{ companyId: company.id }}
                            className="flex flex-col gap-4 min-h-0"
                            fallback={
                                <div {...qa('companies.card.activitiesFallback')}>
                                    <CompanyActivitiesWidget
                                        activities={currentActivities}
                                        onActivityClick={(activity) =>
                                            navigate(`/activities/${activity.id}`)
                                        }
                                        loading={cardLoading}
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
                                </div>
                            }
                        />
                    </div>
                </div>

                {/* FR-DOCS-300/400: врезка «Документы» по записи (тот же общий
                    компонент, что в карточках сделки и продажи). Права/пустое
                    состояние компонент обрабатывает сам. */}
                {documentsModuleEnabled && (
                    <AdaptiveCard>
                        <div {...qa('companies.card.documentsWidget')}>
                            <DocumentsTab contextType="company" recordId={company.id} />
                        </div>
                    </AdaptiveCard>
                )}
            </div>

            <EntityCreateDrawer
                entityType="contact"
                isOpen={contactDrawerOpen}
                onClose={() => setContactDrawerOpen(false)}
                onSuccess={() => mutate([`/v1/companies/${id}/card`, id, pid])}
                contactInitialData={id ? { companyId: id } : undefined}
            />

            {/* DLG-COMPANIES-DELETE */}
            <Dialog isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} onRequestClose={() => setDeleteOpen(false)}>
                <h5 className="mb-2" {...qa('companies.card.deleteDialog')}>
                    Удалить компанию?
                </h5>
                <p className="text-gray-500">
                    Компания «{company.name}» будет перемещена в корзину. Её можно восстановить позже.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setDeleteOpen(false)}
                        disabled={deleting}
                        {...qa('companies.card.deleteCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        onClick={handleDelete}
                        loading={deleting}
                        {...qa('companies.card.deleteConfirm')}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>

            {/* DLG-COMPANIES-REASSIGN */}
            <Dialog isOpen={reassignOpen} onClose={() => setReassignOpen(false)} onRequestClose={() => setReassignOpen(false)}>
                <h5 className="mb-4" {...qa('companies.card.reassignDialog')}>
                    Переназначить владельца
                </h5>
                <div {...qa('companies.card.reassignOwner')}>
                    <Select
                        placeholder="Выберите нового владельца"
                        options={memberOptions}
                        value={memberOptions.find((o) => o.value === reassignTo) || null}
                        onChange={(opt) => setReassignTo(opt?.value || '')}
                    />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setReassignOpen(false)}
                        disabled={reassigning}
                        {...qa('companies.card.reassignCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={handleReassign}
                        loading={reassigning}
                        disabled={!reassignTo}
                        {...qa('companies.card.reassignConfirm')}
                    >
                        Назначить
                    </Button>
                </div>
            </Dialog>

            {/* DLG-COMPANIES-MERGE — выбор дубля (loser) → SCR-COMPANIES-MERGE */}
            <Dialog isOpen={mergeOpen} onClose={() => setMergeOpen(false)} onRequestClose={() => setMergeOpen(false)}>
                <h5 className="mb-2" {...qa('companies.card.mergePickerDialog')}>
                    Объединить с дублем
                </h5>
                <p className="text-gray-500 text-sm mb-4">
                    «{company.name}» останется основной. Выберите компанию-дубль для слияния.
                </p>
                {mergeLoading ? (
                    <p className="text-gray-400 text-sm">Поиск дублей…</p>
                ) : mergeCandidates.length === 0 ? (
                    <p className="text-gray-400 text-sm" {...qa('companies.card.mergePickerEmpty')}>
                        Похожие компании не найдены. Дубли ищутся по ИНН, домену (из
                        e-mail/сайта) и названию внутри проекта.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {mergeCandidates.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors"
                                    onClick={() => {
                                        setMergeOpen(false)
                                        navigate(`/companies/merge?master=${id}&loser=${c.id}`)
                                    }}
                                    {...qa('companies.card.mergeCandidate', { company: c.id })}
                                >
                                    <div className="font-medium">{c.name}</div>
                                    {c.inn && <div className="text-xs text-gray-500">ИНН {c.inn}</div>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {!mergeLoading && mergeTrashedCount > 0 && (
                    <p className="text-xs text-gray-500 mt-3">
                        Ещё {mergeTrashedCount}{' '}
                        {pluralRu(
                            mergeTrashedCount,
                            'похожая запись',
                            'похожие записи',
                            'похожих записей',
                        )}{' '}
                        в корзине — объединить можно только активные.{' '}
                        <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => {
                                setMergeOpen(false)
                                navigate('/companies/trash')
                            }}
                            {...qa('companies.card.mergeOpenTrash')}
                        >
                            Открыть корзину
                        </button>
                    </p>
                )}
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setMergeOpen(false)}
                        {...qa('companies.card.mergePickerClose')}
                    >
                        Закрыть
                    </Button>
                </div>
            </Dialog>

            {/* DLG: коллизия ключа при восстановлении из корзины (company.md §3.11) */}
            <RestoreCollisionDialog
                isOpen={!!restoreCollision}
                companyName={company.name}
                collision={restoreCollision}
                value={restoreStrategy}
                submitting={restoring}
                onChange={setRestoreStrategy}
                onConfirm={() => {
                    if (restoreStrategy) void handleRestore(restoreStrategy)
                }}
                onClose={() => setRestoreCollision(null)}
            />
        </Container>
    )
}

export default CompanyDetails
