import {
    PiCalendarBlankDuotone,
    PiWarningCircleDuotone,
    PiLockKeyDuotone,
    PiFunnelXDuotone,
    PiArrowClockwiseDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import { qa } from '../qa'

/**
 * Состояния-плашки модуля «Активности» (каталог состояний SCREENS.md).
 * Переиспользуются списком/календарём/карточкой/вкладкой.
 *  - ST-3  EmptyState        — нет данных
 *  - ST-4  EmptyFilterState  — фильтр/поиск ничего не нашёл
 *  - ST-6  ErrorState        — не удалось загрузить + Retry
 *  - ST-10 NoPermissionState — нет права activities:read
 */

type PanelProps = {
    icon: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
    tone?: 'neutral' | 'danger'
    qaId?: string
}

const Panel = ({
    icon,
    title,
    description,
    action,
    tone = 'neutral',
    qaId,
}: PanelProps) => (
    <div
        className="flex flex-col items-center justify-center text-center py-12 px-4"
        {...(qaId ? qa(qaId) : {})}
    >
        <div
            className={
                'mb-4 flex h-14 w-14 items-center justify-center rounded-full ' +
                (tone === 'danger'
                    ? 'bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400')
            }
        >
            {icon}
        </div>
        <p className="text-base font-semibold text-gray-700 dark:text-gray-200">{title}</p>
        {description && (
            <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
    </div>
)

export const ActivityEmptyState = ({ onCreate }: { onCreate?: () => void }) => (
    <Panel
        qaId="activities.state.empty"
        icon={<PiCalendarBlankDuotone className="h-7 w-7" />}
        title="Пока нет активностей"
        description="Создайте задачу, звонок, встречу или заметку, чтобы спланировать следующий шаг."
        action={
            onCreate ? (
                <Button
                    variant="solid"
                    color="primary"
                    size="sm"
                    onClick={onCreate}
                    {...qa('activities.state.emptyCreate')}
                >
                    Создать активность
                </Button>
            ) : undefined
        }
    />
)

export const ActivityEmptyFilterState = ({ onReset }: { onReset?: () => void }) => (
    <Panel
        qaId="activities.state.emptyFilter"
        icon={<PiFunnelXDuotone className="h-7 w-7" />}
        title="Ничего не найдено"
        description="По выбранным фильтрам активностей нет. Измените условия или сбросьте фильтры."
        action={
            onReset ? (
                <Button
                    variant="default"
                    size="sm"
                    onClick={onReset}
                    {...qa('activities.state.filterReset')}
                >
                    Сбросить фильтры
                </Button>
            ) : undefined
        }
    />
)

export const ActivityErrorState = ({ onRetry }: { onRetry?: () => void }) => (
    <Panel
        tone="danger"
        qaId="activities.state.error"
        icon={<PiWarningCircleDuotone className="h-7 w-7" />}
        title="Не удалось загрузить активности"
        description="Проверьте соединение и попробуйте ещё раз."
        action={
            onRetry ? (
                <Button
                    variant="default"
                    size="sm"
                    icon={<PiArrowClockwiseDuotone />}
                    onClick={onRetry}
                    {...qa('activities.state.errorRetry')}
                >
                    Повторить
                </Button>
            ) : undefined
        }
    />
)

export const ActivityNoPermissionState = () => (
    <Panel
        qaId="activities.state.noPermission"
        icon={<PiLockKeyDuotone className="h-7 w-7" />}
        title="Недостаточно прав"
        description="У вас нет доступа к разделу «Активности». Обратитесь к администратору проекта."
    />
)

export default Panel
