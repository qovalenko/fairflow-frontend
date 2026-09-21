import { useCallback, useEffect, useState } from 'react'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import {
    apiDeactivateOidcProvider,
    apiListOidcProvidersAdmin,
    apiUpsertOidcProvider,
    type OidcProviderAdminRow,
    type UpsertOidcProviderPayload,
} from '@/services/SystemAuthService'
import { qa, qaWithAlias } from '@/shared/qa'

const emptyForm = (): UpsertOidcProviderPayload => ({
    id: '',
    name: '',
    issuer: '',
    clientId: '',
    clientSecret: '',
    discoveryUrl: '',
    scopes: ['openid', 'profile', 'email'],
    isActive: true,
    trustEmail: false,
})

/**
 * SCR-AUTH-OIDC-ADMIN — админ-настройка OIDC-провайдеров (FR-AUTH-357 / OQ-AUTH-120).
 * DB-провайдеры редактируются; env `OIDC_PROVIDERS` — только просмотр.
 */
const OidcProviders = () => {
    const { isSystemOwnerOrAdmin } = useWorkspaceRole()
    const [rows, setRows] = useState<OidcProviderAdminRow[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState<UpsertOidcProviderPayload>(emptyForm())
    const [editingId, setEditingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setRows(await apiListOidcProvidersAdmin())
        } catch {
            toast.push(
                <Notification type="danger" title="Не удалось загрузить провайдеры SSO" />,
            )
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const startEdit = (row: OidcProviderAdminRow) => {
        if (row.fromEnv) return
        setEditingId(row.id)
        setForm({
            id: row.id,
            name: row.name,
            issuer: row.issuer,
            clientId: row.clientId,
            clientSecret: '',
            discoveryUrl: row.discoveryUrl ?? '',
            scopes: row.scopes?.length ? row.scopes : ['openid', 'profile', 'email'],
            isActive: row.isActive,
            trustEmail: row.trustEmail ?? false,
        })
    }

    const resetForm = () => {
        setEditingId(null)
        setForm(emptyForm())
    }

    const submit = async () => {
        if (!form.id.trim() || !form.issuer.trim() || !form.clientId.trim()) {
            toast.push(<Notification type="warning" title="Заполните id, issuer и clientId" />)
            return
        }
        setSaving(true)
        try {
            await apiUpsertOidcProvider({
                ...form,
                id: form.id.trim(),
                name: form.name.trim() || form.id.trim(),
                issuer: form.issuer.trim(),
                clientId: form.clientId.trim(),
                clientSecret: form.clientSecret?.trim() || undefined,
                discoveryUrl: form.discoveryUrl?.trim() || undefined,
            })
            toast.push(<Notification type="success" title="Провайдер сохранён" />)
            resetForm()
            await load()
        } catch {
            toast.push(<Notification type="danger" title="Не удалось сохранить провайдер" />)
        } finally {
            setSaving(false)
        }
    }

    const deactivate = async (row: OidcProviderAdminRow) => {
        if (row.fromEnv) return
        setSaving(true)
        try {
            await apiDeactivateOidcProvider(row.id)
            toast.push(<Notification type="success" title="Провайдер отключён" />)
            await load()
        } catch {
            toast.push(<Notification type="danger" title="Не удалось отключить провайдер" />)
        } finally {
            setSaving(false)
        }
    }

    if (!isSystemOwnerOrAdmin) {
        return (
            <SystemSettingsLayout>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Недостаточно прав для настройки SSO.</p>
                </AdaptiveCard>
            </SystemSettingsLayout>
        )
    }

    return (
        <SystemSettingsLayout>
            <div className="space-y-6">
                <AdaptiveCard>
                    <h3 className="text-lg font-semibold mb-4">
                        {editingId ? 'Редактирование провайдера' : 'Новый провайдер'}
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                        <Input
                            placeholder="id (например keycloak)"
                            value={form.id}
                            disabled={Boolean(editingId)}
                            {...qa('host.oidcAdmin.id')}
                            onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                        />
                        <Input
                            placeholder="Название на экране входа"
                            value={form.name}
                            {...qa('host.oidcAdmin.name')}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                        <Input
                            className="md:col-span-2"
                            placeholder="Issuer URL"
                            value={form.issuer}
                            {...qa('host.oidcAdmin.issuer')}
                            onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
                        />
                        <Input
                            placeholder="Client ID"
                            value={form.clientId}
                            {...qa('host.oidcAdmin.clientId')}
                            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                        />
                        <Input
                            type="password"
                            placeholder={editingId ? 'Новый client secret (опционально)' : 'Client secret'}
                            value={form.clientSecret ?? ''}
                            {...qa('host.oidcAdmin.clientSecret')}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, clientSecret: e.target.value }))
                            }
                        />
                        <Input
                            className="md:col-span-2"
                            placeholder="Discovery URL (опционально)"
                            value={form.discoveryUrl ?? ''}
                            {...qa('host.oidcAdmin.discoveryUrl')}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, discoveryUrl: e.target.value }))
                            }
                        />
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.trustEmail ?? false}
                            disabled={Boolean(
                                rows.find((r) => r.id === form.id)?.fromEnv,
                            )}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, trustEmail: e.target.checked }))
                            }
                        />
                        Доверять email провайдера без claim email_verified (trustEmail)
                    </label>
                    <div className="mt-4 flex gap-2">
                        <Button variant="solid" loading={saving} onClick={() => void submit()} {...qa('host.oidcAdmin.save')}>
                            Сохранить
                        </Button>
                        {editingId && (
                            <Button variant="plain" onClick={resetForm}>
                                Отмена
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h3 className="text-lg font-semibold mb-4">Настроенные провайдеры</h3>
                    {loading ? (
                        <Spinner />
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-gray-500">Провайдеры не настроены.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 pr-4">ID</th>
                                        <th className="py-2 pr-4">Название</th>
                                        <th className="py-2 pr-4">Issuer</th>
                                        <th className="py-2 pr-4">Источник</th>
                                        <th className="py-2 pr-4">Статус</th>
                                        <th className="py-2">Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                            {...qaWithAlias('host.oidcAdmin.row', 'host.sso.provider')}
                                            {...qa('host.oidcAdmin.row', { provider: row.id, id: row.id })}
                                        >
                                            <td className="py-2 pr-4 font-mono">{row.id}</td>
                                            <td className="py-2 pr-4">{row.name}</td>
                                            <td className="py-2 pr-4 break-all">{row.issuer}</td>
                                            <td className="py-2 pr-4">
                                                {row.fromEnv ? (
                                                    <Tag className="bg-amber-100 text-amber-800">
                                                        env
                                                    </Tag>
                                                ) : (
                                                    <Tag className="bg-blue-100 text-blue-800">
                                                        БД
                                                    </Tag>
                                                )}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {row.isActive ? 'активен' : 'отключён'}
                                            </td>
                                            <td className="py-2 space-x-2">
                                                {!row.fromEnv && (
                                                    <>
                                                        <Button
                                                            size="xs"
                                                            variant="plain"
                                                            onClick={() => startEdit(row)}
                                                            {...qa('host.oidcAdmin.edit', { provider: row.id })}
                                                        >
                                                            Изменить
                                                        </Button>
                                                        {row.isActive && (
                                                            <Button
                                                                size="xs"
                                                                variant="plain"
                                                                onClick={() => void deactivate(row)}
                                                                {...qa('host.oidcAdmin.deactivate', { provider: row.id })}
                                                            >
                                                                Отключить
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </SystemSettingsLayout>
    )
}

export default OidcProviders
