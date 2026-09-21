import { useCallback, useEffect, useState } from 'react'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import {
    apiListServiceApiKeys,
    serviceKeyExpiryBadge,
    type ServiceApiKeyRow,
} from '@/services/SystemAuthService'
import { qa } from '@/shared/qa'

const badgeLabel: Record<ReturnType<typeof serviceKeyExpiryBadge>, string> = {
    ok: 'активен',
    soon: 'истекает скоро',
    expired: 'истёк',
    none: 'без срока',
}

const badgeClass: Record<ReturnType<typeof serviceKeyExpiryBadge>, string> = {
    ok: 'bg-green-100 text-green-800',
    soon: 'bg-amber-100 text-amber-800',
    expired: 'bg-red-100 text-red-800',
    none: 'bg-gray-100 text-gray-700',
}

/** FR-AUTH-370 — реестр service-API-keys с датами истечения и последнего использования. */
const ServiceApiKeys = () => {
    const { isSystemOwnerOrAdmin } = useWorkspaceRole()
    const [rows, setRows] = useState<ServiceApiKeyRow[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setRows(await apiListServiceApiKeys())
        } catch {
            toast.push(
                <Notification type="danger" title="Не удалось загрузить реестр ключей" />,
            )
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    if (!isSystemOwnerOrAdmin) {
        return (
            <SystemSettingsLayout>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Недостаточно прав.</p>
                </AdaptiveCard>
            </SystemSettingsLayout>
        )
    }

    return (
        <SystemSettingsLayout>
            <AdaptiveCard>
                <p className="text-sm text-gray-500 mb-4">
                    Реестр служебных ключей gateway↔домены. Секреты не отображаются; при
                    приближении срока истечения auth публикует событие{' '}
                    <code className="text-xs">auth.service_key.expiring</code>.
                </p>
                {loading ? (
                    <Spinner />
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-500">Ключи не найдены.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-2 pr-4">Название</th>
                                    <th className="py-2 pr-4">Префикс</th>
                                    <th className="py-2 pr-4">Scopes</th>
                                    <th className="py-2 pr-4">Истекает</th>
                                    <th className="py-2 pr-4">Последнее использование</th>
                                    <th className="py-2">Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const badge = serviceKeyExpiryBadge(row.expiresAt)
                                    return (
                                        <tr
                                            key={row.id}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                            {...qa('host.serviceApiKeys.row', { id: row.id })}
                                        >
                                            <td className="py-2 pr-4">{row.name}</td>
                                            <td className="py-2 pr-4 font-mono">{row.keyPrefix}</td>
                                            <td className="py-2 pr-4">
                                                {(row.scopes ?? []).join(', ') || '—'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {row.expiresAt
                                                    ? new Date(row.expiresAt).toLocaleString('ru-RU')
                                                    : '—'}
                                            </td>
                                            <td className="py-2 pr-4">
                                                {row.lastUsedAt
                                                    ? new Date(row.lastUsedAt).toLocaleString('ru-RU')
                                                    : '—'}
                                            </td>
                                            <td className="py-2">
                                                <Tag className={badgeClass[badge]}>
                                                    {!row.isActive ? 'отозван' : badgeLabel[badge]}
                                                </Tag>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdaptiveCard>
        </SystemSettingsLayout>
    )
}

export default ServiceApiKeys
