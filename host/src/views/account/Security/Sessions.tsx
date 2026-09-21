import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
    PiDesktopDuotone,
    PiDeviceMobileDuotone,
    PiXBold,
} from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import {
    apiGetMySessions,
    apiRevokeSession,
    apiRevokeOtherSessions,
    type ActiveSession,
} from '@/services/AuthService'
import { normalizeApiError, isSessionRevoked } from '@/utils/apiError'
import { notify } from '@/utils/notify'
import { qa } from '@/shared/qa'

/**
 * Parse the raw User-Agent (`deviceLabel`) into a friendly label + device kind.
 * Best-effort, dependency-free — the goal is an honest, readable summary
 * (browser · OS), never a fake value. Falls back to the raw string, then to
 * «Неизвестное устройство» only when the backend truly sent nothing.
 */
function parseDeviceLabel(ua?: string): {
    label: string
    kind: 'mobile' | 'tablet' | 'desktop'
} {
    const raw = (ua ?? '').trim()
    if (!raw || raw.toLowerCase() === 'unknown device') {
        return { label: 'Неизвестное устройство', kind: 'desktop' }
    }
    const isTablet = /iPad|Tablet/i.test(raw)
    const isMobile = !isTablet && /Mobile|Android|iPhone|iPod/i.test(raw)
    const kind = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

    let browser = ''
    if (/Edg\//i.test(raw)) browser = 'Edge'
    else if (/OPR\/|Opera/i.test(raw)) browser = 'Opera'
    else if (/YaBrowser/i.test(raw)) browser = 'Yandex Browser'
    else if (/Firefox\//i.test(raw)) browser = 'Firefox'
    else if (/Chrome\//i.test(raw)) browser = 'Chrome'
    else if (/Safari\//i.test(raw)) browser = 'Safari'

    let os = ''
    if (/Windows/i.test(raw)) os = 'Windows'
    else if (/Android/i.test(raw)) os = 'Android'
    else if (/iPhone|iPad|iPod|CPU OS|iOS/i.test(raw)) os = 'iOS'
    else if (/Mac OS X|Macintosh/i.test(raw)) os = 'macOS'
    else if (/Linux/i.test(raw)) os = 'Linux'

    const label = [browser, os].filter(Boolean).join(' · ')
    // Fallback: show a trimmed raw UA rather than a fake «unknown».
    return { label: label || raw.slice(0, 60), kind }
}

/** Human-readable «last seen» from an ISO timestamp. */
function formatLastSeen(iso?: string): string {
    if (!iso) return ''
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return ''
    const diff = Date.now() - t
    const min = Math.round(diff / 60000)
    if (min < 1) return 'только что'
    if (min < 60) return `${min} мин назад`
    const h = Math.round(min / 60)
    if (h < 24) return `${h} ч назад`
    const d = Math.round(h / 24)
    if (d < 7) return `${d} дн назад`
    return new Date(t).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
}

/**
 * SCR-MPROF-SESSIONS — активные сессии (FR-MPROF, BR-MPROF-18).
 * Replaces mockSessions: real list + revoke / revoke-others; states ST-1 loading,
 * ST-3 empty, ST-6 load error, ST-7 action error, ST-29 success, ST-21 revoked.
 */
const Sessions = () => {
    const navigate = useNavigate()
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    const [sessions, setSessions] = useState<ActiveSession[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const [revokingAll, setRevokingAll] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(false)
        try {
            const resp = await apiGetMySessions()
            setSessions(resp?.sessions ?? [])
        } catch {
            setLoadError(true)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    const handleEndSession = async (id: string) => {
        setRevokingId(id)
        try {
            await apiRevokeSession(id)
            setSessions((prev) => prev.filter((s) => s.id !== id))
            notify('Сессия завершена', 'success') // ST-29
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            notify(err.message, 'danger') // ST-7
        } finally {
            setRevokingId(null)
        }
    }

    const handleEndAll = async () => {
        setRevokingAll(true)
        try {
            const resp = await apiRevokeOtherSessions()
            setSessions((prev) => prev.filter((s) => s.isCurrent))
            notify(
                resp?.revoked
                    ? `Завершено сессий: ${resp.revoked}`
                    : 'Прочие сессии завершены',
                'success',
            )
        } catch (e) {
            notify(normalizeApiError(e).message, 'danger')
        } finally {
            setRevokingAll(false)
        }
    }

    const hasOthers = sessions.some((s) => !s.isCurrent)

    return (
        <AccountLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold" {...qa('host.sessions.heading')}>
                        Активные сессии
                    </h2>
                    {canManage && hasOthers && (
                        <Button
                            variant="plain"
                            color="red"
                            loading={revokingAll}
                            onClick={handleEndAll}
                            {...qa('host.sessions.revokeAll')}
                        >
                            Завершить все кроме текущей
                        </Button>
                    )}
                </div>

                {loadError ? (
                    <AdaptiveCard>
                        <Alert
                            showIcon
                            type="danger"
                            className="flex items-center justify-between"
                            {...qa('host.sessions.loadError')}
                        >
                            <span>Не удалось загрузить сессии.</span>
                            <Button size="xs" onClick={load} {...qa('host.sessions.retry')}>
                                Повторить
                            </Button>
                        </Alert>
                    </AdaptiveCard>
                ) : loading ? (
                    <AdaptiveCard>
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="h-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
                                />
                            ))}
                        </div>
                    </AdaptiveCard>
                ) : sessions.length === 0 ? (
                    // ST-3 empty (should at least show the current one; defensive)
                    <AdaptiveCard>
                        <p className="text-sm text-gray-500 text-center py-8" {...qa('host.sessions.empty')}>
                            Активных сессий не найдено.
                        </p>
                    </AdaptiveCard>
                ) : (
                    <AdaptiveCard>
                        <div className="space-y-4">
                            {sessions.map((session) => {
                                const parsed = parseDeviceLabel(
                                    session.deviceLabel,
                                )
                                const lastSeen = formatLastSeen(
                                    session.lastSeenAt,
                                )
                                return (
                                <div
                                    key={session.id}
                                    className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                    {...qa('host.sessions.row', { session: session.id, id: session.id })}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                            {parsed.kind === 'mobile' ||
                                            parsed.kind === 'tablet' ? (
                                                <PiDeviceMobileDuotone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                            ) : (
                                                <PiDesktopDuotone className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium" {...qa('host.sessions.deviceLabel')}>
                                                    {parsed.label}
                                                </span>
                                                {session.isCurrent && (
                                                    <Tag
                                                        className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs"
                                                        {...qa('host.sessions.currentTag')}
                                                    >
                                                        Текущая
                                                    </Tag>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-600 dark:text-gray-400 space-x-2">
                                                {session.ip && (
                                                    <span>{session.ip}</span>
                                                )}
                                                {session.location && (
                                                    <>
                                                        <span>•</span>
                                                        <span>
                                                            {session.location}
                                                        </span>
                                                    </>
                                                )}
                                                {lastSeen && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{lastSeen}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {!session.isCurrent && canManage && (
                                        <Button
                                            variant="plain"
                                            color="red"
                                            size="sm"
                                            loading={revokingId === session.id}
                                            icon={<PiXBold />}
                                            onClick={() =>
                                                handleEndSession(session.id)
                                            }
                                            {...qa('host.sessions.revoke', { session: session.id, id: session.id })}
                                        >
                                            Завершить
                                        </Button>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                    </AdaptiveCard>
                )}
            </div>
        </AccountLayout>
    )
}

export default Sessions
