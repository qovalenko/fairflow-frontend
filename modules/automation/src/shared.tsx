import dayjs from 'dayjs'
import { PiLockKeyDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import { qa } from './qa'

/** Достаёт человекочитаемое сообщение из axios-ошибки контракта. */
export function errMessage(e: unknown, fallback = 'Что-то пошло не так'): string {
    const err = e as {
        response?: { data?: { error?: { message?: string; code?: string } } }
    }
    return err?.response?.data?.error?.message ?? fallback
}

export function errCode(e: unknown): string | undefined {
    const err = e as { response?: { data?: { error?: { code?: string } } } }
    return err?.response?.data?.error?.code
}

export function httpStatus(e: unknown): number | undefined {
    const err = e as { response?: { status?: number } }
    return err?.response?.status
}

/** ST-10: нет права на раздел. */
export const NoPermissionState = ({ message }: { message?: string }) => (
    <div className="text-center py-16" {...qa('automation.shared.noPermission')}>
        <PiLockKeyDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {message ?? 'У вас нет прав для просмотра этого раздела.'}
        </p>
    </div>
)

/** ST-17: модуль выключен в проекте. */
export const ModuleDisabledState = () => (
    <div className="text-center py-16" {...qa('automation.shared.moduleDisabled')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            Модуль «Автоматизация» выключен в этом проекте. Правила сохранены.
        </p>
    </div>
)

/** ST-19/20: проект не выбран. */
export const NoProjectState = () => (
    <div className="text-center py-16" {...qa('automation.shared.noProject')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Проект не выбран</p>
        <p className="text-sm text-gray-400 mt-1">
            Выберите проект, чтобы работать с автоматизацией.
        </p>
    </div>
)

/** ST-6: ошибка загрузки + повтор. */
export const ErrorState = ({
    message,
    onRetry,
}: {
    message?: string
    onRetry?: () => void
}) => (
    <div className="text-center py-16" {...qa('automation.shared.error')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">
            {message ?? 'Не удалось загрузить данные'}
        </p>
        {onRetry && (
            <Button
                size="sm"
                variant="solid"
                className="mt-3"
                onClick={onRetry}
                {...qa('automation.shared.retry')}
            >
                Повторить
            </Button>
        )}
    </div>
)

/** ST-9: запись не найдена. */
export const NotFoundState = ({
    message,
    onBack,
    backLabel = 'К списку',
}: {
    message?: string
    onBack?: () => void
    backLabel?: string
}) => (
    <div className="text-center py-16" {...qa('automation.shared.notFound')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">
            {message ?? 'Запись не найдена или удалена.'}
        </p>
        {onBack && (
            <Button
                size="sm"
                variant="default"
                className="mt-3"
                onClick={onBack}
                {...qa('automation.shared.backToList')}
            >
                {backLabel}
            </Button>
        )}
    </div>
)

/**
 * ST-28 / S-COMMON-7: метка свежести производных данных (stats/journal/DLQ/breaker).
 * «Данные на HH:MM · может обновляться с задержкой».
 */
export const FreshnessLabel = ({ at }: { at?: number | null }) => {
    const ts = at ? dayjs(at) : dayjs()
    return (
        <span className="text-xs text-gray-400" {...qa('automation.shared.freshness')}>
            Данные на {ts.format('HH:mm')} · может обновляться с задержкой
        </span>
    )
}

/** ST-14/18/22: read-only баннер пространства/модуля/архива. */
export const ReadOnlyBanner = ({ message }: { message: string }) => (
    <div
        className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
        {...qa('automation.shared.readOnlyBanner')}
    >
        <p className="text-sm text-amber-700 dark:text-amber-300">{message}</p>
    </div>
)
