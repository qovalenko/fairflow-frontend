import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { qa } from '@/shared/qa'
import { dealsDisableCascadeMessage, type DealsCascadeModule } from './dealsDisableCascadeMessage'

type PreviewState = {
    loading?: boolean
    error?: boolean
    cascadeModules: DealsCascadeModule[]
    openDealCount: number | null
}

type Props = {
    preview: PreviewState | null
    onClose: () => void
    onConfirm: () => void
}

/**
 * SCR-DEALS-DISABLE-CASCADE-DIALOG — host/ui-shell overlay before disabling deals.
 * Open-deal count is supplied by deals BFF (`GET /v1/deals/disable-cascade-preview`).
 */
export default function DealsDisableCascadeDialog({ preview, onClose, onConfirm }: Props) {
    const isOpen = preview !== null
    const body =
        preview?.loading
            ? 'Загрузка влияния выключения…'
            : preview
              ? dealsDisableCascadeMessage(preview.cascadeModules, preview.openDealCount)
              : ''

    return (
        <ConfirmDialog
            {...qa('host.projectSettings.dealsDisable.dialog')}
            isOpen={isOpen}
            type="warning"
            title="Выключить модуль «Сделки»?"
            confirmText="Подтвердить выключение"
            cancelText="Отмена"
            onClose={onClose}
            onRequestClose={onClose}
            onCancel={onClose}
            onConfirm={onConfirm}
            confirmButtonProps={{
                disabled: preview?.loading,
                ...qa('host.projectSettings.dealsDisable.confirm'),
            }}
            cancelButtonProps={qa('host.projectSettings.dealsDisable.cancel')}
        >
            <p
                className="text-sm text-gray-600 dark:text-gray-300"
                {...(preview?.loading ? qa('host.projectSettings.dealsDisable.loading') : {})}
            >
                {body}
            </p>
            {preview?.error && !preview.loading && (
                <p
                    className="mt-2 text-xs text-amber-600 dark:text-amber-400"
                    {...qa('host.projectSettings.dealsDisable.error')}
                >
                    Не удалось загрузить число открытых сделок — каскад модулей показан без счётчика.
                </p>
            )}
        </ConfirmDialog>
    )
}
