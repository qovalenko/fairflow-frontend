import { useNavigate } from 'react-router'
import { PiPlugsDuotone } from 'react-icons/pi'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Button from '@/components/ui/Button'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import type { AxiosError } from 'axios'
import { qa } from './qa'

type ApiErrorEnvelope = {
    error?: { code?: string; message?: string; httpStatus?: number }
    /** top-level code — guard может отдать код без обёртки error{} */
    code?: string
    module?: string
    message?: string
}

/** Extract a user-facing message + code from a rejected API call (product contract error envelope §3). */
export function extractApiError(err: unknown): { message: string; code?: string; status?: number } {
    const ax = err as AxiosError<ApiErrorEnvelope>
    const data = ax?.response?.data
    const status = ax?.response?.status
    if (data?.error) {
        return { message: data.error.message || 'Произошла ошибка', code: data.error.code, status }
    }
    if (data?.message) return { message: data.message, status }
    if (ax?.message) return { message: ax.message, status }
    return { message: 'Произошла ошибка', status }
}

/**
 * 403 «модуль выключен» — модуль «Продукты» выключен в проекте.
 * Это НЕ ошибка каталога (ST-6), а грациозная деградация (раздел недоступен).
 *
 * Канон: `{code:"MODULE_DISABLED", message:"Module \"products\" is disabled …"}`
 * — `AppErrorFilter` сохраняет явный код guard'а (раньше он затирался кодом из
 * HTTP-статуса, `PERMISSION_DENIED`) и дублирует конверт в плоской (`data.code`)
 * и вложенной (`data.error.code`) форме, поэтому проверяем обе.
 * Фолбэк по тексту «module … disabled» при 403 оставлен для стендов со старым
 * фильтром.
 */
export function isModuleDisabledError(err: unknown): boolean {
    const ax = err as AxiosError<ApiErrorEnvelope> | undefined
    const status = ax?.response?.status
    const data = ax?.response?.data
    const code = data?.error?.code ?? data?.code
    if (code === 'MODULE_DISABLED') return true
    // Фолбэк для старого фильтра: 403 c формулировкой «module … disabled».
    const message = data?.error?.message ?? data?.message ?? ''
    return status === 403 && /module\b[^]*\bdisabled/i.test(message)
}

/**
 * ST — грациозная деградация при выключенном модуле «Продукты».
 * Понятный стейт + CTA в настройки модулей для тех, у кого есть право
 * `project:manage`. Callers оборачивают её в Container/AdaptiveCard.
 */
export const ModuleDisabledState = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('project', 'manage')
    return (
        <div
            className="flex flex-col items-center justify-center py-16 text-center gap-3"
            {...qa('products.moduleDisabled')}
        >
            <PiPlugsDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
            <p className="font-semibold">Модуль «Продукты» выключен</p>
            <p className="text-gray-500 text-sm max-w-sm">
                Каталог продуктов станет доступен после включения модуля
                «Продукты» в настройках проекта.
            </p>
            {canManage && pid && (
                <Button
                    variant="solid"
                    color="primary"
                    className="mt-2"
                    onClick={() => navigate(`/p/${pid}/settings/modules`)}
                    {...qa('products.moduleDisabled.settings')}
                >
                    Настройки модулей
                </Button>
            )}
        </div>
    )
}

export function notifySuccess(message: string) {
    toast.push(
        <Notification type="success" duration={2500}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

export function notifyError(message: string) {
    toast.push(
        <Notification type="danger" duration={3500}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

/** Tag colour map for category chips (shared LIST/DETAILS/PRICING). */
export const categoryColors: Record<string, string> = {
    CRM: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    Аналитика: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    Интеграции: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    Поддержка: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    Консалтинг: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
}

export const categoryTagClass = (category?: string) =>
    (category && categoryColors[category]) || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'

const unitLabels: Record<string, string> = {
    'one-time': 'Разовый',
    monthly: 'Ежемесячно',
    yearly: 'Ежегодно',
}

/**
 * Backend returns `unit` as enum (ONE_TIME / MONTHLY / YEARLY); local/legacy data is kebab-case.
 * Normalise to one key (OQ-UX-PRODUCTS-2 рассинхрон unit) — otherwise the raw enum leaks into the UI.
 */
export const unitLabel = (unit?: string): string => {
    if (!unit) return ''
    const key = unit.toLowerCase().replace(/_/g, '-')
    return unitLabels[key] || unit
}

/** Normalise any incoming unit form to the proto enum (product contract §3.3 body `unit`). */
export const toUnitEnum = (unit?: string): 'ONE_TIME' | 'MONTHLY' | 'YEARLY' => {
    const key = (unit || 'one-time').toLowerCase().replace(/-/g, '_')
    if (key === 'monthly') return 'MONTHLY'
    if (key === 'yearly') return 'YEARLY'
    return 'ONE_TIME'
}

export const unitOptions = [
    { value: 'ONE_TIME', label: 'Разовый' },
    { value: 'MONTHLY', label: 'Ежемесячно' },
    { value: 'YEARLY', label: 'Ежегодно' },
]

export const formatPrice = (price: number, currency = 'RUB') =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(price ?? 0)
