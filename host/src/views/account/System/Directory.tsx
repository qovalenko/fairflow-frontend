import { useEffect, useState } from 'react'
import { PiUsersDuotone } from 'react-icons/pi'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Spinner from '@/components/ui/Spinner'
import UserProfileLink from '@/components/shared/UserProfileLink'
import { initialsFromName } from '@/utils/displayName'
import { apiGetColleagueDirectory, type ColleagueDirectoryEntry } from '@/services/CrmService'
import { qa } from '@/shared/qa'

/**
 * FR-ORG-150 / SCR-MORG-DIRECTORY — colleague roster without HR-PII.
 * Uses the dedicated `/v1/system/colleagues` contract (not admin ListEmployees).
 */
const Directory = () => {
    const [rows, setRows] = useState<ColleagueDirectoryEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        setLoading(true)
        apiGetColleagueDirectory()
            .then((list) => {
                if (mounted) setRows(Array.isArray(list) ? list : [])
            })
            .catch(() => {
                if (mounted) setError('Не удалось загрузить директорию коллег')
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [])

    return (
        <SystemSettingsLayout activePath="/colleagues">
            <AdaptiveCard>
                <div className="flex items-center gap-2 mb-4">
                    <PiUsersDuotone className="text-xl text-primary" />
                    <h3 className="text-lg font-semibold">Коллеги</h3>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Справочник активных коллег: имя, должность, подразделение и руководитель.
                    Контактные данные (email, телефон) здесь не отображаются.
                </p>
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Spinner />
                    </div>
                ) : error ? (
                    <p className="text-sm text-red-500">{error}</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-500">Пока нет активных коллег в системе.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-2 pr-4 font-medium">Сотрудник</th>
                                    <th className="py-2 pr-4 font-medium">Должность</th>
                                    <th className="py-2 pr-4 font-medium">Подразделение</th>
                                    <th className="py-2 font-medium">Руководитель</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.userId}
                                        className="border-b border-gray-100 dark:border-gray-800"
                                        {...qa('host.colleagues.item', { id: row.userId })}
                                    >
                                        <td className="py-3 pr-4">
                                            <div className="flex items-center gap-3">
                                                {row.avatarUrl ? (
                                                    <img
                                                        src={row.avatarUrl}
                                                        alt=""
                                                        className="h-8 w-8 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold dark:bg-gray-700">
                                                        {initialsFromName(row.name || row.userId)}
                                                    </span>
                                                )}
                                                <UserProfileLink userId={row.userId}>
                                                    {row.name || row.userId}
                                                </UserProfileLink>
                                            </div>
                                        </td>
                                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                                            {row.position || '—'}
                                        </td>
                                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                                            {row.departmentName || '—'}
                                        </td>
                                        <td className="py-3 text-gray-700 dark:text-gray-300">
                                            {row.managerUserId ? (
                                                <UserProfileLink userId={row.managerUserId}>
                                                    {row.managerName || row.managerUserId}
                                                </UserProfileLink>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdaptiveCard>
        </SystemSettingsLayout>
    )
}

export default Directory
