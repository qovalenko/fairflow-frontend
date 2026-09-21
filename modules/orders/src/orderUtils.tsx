import dayjs from 'dayjs'
import { useNavigate } from 'react-router'
import { PiPlugsDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { qa } from './qa'

/**
 * Общие хелперы модуля Продажи (orders).
 * Конвенции переиспользованы из deals/dealUtils — единый стиль toast/ошибок.
 */

/** Статусы продажи (FR-MORD §5.4). AS-IS-типы (active/completed/error) маппятся в TO-BE 5 статусов. */
export type OrderStatusKey =
    | 'ACTIVE'
    | 'SENDING'
    | 'DONE'
    | 'SEND_ERROR'
    | 'CANCELLED'
    // legacy AS-IS значения
    | 'active'
    | 'completed'
    | 'error'

export const ORDER_STATUS_CONFIG: Record<
    string,
    { label: string; className: string }
> = {
    ACTIVE: {
        label: 'Активна',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    SENDING: {
        label: 'Отправка…',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    DONE: {
        label: 'Оформлена',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
    SEND_ERROR: {
        label: '⚠ Ошибка отправки',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    CANCELLED: {
        label: 'Отменена',
        className: 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    },
    // legacy AS-IS
    active: {
        label: 'Активна',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    error: {
        label: '⚠ Ошибка отправки',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    completed: {
        label: 'Оформлена',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
}

export function orderStatusConfig(status: string) {
    return ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG.ACTIVE
}

/** Извлечь человекочитаемое сообщение из axios-ошибки (BFF error-envelope). */
export function extractError(err: unknown, fallback = 'Произошла ошибка'): string {
    const e = err as {
        response?: { data?: { error?: { message?: string; code?: string } } }
        message?: string
    }
    return e?.response?.data?.error?.message || e?.message || fallback
}

/**
 * 403 «раздел выключен» — модуль выключен в проекте (гейт guard'а).
 * Грациозная деградация (не ошибка каталога/ретрай): показываем чистый
 * стейт «модуль выключен» вместо «Не удалось загрузить … Повторить».
 *
 * Основной путь — код `MODULE_DISABLED`: `AppErrorFilter` больше не подменяет
 * явный код guard'а кодом из HTTP-статуса, поэтому он доезжает до фронта в обеих
 * формах конверта (плоской `data.code` и вложенной `data.error.code`).
 * Фолбэк по тексту («module … disabled» при 403) оставлен для старых стендов,
 * где ещё выкатан прежний фильтр с `PERMISSION_DENIED`.
 */
export function isModuleDisabledError(err: unknown): boolean {
    const e = err as {
        response?: {
            status?: number
            data?: {
                error?: { code?: string; message?: string }
                code?: string
                message?: string
            }
        }
    }
    const data = e?.response?.data
    const code = data?.error?.code ?? data?.code
    if (code === 'MODULE_DISABLED') return true
    const message = data?.error?.message ?? data?.message ?? ''
    return e?.response?.status === 403 && /module\b[^]*\bdisabled/i.test(message)
}

/**
 * TODO-416: единый «пустой» стейт для 403 MODULE_DISABLED (ST-17).
 *
 * Раньше ветка была только на экране типов продаж, а список/доска/карточка
 * показывали «Не удалось загрузить … Повторить» — ретрай при выключенном модуле
 * не поможет и вводит в заблуждение. CTA в настройки модулей показываем по тому
 * же праву, что проверит сервер (`project:manage`).
 */
export function ModuleDisabledNotice({ text }: { text: string }): React.ReactElement {
    const navigate = useNavigate()
    const can = usePermission()
    const pid = useCurrentProjectId()
    return (
        <div
            className="flex flex-col items-center justify-center py-16 text-center gap-3"
            {...qa('orders.shared.moduleDisabled')}
        >
            <PiPlugsDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
            <p className="font-semibold">Раздел выключен</p>
            <p className="text-gray-500 text-sm max-w-sm">{text}</p>
            {can('project', 'manage') && pid && (
                <Button
                    variant="solid"
                    color="primary"
                    className="mt-2"
                    {...qa('orders.shared.moduleDisabled.settings')}
                    onClick={() => navigate(`/p/${pid}/settings/modules`)}
                >
                    Настройки модулей
                </Button>
            )}
        </div>
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

/** Предупреждение: операция прошла, но результат неполный (напр. усечённая выгрузка). */
export function notifyWarning(message: string): void {
    toast.push(
        <Notification title="Внимание" type="warning">
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

/**
 * Нормализация метки времени orders → dayjs.
 *
 * Домен orders хранит и отдаёт временные метки в **миллисекундах** (Date.now()),
 * тогда как остальной CRM-FE традиционно ждёт unix-**секунды** (dayjs.unix).
 * Из-за этого прямой `dayjs.unix(stageChangedAt)` уезжал в ~55000 год и давал
 * «−20620770 дней в этапе». Хелпер эвристически различает секунды/миллисекунды
 * и защищает от null/0/NaN/невалида.
 *
 * Порог 1e11: любое значение ≥ 1e11 не может быть валидными unix-секундами
 * (это был бы ~5138 год), значит это миллисекунды. Реальные секунды сейчас ~1.7e9.
 */
export function toOrderDayjs(ts?: number | null): dayjs.Dayjs | null {
    if (ts == null) return null
    const n = Number(ts)
    if (!Number.isFinite(n) || n <= 0) return null
    const ms = n >= 1e11 ? n : n * 1000
    const d = dayjs(ms)
    return d.isValid() ? d : null
}

/** Формат метки времени orders → строка или прочерк «—» при невалиде. */
export function formatOrderDate(ts?: number | null, fmt = 'DD.MM.YYYY HH:mm'): string {
    const d = toOrderDayjs(ts)
    return d ? d.format(fmt) : '—'
}

/**
 * Количество полных дней в текущем этапе.
 * Возвращает `null` при отсутствующей/невалидной/будущей метке — рендер тогда «—»,
 * а не отрицательные миллионы (FE-гард FR-MORD-16).
 */
export function daysInStage(ts?: number | null): number | null {
    const d = toOrderDayjs(ts)
    if (!d) return null
    const days = dayjs().diff(d, 'day')
    if (!Number.isFinite(days) || days < 0) return null
    return days
}

/** Нормализация ответа списка ({list} | массив) к массиву. */
export function normalizeList<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    if (
        value &&
        typeof value === 'object' &&
        'items' in value &&
        Array.isArray((value as { items?: unknown }).items)
    ) {
        return (value as { items: T[] }).items
    }
    return []
}
