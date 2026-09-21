import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { Activity, ActivityType } from '@/@types/crm'
import { qa } from '../qa'

export type CompleteFollowUpPayload = {
    title: string
    type: ActivityType
    dueDateMs?: number
}

type Props = {
    open: boolean
    source: Activity | null
    busy?: boolean
    onClose: () => void
    onConfirm: (payload: CompleteFollowUpPayload) => void | Promise<void>
}

const typeOptions = [
    { value: 'task', label: 'Задача' },
    { value: 'call', label: 'Звонок' },
    { value: 'meeting', label: 'Встреча' },
    { value: 'note', label: 'Заметка' },
]

/** FR-ACTIVITIES-210: built-in «завершить и поставить следующую» flow. */
const CompleteFollowUpDialog = ({ open, source, busy, onClose, onConfirm }: Props) => {
    const [title, setTitle] = useState('')
    const [type, setType] = useState<ActivityType>('task')
    const [dueDate, setDueDate] = useState('')

    const reset = () => {
        setTitle(source?.title ? `Follow-up: ${source.title}` : '')
        setType('task')
        const tomorrow = new Date(Date.now() + 86400000)
        setDueDate(tomorrow.toISOString().slice(0, 10))
    }

    return (
        <Dialog
            isOpen={open}
            onClose={onClose}
            onAfterOpen={reset}
            width={480}
        >
            <h5 className="mb-2 text-lg font-semibold">Завершить и запланировать следующую</h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Текущая активность будет завершена, затем создастся новая с теми же привязками и
                ответственным.
            </p>
            <div className="flex flex-col gap-3">
                <div>
                    <label className="mb-1 block text-sm font-medium">Название</label>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        {...qa('activities.followUp.title')}
                    />
                </div>
                <div {...qa('activities.followUp.type')}>
                    <label className="mb-1 block text-sm font-medium">Тип</label>
                    <Select
                        options={typeOptions}
                        value={typeOptions.find((o) => o.value === type) ?? typeOptions[0]}
                        onChange={(opt) => setType((opt?.value as ActivityType) ?? 'task')}
                    />
                </div>
                {type !== 'note' && (
                    <div>
                        <label className="mb-1 block text-sm font-medium">Срок</label>
                        <Input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            {...qa('activities.followUp.dueDate')}
                        />
                    </div>
                )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button
                    variant="plain"
                    onClick={onClose}
                    disabled={busy}
                    {...qa('activities.followUp.cancel')}
                >
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={busy}
                    disabled={!title.trim()}
                    onClick={() =>
                        void onConfirm({
                            title: title.trim(),
                            type,
                            dueDateMs: dueDate ? new Date(dueDate).getTime() : undefined,
                        })
                    }
                    {...qa('activities.followUp.confirm')}
                >
                    Завершить и создать
                </Button>
            </div>
        </Dialog>
    )
}

export default CompleteFollowUpDialog
