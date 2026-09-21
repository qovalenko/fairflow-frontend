import { PiLockKeyDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import { qa } from '@/shared/qa'

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
    <div className="text-center py-16" {...qa('documents.state.noPermission')}>
        <PiLockKeyDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {message ?? 'У вас нет прав для просмотра этого раздела.'}
        </p>
    </div>
)

/** ST-17: модуль выключен в проекте. */
export const ModuleDisabledState = () => (
    <div className="text-center py-16" {...qa('documents.state.moduleDisabled')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            Модуль «Документы» выключен в этом проекте. Данные сохранены.
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
    <div className="text-center py-16" {...qa('documents.state.error')}>
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
                {...qa('documents.state.retry')}
            >
                Повторить
            </Button>
        )}
    </div>
)
