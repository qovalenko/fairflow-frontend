import dayjs from 'dayjs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tag from '@/components/ui/Tag'
import type { Deal } from '@/@types/crm'

/** Effective lifecycle status of a deal. Falls back to legacy `result`. */
export function dealStatus(deal: Pick<Deal, 'status' | 'result'>): 'open' | 'won' | 'lost' {
    if (deal.status) return deal.status
    if (deal.result === 'won') return 'won'
    if (deal.result === 'lost') return 'lost'
    return 'open'
}

export function isClosed(deal: Pick<Deal, 'status' | 'result'>): boolean {
    return dealStatus(deal) !== 'open'
}

type OverdueSource = Pick<Deal, 'status' | 'result' | 'expectedCloseDate'>

/**
 * FR-MDEAL-96: сделка просрочена, если ожидаемая дата закрытия уже прошла,
 * а сделка всё ещё открыта. Поле `expectedCloseDate` (unix, сек.) BFF отдаёт
 * и в списке, и в канбане (dealFe) — отдельного запроса не нужно, признак
 * выводится на клиенте. Закрытые (won/lost) сделки просроченными не считаем.
 */
export function isOverdue(deal: OverdueSource): boolean {
    if (!deal.expectedCloseDate) return false
    if (dealStatus(deal) !== 'open') return false
    // Сравниваем по концу дня: дата закрытия «сегодня» ещё не просрочена.
    return dayjs.unix(deal.expectedCloseDate).endOf('day').isBefore(dayjs())
}

/** Дней просрочки (>= 1) — для подсказки на бейдже. */
export function overdueDays(deal: OverdueSource): number {
    if (!isOverdue(deal)) return 0
    return Math.max(1, dayjs().diff(dayjs.unix(deal.expectedCloseDate!).endOf('day'), 'day') + 1)
}

/** Единый бейдж «Просрочена» для списка и канбана. Ничего не рисует, если не просрочена. */
export function OverdueBadge({
    deal,
    className,
}: {
    deal: OverdueSource
    className?: string
}) {
    if (!isOverdue(deal)) return null
    const days = overdueDays(deal)
    return (
        <span className="inline-flex" title={`Просрочена на ${days} дн.`}>
            <Tag
                className={`bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 ${className ?? ''}`}
            >
                Просрочена
            </Tag>
        </span>
    )
}

/** FR-DEALS-180: server-computed days on stage, with client fallback. */
export function daysOnStageCount(deal: Pick<Deal, 'daysOnStage' | 'stageEnteredAt'>): number | null {
    if (typeof deal.daysOnStage === 'number' && Number.isFinite(deal.daysOnStage)) {
        return deal.daysOnStage
    }
    if (!deal.stageEnteredAt) return null
    return dayjs().diff(dayjs.unix(deal.stageEnteredAt), 'day')
}

/** Бейдж «Зависшая» — серверный isStalled (rottingDays стадии). */
export function StalledBadge({
    deal,
    className,
}: {
    deal: Pick<Deal, 'isStalled'>
    className?: string
}) {
    if (!deal.isStalled) return null
    return (
        <span className="inline-flex" title="Дольше rotting-порога стадии">
            <Tag
                className={`bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ${className ?? ''}`}
            >
                Зависшая
            </Tag>
        </span>
    )
}

export function formatCurrency(amount: number, currency = 'RUB'): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(amount)
}

/** Extract a human-readable message from an axios-style error (BFF error envelope). */
export function extractError(err: unknown, fallback = 'Произошла ошибка'): string {
    const e = err as {
        response?: { data?: { error?: { message?: string; code?: string } } }
        message?: string
    }
    return (
        e?.response?.data?.error?.message ||
        e?.message ||
        fallback
    )
}

export function notifySuccess(message: string): void {
    toast.push(
        <Notification title="Готово" type="success">
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

export function notifyError(message: string): void {
    toast.push(
        <Notification title="Ошибка" type="danger">
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

/* ───────────────────────── создание сделки ─────────────────────────
 * TODO-179 / FR-DEALS-010: «лёгкий» лид — сделка БЕЗ контакта в базе.
 * Контракт уже сквозной: BFF `POST /v1/deals` маппит lightName/lightPhone/
 * lightEmail/lightCompanyName в CreateDealRequest 15..18
 * (gateway/src/bff/crm-bff.controller.ts), домен пишет их в документ сделки
 * (pipe.service.createDeal), карточка их показывает (DealDetails), а
 * QualifyDealDialog превращает их в реальный контакт. Не хватало только формы
 * создания — она слала лишь contactId/companyId, и завести лид без контакта из
 * UI было нельзя.
 */

export type LeadMode = 'contact' | 'light'

export type DealCreateForm = {
    name: string
    amount: string
    pipelineId: string
    stageId: string
    contactId: string
    companyId: string
    productId: string
    source: string
    assigneeId: string
    expectedCloseDate: string
    lightName: string
    lightPhone: string
    lightEmail: string
    lightCompanyName: string
}

export const EMPTY_DEAL_FORM: DealCreateForm = {
    name: '',
    amount: '',
    pipelineId: '',
    stageId: '',
    contactId: '',
    companyId: '',
    productId: '',
    source: '',
    assigneeId: '',
    expectedCloseDate: '',
    lightName: '',
    lightPhone: '',
    lightEmail: '',
    lightCompanyName: '',
}

/**
 * Лид опознаваем, если известно хотя бы имя, телефон или e-mail: по телефону/
 * почте квалификация ищет дубли контактов, из имени собирает ФИО
 * (crm-bff.controller.ts `qualifyDeal`). Сделка вообще без этих полей —
 * «безымянный лид», квалифицировать её потом нечем, поэтому форму не пускаем.
 */
export function hasLightLeadIdentity(
    form: Pick<DealCreateForm, 'lightName' | 'lightPhone' | 'lightEmail'>,
): boolean {
    return Boolean(form.lightName.trim() || form.lightPhone.trim() || form.lightEmail.trim())
}

/**
 * Тело `POST /v1/deals` из состояния формы. Пустые поля не шлём (домен пишет
 * '' по умолчанию), режимы взаимоисключающие: в режиме «лид» связи с
 * контактом/компанией из базы не уходят, в режиме «контакт» — light-поля.
 */
export function buildCreateDealPayload(
    form: DealCreateForm,
    leadMode: LeadMode,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
    }
    if (form.pipelineId) payload.pipelineId = form.pipelineId
    if (form.stageId) payload.stageId = form.stageId
    if (form.productId) payload.productId = form.productId
    if (form.source) payload.source = form.source
    if (form.assigneeId) payload.assigneeId = form.assigneeId
    if (form.expectedCloseDate) {
        payload.expectedCloseDate = dayjs(form.expectedCloseDate).unix()
    }
    if (leadMode === 'light') {
        if (form.lightName.trim()) payload.lightName = form.lightName.trim()
        if (form.lightPhone.trim()) payload.lightPhone = form.lightPhone.trim()
        if (form.lightEmail.trim()) payload.lightEmail = form.lightEmail.trim()
        if (form.lightCompanyName.trim()) payload.lightCompanyName = form.lightCompanyName.trim()
    } else {
        if (form.contactId) payload.contactId = form.contactId
        if (form.companyId) payload.companyId = form.companyId
    }
    return payload
}

/* ──────────────────────── редактирование сделки ────────────────────────
 * TODO-385: снять связь со сделки. Контракт сквозной, кроме последнего шага:
 * поля UpdateDealRequest 7/8/14/15 объявлены `optional` (proto3 field presence,
 * proto/fairflow/pipe/v1/pipe.proto), домен по ЯВНОЙ пустой строке очищает
 * связь (`if (data.contact_id != null) u.contactId = data.contact_id`,
 * pipe.service.updateDeal), BFF тело не схлопывает и передаёт `body.contactId`
 * как есть (crm-bff.controller.ts updateDeal). А форма слала
 * `form.contactId || undefined` — ключ вылетал из JSON, до домена не доходил
 * ничего, и отвязать контакт/компанию/продукт/источник из UI было нельзя.
 *
 * Отсюда правило: «пусто в форме» ≠ «очистить». Пустую строку шлём только
 * если у сделки значение БЫЛО, — иначе поле просто не трогаем.
 */

export type DealEditForm = {
    name: string
    amount: string
    currency: string
    pipelineId: string
    stageId: string
    contactId: string
    companyId: string
    productId: string
    source: string
    assigneeId: string
    expectedCloseDate: string
    notes: string
}

/**
 * Поля, которые домен действительно умеет снимать пустой строкой. Список ровно
 * такой, как в pipe.service.updateDeal: name/currency/assigneeId по '' НЕ
 * обнуляются (сделка не остаётся без названия, валюты и владельца — правило
 * «нет бесхозных записей»), pipelineId/stageId с '' игнорируются, notes и так
 * уходят всегда.
 */
const CLEARABLE_DEAL_LINKS = ['contactId', 'companyId', 'productId', 'source'] as const

export type DealLinkSnapshot = Pick<Deal, (typeof CLEARABLE_DEAL_LINKS)[number] | 'expectedCloseDate'>

/**
 * Тело `PUT /v1/deals/:id` из состояния формы.
 * У закрытой сделки вороночные поля недоступны (FR-MDEAL-14) — уходят только
 * название и заметки, иначе домен ответит 409 DEAL_CLOSED.
 */
export function buildUpdateDealPayload(
    form: DealEditForm,
    original: DealLinkSnapshot,
    closed: boolean,
): Record<string, unknown> {
    if (closed) {
        return { name: form.name, notes: form.notes }
    }
    const payload: Record<string, unknown> = {
        name: form.name,
        amount: form.amount ? Number(form.amount) : 0,
        currency: form.currency,
        notes: form.notes,
    }
    if (form.pipelineId) payload.pipelineId = form.pipelineId
    if (form.stageId) payload.stageId = form.stageId
    if (form.assigneeId) payload.assigneeId = form.assigneeId
    if (form.expectedCloseDate) {
        payload.expectedCloseDate = dayjs(form.expectedCloseDate).unix()
    } else if (original.expectedCloseDate) {
        // int64: 0 — «дата снята» (isOverdue/рендер трактуют 0 как «нет даты»),
        // undefined оставил бы прежнюю дату навсегда.
        payload.expectedCloseDate = 0
    }
    for (const field of CLEARABLE_DEAL_LINKS) {
        const next = form[field]
        if (next) {
            payload[field] = next
        } else if (original[field]) {
            // Было значение, в форме пусто — это ОЧИСТКА, а не «не менял».
            payload[field] = ''
        }
    }
    return payload
}
