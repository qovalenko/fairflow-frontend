import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import {
    PiBuildingsDuotone,
    PiGearDuotone,
    PiQuestion,
} from 'react-icons/pi'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import {
    apiGetOrganization,
    apiUpdateOrganization,
    apiCreateLogoUploadUrl,
    type OrganizationDetail,
} from '@/services/CrmService'
import toast from '@/components/ui/toast'
import { qa, qaWithAlias } from '@/shared/qa'

const orgRoleLabels: Record<string, string> = {
    platform_owner: 'Владелец',
    platform_admin: 'Администратор',
    employee: 'Сотрудник',
}

const orgRoleTagColors: Record<string, string> = {
    platform_owner:
        'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    platform_admin:
        'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    employee:
        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const requisitesFields: Array<{
    key: keyof OrganizationDetail
    label: string
    wide?: boolean
    type?: string
}> = [
    { key: 'name', label: 'Название организации' },
    { key: 'inn', label: 'ИНН' },
    { key: 'kpp', label: 'КПП' },
    { key: 'ogrn', label: 'ОГРН' },
    { key: 'legalAddress', label: 'Юридический адрес', wide: true },
    { key: 'actualAddress', label: 'Фактический адрес', wide: true },
    { key: 'phone', label: 'Телефон' },
    { key: 'email', label: 'Email', type: 'email' },
]

type RequisitesForm = Record<string, string>

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

function detailToForm(detail: OrganizationDetail): RequisitesForm {
    const form: RequisitesForm = {}
    for (const { key } of requisitesFields) {
        form[key as string] = (detail[key] as string | undefined) ?? ''
    }
    return form
}

const EmployeeReadOnlyView = ({ detail }: { detail: OrganizationDetail }) => (
    <AdaptiveCard>
        <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <PiBuildingsDuotone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
                <h3 className="text-lg font-semibold">{detail.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                    <Tag className={orgRoleTagColors[detail.role ?? 'employee']}>
                        {orgRoleLabels[detail.role ?? 'employee']}
                    </Tag>
                </div>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {requisitesFields
                .filter(({ key }) => key !== 'name' && detail[key])
                .map(({ key, label, wide }) => (
                    <div key={key as string} className={wide ? 'md:col-span-2' : ''}>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                            {label}
                        </label>
                        <p className="text-sm font-medium">
                            {detail[key] as string}
                        </p>
                    </div>
                ))}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            Для изменения настроек организации обратитесь к администратору.
        </p>
    </AdaptiveCard>
)

const OrgEditView = ({
    detail,
    isEditing,
    onEditingChange,
    onSaved,
}: {
    detail: OrganizationDetail
    isEditing: boolean
    onEditingChange: (value: boolean) => void
    onSaved: (updated: OrganizationDetail) => void
}) => {
    const [formData, setFormData] = useState<RequisitesForm>(() =>
        detailToForm(detail),
    )
    const [logoUrl, setLogoUrl] = useState(detail.logoUrl ?? '')
    const [isSaving, setIsSaving] = useState(false)
    const [isUploadingLogo, setIsUploadingLogo] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)

    // Re-seed the form whenever the source org changes or we (re-)enter edit mode.
    useEffect(() => {
        setFormData(detailToForm(detail))
        setLogoUrl(detail.logoUrl ?? '')
    }, [detail, isEditing])

    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    const handleCancel = () => {
        setSaveError(null)
        onEditingChange(false)
    }

    const handleSave = async () => {
        setSaveError(null)
        setIsSaving(true)
        try {
            const updated = await apiUpdateOrganization({
                name: formData.name,
                inn: formData.inn,
                kpp: formData.kpp,
                ogrn: formData.ogrn,
                legalAddress: formData.legalAddress,
                actualAddress: formData.actualAddress,
                phone: formData.phone,
                email: formData.email,
                logoUrl: logoUrl || undefined,
            })
            onSaved({ ...detail, ...updated, logoUrl: logoUrl || updated.logoUrl })
            onEditingChange(false)
        } catch (error) {
            console.error('Update organization failed:', error)
            setSaveError('Не удалось сохранить изменения. Попробуйте позже.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const allowed = [
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp',
            'image/svg+xml',
        ]
        if (!allowed.includes(file.type)) {
            toast.push(<span>Недопустимый формат (PNG/JPEG/WebP/SVG)</span>, {
                placement: 'top-center',
            })
            e.target.value = ''
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.push(<span>Файл слишком большой (макс. 5 МБ)</span>, {
                placement: 'top-center',
            })
            e.target.value = ''
            return
        }
        setIsUploadingLogo(true)
        try {
            const presigned = await apiCreateLogoUploadUrl({
                contentType: file.type,
                fileName: file.name,
                contentLength: file.size,
            })
            await fetch(presigned.uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': file.type },
                body: file,
            })
            setLogoUrl(presigned.logoUrl)
            const updated = await apiUpdateOrganization({ logoUrl: presigned.logoUrl })
            onSaved({ ...detail, ...updated, logoUrl: presigned.logoUrl })
            toast.push(<span>Логотип обновлён</span>, { placement: 'top-center' })
        } catch (err) {
            console.error('Logo upload failed:', err)
            toast.push(<span>Не удалось загрузить логотип</span>, {
                placement: 'top-center',
            })
        } finally {
            setIsUploadingLogo(false)
            e.target.value = ''
        }
    }

    if (!isEditing) {
        return (
            <Card>
                {logoUrl && (
                    <div className="mb-4">
                        <img
                            src={logoUrl}
                            alt="Логотип организации"
                            className="h-16 w-auto max-w-[200px] object-contain rounded"
                        />
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requisitesFields.map(({ key, label, wide }) => (
                        <div
                            key={key as string}
                            className={wide ? 'md:col-span-2' : ''}
                        >
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                {label}
                            </label>
                            <p className="text-sm font-medium">
                                {formData[key as string] || '—'}
                            </p>
                        </div>
                    ))}
                </div>
            </Card>
        )
    }

    return (
        <>
            <Card>
                <div className="mb-6 flex items-center gap-4">
                    {logoUrl ? (
                        <img
                            src={logoUrl}
                            alt="Логотип"
                            className="h-16 w-auto max-w-[200px] object-contain rounded border border-gray-200 dark:border-gray-700 p-2"
                        />
                    ) : (
                        <div className="h-16 w-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xs">
                            Нет
                        </div>
                    )}
                    <div>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={handleLogoChange}
                            {...qa('host.settings.profile.logoInput')}
                        />
                        <Button
                            variant="plain"
                            loading={isUploadingLogo}
                            onClick={() => logoInputRef.current?.click()}
                            {...qa('host.settings.profile.logoUpload')}
                        >
                            Загрузить логотип
                        </Button>
                        <p className="text-xs text-gray-500 mt-1">PNG/JPEG/WebP/SVG, до 5 МБ</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requisitesFields.map(({ key, label, wide, type }) => (
                        <div
                            key={key as string}
                            className={wide ? 'md:col-span-2' : ''}
                        >
                            <Input
                                type={type}
                                placeholder={label}
                                suffix={<HelpIcon title={label} />}
                                {...qa('host.settings.profile.field', { field: key as string })}
                                value={formData[key as string] ?? ''}
                                onChange={(e) =>
                                    handleChange(key as string, e.target.value)
                                }
                                {...qa('host.systemProfile.field', { key: key as string })}
                            />
                        </div>
                    ))}
                </div>
            </Card>

            {saveError && (
                <p
                    className="text-sm text-red-600 dark:text-red-400"
                    {...qaWithAlias('host.settings.profile.saveError', 'host.systemProfile.error')}
                >
                    {saveError}
                </p>
            )}

            <div className="flex justify-end gap-3">
                <Button
                    variant="plain"
                    onClick={handleCancel}
                    disabled={isSaving}
                    {...qa('host.settings.profile.cancel')}
                >
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={isSaving}
                    onClick={handleSave}
                    {...qa('host.settings.profile.save')}
                >
                    Сохранить
                </Button>
            </div>
        </>
    )
}

const SystemProfile = () => {
    const { system } = useWorkspaceRole()

    const [detail, setDetail] = useState<OrganizationDetail | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isEditingRequisites, setIsEditingRequisites] = useState(false)

    // EL-PROF-1/3 / P8-T4.3: редактирование реквизитов — `organization:manage`
    // от реальной орг-проекции (→ `org:profile:manage`, owner/admin по умолчанию).
    // Fail-closed при загрузке проекции (deny до ответа PDP).
    const canManageOrg = useOrgPermission()('organization', 'manage')

    useEffect(() => {
        let cancelled = false
        setIsLoading(true)
        setLoadError(null)
        apiGetOrganization()
            .then((res) => {
                if (!cancelled) setDetail(res)
            })
            .catch((error) => {
                console.error('Load organization failed:', error)
                if (!cancelled)
                    setLoadError('Не удалось загрузить данные организации.')
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const handleSaved = useCallback((updated: OrganizationDetail) => {
        setDetail(updated)
    }, [])

    // The system role drives whether requisites are editable (owner/admin)
    // or read-only (employee). Fall back to the workspace role while detail loads.
    const role = detail?.role ?? system?.role
    // P8-T4.3: реальная орг-проекция (`org:profile:manage`) — источник истины;
    // орг-роль оставлена как UX-страховка до готовности проекции (belt-and-braces).
    const isOwnerOrAdmin =
        (role === 'platform_owner' || role === 'platform_admin') && canManageOrg

    return (
        <SystemSettingsLayout>
            <div className="space-y-6">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold">Реквизиты</h2>
                    {detail && isOwnerOrAdmin && !isEditingRequisites && (
                        <button
                            type="button"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
                            title="Редактировать"
                            aria-label="Редактировать"
                            onClick={() => setIsEditingRequisites(true)}
                            {...qa('host.settings.profile.edit')}
                        >
                            <PiGearDuotone className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {isLoading && !detail && (
                    <div className="flex justify-center py-12">
                        <Spinner size={40} />
                    </div>
                )}

                {loadError && !detail && (
                    <p
                        className="text-sm text-red-600 dark:text-red-400"
                        {...qa('host.settings.profile.loadError')}
                    >
                        {loadError}
                    </p>
                )}

                {detail && isOwnerOrAdmin && (
                    <OrgEditView
                        detail={detail}
                        isEditing={isEditingRequisites}
                        onEditingChange={setIsEditingRequisites}
                        onSaved={handleSaved}
                    />
                )}

                {detail && !isOwnerOrAdmin && (
                    <EmployeeReadOnlyView detail={detail} />
                )}
            </div>
        </SystemSettingsLayout>
    )
}

export default SystemProfile
