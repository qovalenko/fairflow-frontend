import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import {
    PiFolderDashedDuotone,
    PiUserDuotone,
    PiShieldCheckDuotone,
} from 'react-icons/pi'
import { useSessionUser } from '@/store/authStore'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { apiGetMyProjects, apiGetSystem } from '@/services/CrmService'
import { resolveLandingRoute } from '@/utils/resolveLandingRoute'
import { qa } from '@/shared/qa'
import type {
    OrganizationInfo,
    OrgRole,
    ProjectInfo,
    ProjectRole,
} from '@/@types/auth'

type RawProject = {
    id: string
    name: string
    color?: string
    owner_type?: string
    owner_id?: string
}

/**
 * SCR-ONB-NO-PROJECTS — informative dead-end stub for an employee of the System
 * without any assigned project (box invite-only, FR-ONB-13).
 *
 * Key no-dead-end screen (canon §4.5): NOT a 403 / white screen, but an "ask
 * your administrator" page with a contact + a Refresh CTA. Project creation is
 * deliberately absent (EL-NP-4) — server-side 403 is the source of truth (M-5);
 * FE hiding is UX only.
 *
 * States: ST-3 (intentional empty-state — the screen itself), ST-1/ST-2
 * (loading while Refresh re-runs bootstrap), ST-6 (degrade without org-admin
 * contact), ST-7 (refresh error → toast), ST-10/ST-12 (the actual reason — no
 * project rights; nav reduced to Profile/Security), ST-19, ST-21.
 */
const NoProjects = () => {
    const navigate = useNavigate()
    const user = useSessionUser((s) => s.user)
    const setUser = useSessionUser((s) => s.setUser)
    const userId = useSessionUser((s) => s.user.userId)
    const { system } = useWorkspaceRole()
    const [refreshing, setRefreshing] = useState(false)

    // EL-NP-2 — admin contact. OQ-UX-ONB-15: contract for the admin contact
    // (name/email) is a backend dependency (bootstrap ctx / system API). Until
    // it is exposed we degrade gracefully (ST-6): show the System name when
    // known, omit the contact otherwise — never crash.
    const orgName = system?.name
    type AdminContact = { name?: string; email?: string }
    // TODO(be, OQ-UX-ONB-15): wire the admin contact from bootstrap ctx / org API.
    // Cast keeps the render branch typed while the value is provisionally null.
    const adminContact = null as AdminContact | null

    const handleRefresh = async () => {
        if (!userId) {
            navigate('/', { replace: true })
            return
        }
        setRefreshing(true)
        try {
            // EL-NP-3 — re-evaluate ctx by refetching projects + System (bootstrap).
            const [projectsData, systemData] = await Promise.all([
                apiGetMyProjects<RawProject[]>({ userId }),
                apiGetSystem(),
            ])

            const projects: ProjectInfo[] = Array.isArray(projectsData)
                ? projectsData.map((p) => ({
                      id: p.id,
                      name: p.name,
                      color: p.color ?? '#6366f1',
                      // box single-tenant: проект всегда принадлежит Системе.
                      ownerType: 'ORGANIZATION' as const,
                      ownerId: p.owner_id ?? '',
                      role: 'member' as ProjectRole,
                  }))
                : user.projects ?? []

            const nextSystem: OrganizationInfo | null = systemData
                ? {
                      id: systemData.id,
                      name: systemData.name,
                      role: (systemData.role as OrgRole | undefined) ?? 'employee',
                  }
                : user.system ?? null

            const nextUser = {
                ...user,
                projects,
                system: nextSystem,
                systemRole: nextSystem?.role ?? user.systemRole,
            }
            setUser(nextUser)

            const target = resolveLandingRoute({
                hasProjects: projects.length > 0,
                canCreateProject:
                    nextSystem?.role === 'platform_owner' ||
                    nextSystem?.role === 'platform_admin',
                projects,
            })

            if (target.kind === 'project') {
                // A project was assigned — leave the dead-end (LANDING-RESOLVE).
                navigate('/', { replace: true })
                return
            }
            if (target.kind === 'entry-choice') {
                navigate('/onboarding', { replace: true })
                return
            }
            // Still no project (ST-7 branch C) — stay on this screen.
            toast.push(
                <Notification
                    title="Пока без изменений"
                    type="info"
                    {...qa('host.onboarding.noProjects.toastUnchanged')}
                >
                    Вы ещё не добавлены ни в один проект.
                </Notification>,
            )
        } catch {
            toast.push(
                <Notification
                    title="Не удалось обновить"
                    type="danger"
                    {...qa('host.onboarding.noProjects.toastError')}
                >
                    Попробуйте ещё раз чуть позже.
                </Notification>,
            )
        } finally {
            setRefreshing(false)
        }
    }

    return (
        <div className="relative z-10 max-w-2xl mx-auto py-10 px-4">
            <Card
                className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
                bodyClass="p-8 flex flex-col items-center text-center"
                {...qa('host.onboarding.noProjects.card')}
            >
                <PiFolderDashedDuotone className="w-16 h-16 text-gray-400 dark:text-gray-500 mb-5" />

                {/* EL-NP-1 — heading + explanation */}
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                    Вы ещё не добавлены ни в один проект
                </h1>
                <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed max-w-md">
                    Чтобы начать работу, вас должен добавить в проект администратор
                    {orgName ? (
                        <>
                            {' '}организации{' '}
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                                {orgName}
                            </span>
                        </>
                    ) : (
                        ' вашей организации'
                    )}
                    . Как только это произойдёт — нажмите «Обновить».
                </p>

                {/* EL-NP-2 — org-admin contact (degrades when absent, ST-6) */}
                {adminContact ? (
                    <div className="mt-6 w-full max-w-sm rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 text-left">
                        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                            Администратор
                        </p>
                        {adminContact.name && (
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {adminContact.name}
                            </p>
                        )}
                        {adminContact.email && (
                            <a
                                href={`mailto:${adminContact.email}`}
                                className="text-sm text-violet-600 dark:text-violet-400 underline underline-offset-2"
                            >
                                {adminContact.email}
                            </a>
                        )}
                    </div>
                ) : null}

                {/* EL-NP-3 — Refresh (re-run bootstrap, ST-1/ST-2/ST-7) */}
                <div className="mt-7 flex flex-col sm:flex-row gap-3 items-center">
                    <Button
                        variant="solid"
                        loading={refreshing}
                        onClick={handleRefresh}
                        {...qa('host.onboarding.noProjects.refresh')}
                    >
                        Обновить
                    </Button>
                    {refreshing && <Spinner size={20} />}
                </div>

                {/* EL-NP-5 — only Profile / Security (ST-12, minimalChrome).
                    EL-NP-4: "Create project" is intentionally NOT rendered (FR-ONB-13). */}
                <div className="mt-8 pt-6 w-full border-t border-gray-100 dark:border-gray-800 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                    <Link
                        to="/account/profile"
                        className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                        {...qa('host.onboarding.noProjects.profileLink')}
                    >
                        <PiUserDuotone className="w-4 h-4" /> Профиль
                    </Link>
                    <Link
                        to="/account/security"
                        className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                        {...qa('host.onboarding.noProjects.securityLink')}
                    >
                        <PiShieldCheckDuotone className="w-4 h-4" /> Безопасность
                    </Link>
                </div>
            </Card>
        </div>
    )
}

export default NoProjects
