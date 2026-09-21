import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { qa } from '@/shared/qa'
import {
    moduleDisableImpactMessage,
    type DisableImpactAutomation,
    type DisableImpactModule,
} from './moduleDisableImpactMessage'

type PreviewState = {
    moduleId: string
    moduleName: string
    loading?: boolean
    error?: boolean
    dependentEnabledModules: DisableImpactModule[]
    unfinishedRecords: number
    stoppedAutomations: DisableImpactAutomation[]
    webhookDlqSuspended?: boolean
}

type Props = {
    preview: PreviewState | null
    onClose: () => void
    onConfirm: () => void
}

/**
 * FR-PSET-055 / SCR-PRJSET-MODULE-DISABLE-IMPACT — confirm before disabling any module.
 */
export default function ModuleDisableImpactDialog({ preview, onClose, onConfirm }: Props) {
    const isOpen = preview !== null
    const body =
        preview?.loading
            ? 'Загрузка последствий выключения…'
            : preview
              ? moduleDisableImpactMessage(
                    preview.moduleName,
                    preview.dependentEnabledModules,
                    preview.unfinishedRecords,
                    preview.stoppedAutomations,
                    preview.webhookDlqSuspended,
                )
              : ''

    return (
        <ConfirmDialog
            {...qa('host.projectSettings.moduleDisable.dialog')}
            isOpen={isOpen}
            type="warning"
            title={
                preview?.moduleName
                    ? `Выключить модуль «${preview.moduleName}»?`
                    : 'Выключить модуль?'
            }
            confirmText="Подтвердить выключение"
            cancelText="Отмена"
            onClose={onClose}
            onRequestClose={onClose}
            onCancel={onClose}
            onConfirm={onConfirm}
            confirmButtonProps={{
                disabled: preview?.loading,
                ...qa('host.projectSettings.moduleDisable.confirm'),
            }}
            cancelButtonProps={qa('host.projectSettings.moduleDisable.cancel')}
        >
            <p
                className="text-sm text-gray-600 dark:text-gray-300"
                {...(preview?.loading ? qa('host.projectSettings.moduleDisable.loading') : {})}
            >
                {body}
            </p>
            {preview?.error && !preview.loading && (
                <p
                    className="mt-2 text-xs text-amber-600 dark:text-amber-400"
                    {...qa('host.projectSettings.moduleDisable.error')}
                >
                    Не удалось загрузить полный превью-отчёт — показаны только известные последствия.
                </p>
            )}
        </ConfirmDialog>
    )
}
