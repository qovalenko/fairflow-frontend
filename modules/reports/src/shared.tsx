import {
    PiLockKeyDuotone,
    PiWarningCircleDuotone,
    PiChartBarDuotone,
    PiPlugsConnectedDuotone,
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

/** ST-17: модуль-источник пресета выключен (FAILED_PRECONDITION 409). */
export function isModuleDisabledError(e: unknown): boolean {
    return errCode(e) === 'FAILED_PRECONDITION' || httpStatus(e) === 409
}

/** ST-10: нет права на раздел. */
export const NoPermissionState = ({ message }: { message?: string }) => (
    <div className="text-center py-16" {...qa('reports.state.noPermission')}>
        <PiLockKeyDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Раздел недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {message ?? 'У вас нет прав для просмотра этого раздела.'}
        </p>
    </div>
)

/** ST-3 (контейнер): все модули-источники выключены → нет доступных отчётов. */
export const NoPresetsState = () => (
    <div className="text-center py-16" {...qa('reports.state.noPresets')}>
        <PiPlugsConnectedDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Нет доступных отчётов</p>
        <p className="text-sm text-gray-400 mt-1">
            Включите модули CRM (сделки, контакты, активности), чтобы видеть отчёты.
        </p>
    </div>
)

/** ST-3 (пресет): нет данных за период (НЕ ошибка). */
export const EmptyDataState = ({ message }: { message?: string }) => (
    <div className="text-center py-12" {...qa('reports.state.emptyData')}>
        <PiChartBarDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{message ?? 'Нет данных за период.'}</p>
    </div>
)

/** ST-4: фильтр сузил до 0 строк → есть кнопка сброса. */
export const EmptyFilterState = ({ onReset }: { onReset?: () => void }) => (
    <div className="text-center py-12" {...qa('reports.state.emptyFilter')}>
        <PiChartBarDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-3">Ничего не найдено по заданным фильтрам.</p>
        {onReset && (
            <Button variant="plain" onClick={onReset} {...qa('reports.main.resetFilter')}>
                Сбросить фильтр
            </Button>
        )}
    </div>
)

/** ST-17: источник пресета выключен в проекте. */
export const ModuleSourceDisabledState = ({ missing }: { missing?: string }) => (
    <div className="text-center py-12">
        <PiPlugsConnectedDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Отчёт недоступен</p>
        <p className="text-sm text-gray-400 mt-1">
            {missing
                ? `Модуль-источник «${missing}» выключен в этом проекте.`
                : 'Модуль-источник этого отчёта выключен в проекте.'}
        </p>
    </div>
)

/** ST-6 / ST-8: ошибка загрузки + повтор. */
export const ErrorState = ({
    message,
    onRetry,
}: {
    message?: string
    onRetry?: () => void
}) => (
    <div className="text-center py-16" {...qa('reports.state.error')}>
        <PiWarningCircleDuotone className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-600 dark:text-gray-300 font-medium">
            {message ?? 'Не удалось загрузить отчёт'}
        </p>
        {onRetry && (
            <Button size="sm" variant="solid" className="mt-3" onClick={onRetry} {...qa('reports.state.retry')}>
                Повторить
            </Button>
        )}
    </div>
)
