import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { qa } from '@/shared/qa'
import { moduleEnableCascadeMessage, type EnableCascadeModule } from './moduleEnableCascadeMessage'

type PreviewState = {
    moduleId: string
    moduleName: string
    loading?: boolean
    error?: boolean
    cascadeModules: EnableCascadeModule[]
}

type Props = {
    preview: PreviewState | null
    onClose: () => void
    onConfirm: () => void
}

/** FR-PSET-050 — confirm hard-dependency cascade before enabling a module. */
export default function ModuleEnableCascadeDialog({ preview, onClose, onConfirm }: Props) {
    const isOpen = preview !== null
    const body =
        preview?.loading
            ? 'Загрузка влияния включения…'
            : preview
              ? moduleEnableCascadeMessage(preview.moduleName, preview.cascadeModules)
              : ''

    return (
        <ConfirmDialog
            {...qa('host.projectSettings.moduleEnable.dialog')}
            isOpen={isOpen}
            type="info"
            title={
                preview?.moduleName
                    ? `Включить модуль «${preview.moduleName}»?`
                    : 'Включить модуль?'
            }
            confirmText="Подтвердить включение"
            cancelText="Отмена"
            onClose={onClose}
            onRequestClose={onClose}
            onCancel={onClose}
            onConfirm={onConfirm}
            confirmButtonProps={{
                disabled: preview?.loading,
                ...qa('host.projectSettings.moduleEnable.confirm'),
            }}
            cancelButtonProps={qa('host.projectSettings.moduleEnable.cancel')}
        >
            <p
                className="text-sm text-gray-600 dark:text-gray-300"
                {...(preview?.loading ? qa('host.projectSettings.moduleEnable.loading') : {})}
            >
                {body}
            </p>
            {preview?.error && !preview.loading && (
                <p
                    className="mt-2 text-xs text-amber-600 dark:text-amber-400"
                    {...qa('host.projectSettings.moduleEnable.error')}
                >
                    Не удалось загрузить каскад зависимостей — включение возможно без предпросмотра.
                </p>
            )}
        </ConfirmDialog>
    )
}
