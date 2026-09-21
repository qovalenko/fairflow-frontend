import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import ApiService from '@/services/ApiService'
import ModuleSettingsForm from '@/views/crm/Settings/modules/ModuleSettingsForm'
import {
    ErrorState,
    NoPermissionState,
    NoProjectState,
    ModuleDisabledState,
    errMessage,
} from './settings-shared'
import { qa } from './qa'

export type DocumentsSettings = {
    folderView?: 'tree' | 'list'
    downloadTtlSec?: number
    storageProvider?: 's3' | 'minio'
    maxTemplateSizeBytes?: number
}

export const DEFAULT_DOCUMENTS_SETTINGS: DocumentsSettings = {
    folderView: 'tree',
    downloadTtlSec: 900,
    storageProvider: 's3',
    maxTemplateSizeBytes: 10 * 1024 * 1024,
}

// Оба блока уходят одним PUT в personalSettings (BFF не имеет
// setModuleIntegrationSettings). Ключи должны совпадать с
// module-registry.personalSettingsSchema, иначе sanitize их вырежет.
const PERSONAL_SCHEMA = { folderView: ['tree', 'list'], downloadTtlSec: 'number' }
const INTEGRATION_SCHEMA = {
    storageProvider: ['s3', 'minio'],
    maxTemplateSizeBytes: 'number',
}

async function apiGetDocumentsSettings(projectId: string): Promise<DocumentsSettings> {
    return ApiService.fetchDataWithAxios<DocumentsSettings>({
        url: `/projects/${projectId}/modules/documents/settings`,
        method: 'get',
    })
}

async function apiPutDocumentsSettings(
    projectId: string,
    settings: DocumentsSettings,
): Promise<DocumentsSettings> {
    return ApiService.fetchDataWithAxios<DocumentsSettings, DocumentsSettings>({
        url: `/projects/${projectId}/modules/documents/settings`,
        method: 'put',
        data: settings,
    })
}

export interface DocumentsSettingsTabProps {
    projectId?: string
    moduleDisabled?: boolean
}

/**
 * SCR-DOCUMENTS-SETTINGS — вкладка настроек модуля «Документы» в слоте
 * `project.settings.tab` (FR-DOCS-410 / FR-MOD-29).
 */
const DocumentsSettingsTab = (props: DocumentsSettingsTabProps) => {
    const currentPid = useCurrentProjectId()
    const pid = props.projectId ?? currentPid
    const can = usePermission()
    const canManageProject = can('project', 'manage')
    const canManageDocuments = can('documents', 'manage')

    const settingsKey = pid ? ['/documents/settings', pid] : null
    const { data: loaded, error, isLoading, mutate } = useSWR<DocumentsSettings>(
        settingsKey,
        () => apiGetDocumentsSettings(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const [personal, setPersonal] = useState<DocumentsSettings>(DEFAULT_DOCUMENTS_SETTINGS)
    const [integration, setIntegration] = useState<DocumentsSettings>(DEFAULT_DOCUMENTS_SETTINGS)
    const [personalErrors, setPersonalErrors] = useState<Record<string, string>>({})
    const [integrationErrors, setIntegrationErrors] = useState<Record<string, string>>({})
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!loaded) return
        setPersonal({
            folderView: loaded.folderView ?? DEFAULT_DOCUMENTS_SETTINGS.folderView,
            downloadTtlSec: loaded.downloadTtlSec ?? DEFAULT_DOCUMENTS_SETTINGS.downloadTtlSec,
        })
        setIntegration({
            storageProvider:
                loaded.storageProvider ?? DEFAULT_DOCUMENTS_SETTINGS.storageProvider,
            maxTemplateSizeBytes:
                loaded.maxTemplateSizeBytes ?? DEFAULT_DOCUMENTS_SETTINGS.maxTemplateSizeBytes,
        })
        setDirty(false)
    }, [loaded])

    const merged = useMemo(
        () => ({ ...personal, ...integration }),
        [personal, integration],
    )

    const valid =
        Object.keys(personalErrors).length === 0 &&
        Object.keys(integrationErrors).length === 0

    if (!pid) return <NoProjectState />
    if (props.moduleDisabled) return <ModuleDisabledState moduleName="Документы" />
    if (!canManageProject) return <NoPermissionState />

    const onSave = async () => {
        if (!valid) return
        setSaving(true)
        try {
            const saved = await apiPutDocumentsSettings(pid, merged)
            await mutate(saved, { revalidate: false })
            setDirty(false)
            toast.push(
                <Notification type="success" title="Настройки сохранены">
                    Параметры модуля «Документы» обновлены.
                </Notification>,
            )
        } catch (e) {
            toast.push(
                <Notification type="danger" title="Не удалось сохранить">
                    {errMessage(e)}
                </Notification>,
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
        return <ErrorState message={errMessage(error)} onRetry={() => mutate()} />
    }

    return (
        <Card {...qa('documents.settings.root')}>
            <div className="space-y-6">
                <div>
                    <h5 className="mb-3">Персональные настройки</h5>
                    <ModuleSettingsForm
                        schema={PERSONAL_SCHEMA}
                        qaScope="documents.settings.personal"
                        value={personal}
                        onChange={(next) => {
                            setPersonal(next as DocumentsSettings)
                            setDirty(true)
                        }}
                        onValidityChange={setPersonalErrors}
                    />
                </div>
                <div>
                    <h5 className="mb-3">Интеграционные настройки</h5>
                    <ModuleSettingsForm
                        schema={INTEGRATION_SCHEMA}
                        qaScope="documents.settings.integration"
                        value={integration}
                        onChange={(next) => {
                            if (!canManageDocuments) return
                            setIntegration(next as DocumentsSettings)
                            setDirty(true)
                        }}
                        onValidityChange={setIntegrationErrors}
                    />
                    {!canManageDocuments && (
                        <p
                            className="mt-2 text-sm text-gray-500 dark:text-gray-400"
                            {...qa('documents.settings.integrationReadOnly')}
                        >
                            Только просмотр: для изменения интеграционных параметров нужно право
                            documents:manage.
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="solid"
                        loading={saving}
                        disabled={!dirty || !valid || saving}
                        {...qa('documents.settings.save')}
                        onClick={onSave}
                    >
                        Сохранить
                    </Button>
                </div>
            </div>
        </Card>
    )
}

export default DocumentsSettingsTab
