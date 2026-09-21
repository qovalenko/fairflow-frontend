import {
    PiLockKeyDuotone,
    PiWarningCircleDuotone,
    PiMagnifyingGlassDuotone,
} from 'react-icons/pi'
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
export const NoPermissionState = ({
    message,
    qaId = 'search.state.noPermission',
}: {
    message?: string
    qaId?: string
}) => (
    <div className="text-center py-16" {...qa(qaId)}>
        <PiLockKeyDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {message ?? 'У вас нет прав для просмотра этого раздела.'}
        </p>
    </div>
)

/** ST-17: модуль выключен в проекте. */
export const ModuleDisabledState = () => (
    <div className="text-center py-16" {...qa('search.settings.moduleDisabled')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            Модуль «Поиск» выключен в этом проекте.
        </p>
    </div>
)

/** ST-19: проект не выбран. */
export const NoProjectState = () => (
    <div className="text-center py-16" {...qa('search.state.noProject')}>
        <PiMagnifyingGlassDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Проект не выбран</p>
        <p className="text-sm text-gray-400 mt-1">
            Поиск работает в рамках проекта. Выберите проект, чтобы продолжить.
        </p>
    </div>
)

/** ST-6: ошибка загрузки + повтор. */
export const ErrorState = ({
    message,
    code,
    onRetry,
    qaId = 'search.state.error',
    retryQaId = 'search.state.retry',
}: {
    message?: string
    code?: string
    onRetry?: () => void
    qaId?: string
    retryQaId?: string
}) => (
    <div className="text-center py-16" {...qa(qaId)}>
        <PiWarningCircleDuotone className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">
            {message ?? 'Не удалось загрузить данные'}
        </p>
        {code && <p className="text-xs text-gray-400 mt-1">Код: {code}</p>}
        {onRetry && (
            <Button
                size="sm"
                variant="solid"
                className="mt-3"
                onClick={onRetry}
                {...qa(retryQaId)}
            >
                Повторить
            </Button>
        )}
    </div>
)
