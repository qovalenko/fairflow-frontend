import { useEffect, useState } from 'react'
import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Switcher from '@/components/ui/Switcher'
import Input from '@/components/ui/Input'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiGetContactsModuleSettings,
    apiPutContactsModuleSettings,
    DEFAULT_CONTACTS_MODULE_SETTINGS,
    type ContactsModuleSettings,
} from '@/services/CrmService'
import { qa } from './qa'

export interface ContactsSettingsTabProps {
    projectId?: string
    moduleDisabled?: boolean
}

const ContactsSettingsTab = (props: ContactsSettingsTabProps) => {
    const can = usePermission()
    const canManageProject = can('project', 'manage')
    const pid = props.projectId

    const settingsKey = pid ? ['/contacts/module-settings', pid] : null
    const { data: loaded, error, isLoading, mutate } = useSWR<ContactsModuleSettings>(
        settingsKey,
        () => apiGetContactsModuleSettings(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [form, setForm] = useState<ContactsModuleSettings>(DEFAULT_CONTACTS_MODULE_SETTINGS)
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (loaded) {
            setForm({ ...DEFAULT_CONTACTS_MODULE_SETTINGS, ...loaded })
            setDirty(false)
        }
    }, [loaded])

    if (props.moduleDisabled) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Модуль «Контакты» выключен в этом проекте.</p>
            </Card>
        )
    }

    if (!pid) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Проект не выбран.</p>
            </Card>
        )
    }

    if (!canManageProject) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Нужно право project:manage.</p>
            </Card>
        )
    }

    const save = async () => {
        setSaving(true)
        try {
            await apiPutContactsModuleSettings(pid, {
                ...loaded,
                ...form,
            })
            await mutate()
            setDirty(false)
            toast.push(<Notification type="success">Настройки контактов сохранены</Notification>, {
                placement: 'top-center',
            })
        } catch (err) {
            toast.push(
                <Notification type="danger">
                    {err instanceof Error ? err.message : 'Не удалось сохранить настройки'}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setSaving(false)
        }
    }

    if (isLoading) {
        return (
            <Card>
                <Skeleton height={120} />
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <p className="text-sm text-red-500" {...qa('contacts.settings.loadError')}>
                    Не удалось загрузить настройки контактов.
                </p>
            </Card>
        )
    }

    return (
        <Card {...qa('contacts.settings.form')}>
            <h4 className="text-base font-semibold mb-4">Настройки модуля «Контакты»</h4>
            <div className="flex flex-col gap-4 max-w-md">
                <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">Код страны (телефон)</label>
                    <Input
                        value={form.defaultCountry ?? ''}
                        onChange={(e) => {
                            setForm((f) => ({ ...f, defaultCountry: e.target.value }))
                            setDirty(true)
                        }}
                        placeholder="7"
                        {...qa('contacts.settings.defaultCountry')}
                    />
                </div>
                <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">TTL корзины (дней)</label>
                    <Input
                        type="number"
                        min={1}
                        value={form.trashTtlDays ?? ''}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            setForm((f) => ({ ...f, trashTtlDays: Number.isFinite(v) ? v : undefined }))
                            setDirty(true)
                        }}
                        {...qa('contacts.settings.trashTtlDays')}
                    />
                </div>
                <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">TTL тени слияния (дней)</label>
                    <Input
                        type="number"
                        min={1}
                        value={form.shadowTtlDays ?? ''}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10)
                            setForm((f) => ({ ...f, shadowTtlDays: Number.isFinite(v) ? v : undefined }))
                            setDirty(true)
                        }}
                        {...qa('contacts.settings.shadowTtlDays')}
                    />
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">Отслеживать drift связей с компаниями</span>
                    <Switcher
                        checked={form.driftDetectionEnabled !== false}
                        onChange={(checked) => {
                            setForm((f) => ({ ...f, driftDetectionEnabled: checked }))
                            setDirty(true)
                        }}
                        {...qa('contacts.settings.driftDetection')}
                    />
                </div>
                <Button
                    variant="solid"
                    loading={saving}
                    disabled={!dirty || saving}
                    onClick={save}
                    {...qa('contacts.settings.save')}
                >
                    Сохранить
                </Button>
            </div>
        </Card>
    )
}

export default ContactsSettingsTab
