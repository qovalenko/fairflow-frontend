import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { qa } from '@/shared/qa'

export type DuplicateCheckDialogProps = {
    isOpen: boolean
    onClose: () => void
    /** Similar record found (e.g. same email/phone/INN). */
    similarRecord: { id: string; name: string; subtitle?: string; deleted?: boolean } | null
    entityLabel?: string
    onLink: () => void
    onCreateNew: () => void
}

export default function DuplicateCheckDialog({
    isOpen,
    onClose,
    similarRecord,
    entityLabel = 'запись',
    onLink,
    onCreateNew,
}: DuplicateCheckDialogProps) {
    if (!similarRecord) return null

    return (
        <Dialog isOpen={isOpen} onClose={onClose}>
            <div className="p-6" {...qa('host.globalCreate.duplicateDialog')}>
                <h4 className="text-lg font-semibold mb-4" {...qa('host.globalCreate.duplicateTitle')}>
                    Найдена похожая запись
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Обнаружена похожая запись в системе. Выберите действие:
                </p>
                <div
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 mb-6"
                    {...qa('host.globalCreate.duplicateRecord', {
                        record: similarRecord.id,
                        deleted: similarRecord.deleted ? 'true' : 'false',
                    })}
                >
                    <div className="font-medium">{similarRecord.name}</div>
                    {similarRecord.subtitle && (
                        <div className="text-sm text-gray-500 mt-1">{similarRecord.subtitle}</div>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => onClose()}
                        {...qa('host.globalCreate.duplicateCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={onLink}
                        {...qa('host.globalCreate.duplicateLink')}
                    >
                        Привязать к существующей
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={onCreateNew}
                        {...qa('host.globalCreate.duplicateCreateNew')}
                    >
                        Создать новую {entityLabel}
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}
