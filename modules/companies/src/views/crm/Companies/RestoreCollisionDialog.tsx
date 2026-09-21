import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { qa } from '../../../qa'

/**
 * Разрешение коллизии ключа идентичности при восстановлении компании из корзины
 * (контракт company.md §3.11).
 *
 * Домен (`companies.service.restore`) при живом дубле по identityHash кидает
 * `AppError('locked', …, { conflictId, options })` → gRPC FAILED_PRECONDITION →
 * gateway отдаёт HTTP 422 с `error.code = 'FAILED_PRECONDITION'` и
 * `error.details = { conflictId, options }`. Стратегия уходит обратно телом
 * `POST /v1/companies/:id/restore` (`{ strategy }`).
 *
 * Раньше фронт показывал только toast — восстановление такой компании было
 * тупиком, хотя домен и gateway стратегию уже поддерживали.
 */
export type RestoreStrategy = 'merge' | 'clear_key' | 'as_new'

export const ALL_RESTORE_STRATEGIES: RestoreStrategy[] = ['merge', 'clear_key', 'as_new']

const isRestoreStrategy = (v: unknown): v is RestoreStrategy =>
    typeof v === 'string' && (ALL_RESTORE_STRATEGIES as string[]).includes(v)

export const RESTORE_STRATEGY_LABELS: Record<
    RestoreStrategy,
    { title: string; hint: string }
> = {
    merge: {
        title: 'Объединить с активной компанией',
        hint: 'Данные из корзины перенесутся в активный дубль, отдельная запись не появится.',
    },
    clear_key: {
        title: 'Снять ключ дедупликации',
        hint: 'Компания вернётся как есть, но перестанет участвовать в контроле дублей по ИНН/домену.',
    },
    as_new: {
        title: 'Восстановить как отдельную компанию',
        hint: 'Запись вернётся рядом с активным дублем; объединить их можно позже вручную.',
    },
}

type ApiErrorEnvelope = {
    response?: {
        data?: {
            error?: {
                code?: string
                message?: string
                details?: { options?: unknown; conflictId?: string } | null
            }
        }
    }
}

export type RestoreCollision = {
    options: RestoreStrategy[]
    message?: string
    conflictId?: string
}

/**
 * Распознаёт ошибку восстановления как коллизию ключа. Возвращает `null`, если это
 * обычная ошибка (её показывает вызывающий код своим toast'ом).
 */
export const parseRestoreCollision = (e: unknown): RestoreCollision | null => {
    const apiError = (e as ApiErrorEnvelope)?.response?.data?.error
    if (apiError?.code !== 'FAILED_PRECONDITION') return null
    const raw = apiError.details?.options
    const options = Array.isArray(raw) ? raw.filter(isRestoreStrategy) : []
    return {
        // Список стратегий приходит от домена; полный набор — только запасной
        // вариант, если details потерялись по дороге.
        options: options.length > 0 ? options : ALL_RESTORE_STRATEGIES,
        message: apiError.message,
        conflictId: apiError.details?.conflictId,
    }
}

type RestoreCollisionDialogProps = {
    isOpen: boolean
    companyName?: string
    collision: RestoreCollision | null
    value: RestoreStrategy | null
    submitting?: boolean
    onChange: (strategy: RestoreStrategy) => void
    onConfirm: () => void
    onClose: () => void
}

const RestoreCollisionDialog = ({
    isOpen,
    companyName,
    collision,
    value,
    submitting = false,
    onChange,
    onConfirm,
    onClose,
}: RestoreCollisionDialogProps) => (
    <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose}>
        <h5 className="mb-2" {...qa('companies.restoreCollision.dialog')}>
            Есть активный дубль
        </h5>
        <p className="text-gray-500">
            {collision?.message ??
                'Активная компания уже занимает тот же ключ идентичности (ИНН/домен).'}
            {companyName ? ` Выберите, что сделать с записью «${companyName}».` : ''}
        </p>
        <div className="flex flex-col gap-2 mt-4">
            {(collision?.options ?? []).map((opt) => {
                const label = RESTORE_STRATEGY_LABELS[opt]
                const active = value === opt
                return (
                    <button
                        key={opt}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(opt)}
                        {...qa('companies.restoreCollision.strategy', { strategy: opt })}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                            active
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }`}
                    >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {label.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{label.hint}</div>
                    </button>
                )
            })}
        </div>
        <div className="flex justify-end gap-2 mt-6">
            <Button
                variant="plain"
                onClick={onClose}
                disabled={submitting}
                {...qa('companies.restoreCollision.cancel')}
            >
                Отмена
            </Button>
            <Button
                variant="solid"
                disabled={!value}
                loading={submitting}
                onClick={onConfirm}
                {...qa('companies.restoreCollision.confirm')}
            >
                Восстановить
            </Button>
        </div>
    </Dialog>
)

export default RestoreCollisionDialog
