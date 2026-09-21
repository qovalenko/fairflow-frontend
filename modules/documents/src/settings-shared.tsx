import {
    PiLockKeyDuotone,
    PiWarningCircleDuotone,
    PiFilesDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import { qa } from './qa'

export function errMessage(e: unknown, fallback = 'Что-то пошло не так'): string {
    const err = e as {
        response?: { data?: { error?: { message?: string; code?: string } } }
    }
    return err?.response?.data?.error?.message ?? fallback
}

export const NoPermissionState = ({ message }: { message?: string }) => (
    <div className="text-center py-16" {...qa('documents.settings.noPermission')}>
        <PiLockKeyDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {message ?? 'У вас нет прав для просмотра этого раздела.'}
        </p>
    </div>
)

export const ModuleDisabledState = ({ moduleName = 'Документы' }: { moduleName?: string }) => (
    <div className="text-center py-16" {...qa('documents.settings.moduleDisabled')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            Модуль «{moduleName}» выключен в этом проекте.
        </p>
    </div>
)

export const NoProjectState = () => (
    <div className="text-center py-16" {...qa('documents.settings.noProject')}>
        <PiFilesDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Проект не выбран</p>
        <p className="text-sm text-gray-400 mt-1">
            Настройки модуля доступны в контексте проекта.
        </p>
    </div>
)

export const ErrorState = ({
    message,
    onRetry,
}: {
    message?: string
    onRetry?: () => void
}) => (
    <div className="text-center py-16" {...qa('documents.settings.error')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">
            {message ?? 'Не удалось загрузить настройки'}
        </p>
        {onRetry && (
            <Button
                size="sm"
                variant="solid"
                className="mt-3"
                onClick={onRetry}
                {...qa('documents.settings.retry')}
            >
                Повторить
            </Button>
        )}
    </div>
)
