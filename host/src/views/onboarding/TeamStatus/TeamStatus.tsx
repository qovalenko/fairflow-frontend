import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { PiArrowClockwiseBold, PiWarningDuotone } from 'react-icons/pi'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiGetInvitations,
    apiResendInvitation,
    type OrgInvitation,
} from '@/services/CrmService'
import { qa, qaWithAlias } from '@/shared/qa'

type StatusFilter = 'all' | 'pending' | 'accepted' | 'revoked'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Все статусы' },
    { value: 'pending', label: 'Ожидает' },
    { value: 'accepted', label: 'Принято' },
    { value: 'revoked', label: 'Недействительно' },
]

const statusTag = (status: string) => {
    switch (status) {
        case 'accepted':
            return (
                <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Принято
                </Tag>
            )
        case 'pending':
            return (
                <Tag className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Ожидает
                </Tag>
            )
        case 'revoked':
        case 'expired':
            return (
                <Tag className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    Недействительно
                </Tag>
            )
        default:
            return <Tag>{status}</Tag>
    }
}

const fmtDate = (v?: string | number | null) => {
    if (!v) return '—'
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU')
}

/**
 * SCR-ONB-TEAM-STATUS — onboarding status of the team for a manager (FR-ONB-21).
 *
 * Hosted in org/project settings via the `project.settings.tab` host space
 * (M-2). Gated by `project:manage` (R3-E1-10) — a rank-and-file member sees a
 * no-permission stub (ST-10). Source: `control.Invitation` + `invitation.accepted`
 * event (FR-ONB-17).
 *
 * States: ST-1 (skeleton), ST-3 (no invitations + CTA), ST-4 (empty filter +
 * reset), ST-6 (load error + retry), ST-7/ST-29 (resend → toast + revalidate),
 * ST-10 (no-permission), ST-28 (eventual-lag note — accept status arrives via an
 * async event).
 *
 * Backend dependency: the columns "первый вход" / "первое продуктивное действие"
 * (EL-TS-4/7, OQ-UX-ONB-21) are NOT yet in the invitations contract — rendered
 * as "—" with a TODO until WM5-organization-be / event-audit expose them.
 */
const TeamStatus = () => {
    const can = usePermission()
    const [filter, setFilter] = useState<StatusFilter>('all')
    const [resendingId, setResendingId] = useState<string | null>(null)

    const canManage = can('project', 'manage')

    // box single-tenant: приглашения Системы — без orgId в ключе/запросе.
    const {
        data,
        error,
        isLoading,
        mutate,
    } = useSWR(
        canManage ? ['team-status'] : null,
        () => apiGetInvitations(),
        { revalidateOnFocus: false },
    )

    const invitations: OrgInvitation[] = useMemo(
        () => (Array.isArray(data) ? data : []),
        [data],
    )

    const filtered = useMemo(
        () =>
            filter === 'all'
                ? invitations
                : invitations.filter((i) => i.status === filter),
        [invitations, filter],
    )

    // ST-10 — no-permission: rank-and-file member; enforcement is server-side (M-5).
    if (!canManage) {
        return (
            <Card
                bodyClass="p-8 text-center"
                {...qa('host.onboarding.teamStatus.noPermission')}
            >
                <PiWarningDuotone className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                    Недостаточно прав
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Статус онбординга команды доступен управленцам проекта.
                </p>
            </Card>
        )
    }

    const resend = async (inv: OrgInvitation) => {
        setResendingId(inv.id)
        try {
            await apiResendInvitation(inv.id)
            await mutate()
            toast.push(
                <Notification
                    title="Приглашение отправлено повторно"
                    type="success"
                    {...qa('host.onboarding.teamStatus.toastResendSuccess')}
                >
                    {inv.email}
                </Notification>,
            )
        } catch {
            // ST-7 — resend error → toast; SWR keeps the prior list (rollback).
            toast.push(
                <Notification
                    title="Не удалось отправить"
                    type="danger"
                    {...qa('host.onboarding.teamStatus.toastResendError')}
                >
                    Попробуйте ещё раз.
                </Notification>,
            )
        } finally {
            setResendingId(null)
        }
    }

    return (
        <Card
            bodyClass="p-5"
            {...qaWithAlias(
                'host.projectSettings.teamStatus.root',
                'host.onboarding.teamStatus.card',
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        Статус онбординга команды
                    </h3>
                    {/* ST-28 — eventual lag of `invitation.accepted` (OQ-UX-ONB-27). */}
                    <p
                        className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
                        {...qa('host.onboarding.teamStatus.footnote')}
                    >
                        Статусы могут обновляться с небольшой задержкой
                    </p>
                </div>
                <div className="w-48" {...qa('host.onboarding.teamStatus.filter')}>
                    <Select<{ value: StatusFilter; label: string }>
                        {...qa('host.projectSettings.teamStatus.filter')}
                        size="sm"
                        value={STATUS_OPTIONS.find((o) => o.value === filter)}
                        options={STATUS_OPTIONS}
                        isSearchable={false}
                        onChange={(opt) => setFilter(opt?.value ?? 'all')}
                    />
                </div>
            </div>

            {/* ST-1 — skeleton */}
            {isLoading && (
                <div className="space-y-2" {...qa('host.onboarding.teamStatus.loading')}>
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} height={40} />
                    ))}
                </div>
            )}

            {/* ST-6 — load error + retry */}
            {!isLoading && error && (
                <div
                    className="py-8 text-center"
                    {...qaWithAlias(
                        'host.projectSettings.teamStatus.error',
                        'host.onboarding.teamStatus.error',
                    )}
                >
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Не удалось загрузить статус команды.
                    </p>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => mutate()}
                        {...qaWithAlias(
                            'host.projectSettings.teamStatus.retry',
                            'host.onboarding.teamStatus.retry',
                        )}
                    >
                        Повторить
                    </Button>
                </div>
            )}

            {/* ST-3 — no invitations at all */}
            {!isLoading && !error && invitations.length === 0 && (
                <div
                    className="py-10 text-center"
                    {...qaWithAlias(
                        'host.projectSettings.teamStatus.empty',
                        'host.onboarding.teamStatus.empty',
                    )}
                >
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        Приглашений ещё нет.
                    </p>
                    <Button
                        size="sm"
                        variant="solid"
                        onClick={() => {
                            window.location.href = '/account/projects/members'
                        }}
                        {...qaWithAlias(
                            'host.projectSettings.teamStatus.invite',
                            'host.onboarding.teamStatus.inviteCta',
                        )}
                    >
                        Пригласить
                    </Button>
                </div>
            )}

            {/* ST-4 — empty filter (data exists, filter excludes everything) */}
            {!isLoading &&
                !error &&
                invitations.length > 0 &&
                filtered.length === 0 && (
                    <div
                        className="py-10 text-center"
                        {...qaWithAlias(
                            'host.projectSettings.teamStatus.filterEmpty',
                            'host.onboarding.teamStatus.filterEmpty',
                        )}
                    >
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                            Нет участников по выбранному фильтру.
                        </p>
                        <Button
                            size="sm"
                            onClick={() => setFilter('all')}
                            {...qaWithAlias(
                                'host.projectSettings.teamStatus.filterReset',
                                'host.onboarding.teamStatus.filterReset',
                            )}
                        >
                            Сбросить фильтр
                        </Button>
                    </div>
                )}

            {/* Data table */}
            {!isLoading && !error && filtered.length > 0 && (
                <div
                    className="overflow-x-auto"
                    {...qaWithAlias(
                        'host.projectSettings.teamStatus.table',
                        'host.onboarding.teamStatus.table',
                    )}
                >
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                <th className="py-2 pr-3 font-medium">Эл. почта</th>
                                <th className="py-2 pr-3 font-medium">Статус</th>
                                <th className="py-2 pr-3 font-medium">Дата принятия</th>
                                <th className="py-2 pr-3 font-medium">Первый вход</th>
                                <th className="py-2 pr-3 font-medium" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((inv) => {
                                const stuck =
                                    inv.status === 'accepted' && !inv.acceptedUserId
                                return (
                                    <tr
                                        key={inv.id}
                                        className="border-b border-gray-50 dark:border-gray-800/50"
                                    >
                                        <td className="py-2.5 pr-3 text-gray-800 dark:text-gray-200">
                                            {inv.email}
                                            {/* EL-TS-5 — "stuck on §4.5" indicator */}
                                            {stuck && (
                                                <span
                                                    className="ml-2 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400"
                                                    {...qa(
                                                        'host.onboarding.teamStatus.stuckBadge',
                                                    )}
                                                >
                                                    <PiWarningDuotone className="w-3.5 h-3.5" />
                                                    завис
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-3">
                                            {statusTag(inv.status)}
                                        </td>
                                        <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                                            {inv.status === 'accepted'
                                                ? fmtDate(inv.createdAt)
                                                : '—'}
                                        </td>
                                        {/* EL-TS-4 — first login: TODO(be, OQ-UX-ONB-21) */}
                                        <td className="py-2.5 pr-3 text-gray-400 dark:text-gray-500">
                                            —
                                        </td>
                                        <td className="py-2.5 pr-3 text-right">
                                            {/* EL-TS-6 — resend (pending/revoked) */}
                                            {(inv.status === 'pending' ||
                                                inv.status === 'revoked') && (
                                                <Button
                                                    {...qaWithAlias(
                                                        'host.projectSettings.teamStatus.resend',
                                                        'host.onboarding.teamStatus.resend',
                                                    )}
                                                    {...qa(
                                                        'host.projectSettings.teamStatus.resend',
                                                        { invitation: inv.id },
                                                    )}
                                                    size="xs"
                                                    icon={<PiArrowClockwiseBold />}
                                                    loading={resendingId === inv.id}
                                                    onClick={() => resend(inv)}
                                                >
                                                    Повторно
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    )
}

export default TeamStatus
