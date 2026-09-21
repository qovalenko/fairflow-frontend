import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Progress from '@/components/ui/Progress'
import Spinner from '@/components/ui/Spinner'
import { PiCheckCircleFill, PiCircleDuotone, PiXBold } from 'react-icons/pi'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import usePermission from '@/utils/hooks/usePermission'
import OnboardingProgress from '@/views/onboarding/OnboardingProgress'
import { qa, qaWithAlias } from '@/shared/qa'
import {
    apiGetContacts,
    apiGetDeals,
    apiGetInvitations,
    type OrgInvitation,
} from '@/services/CrmService'

type ChecklistItemId = 'contact' | 'deal' | 'invite'

type ChecklistItem = {
    id: ChecklistItemId
    label: string
    hint: string
    /** Action verb on the CTA button (ссылка на действие). */
    cta: string
    to: string
    /** Contextual UI: module that must be enabled for the item to show (ST-17). */
    module?: string
    /** Permission gate `subject:action` (ST-11/12). */
    requires?: string
}

const ITEMS: ChecklistItem[] = [
    {
        id: 'contact',
        label: 'Добавить первый контакт',
        hint: 'Заведите клиента или партнёра, чтобы вести историю общения',
        cta: 'Добавить',
        to: '/contacts',
        module: 'contacts',
        requires: 'contacts:write',
    },
    {
        id: 'deal',
        label: 'Создать первую сделку',
        hint: 'Заведите сделку и ведите её по стадиям воронки',
        cta: 'Создать',
        to: '/deals',
        module: 'deals',
        requires: 'deals:write',
    },
    {
        id: 'invite',
        label: 'Пригласить коллегу',
        hint: 'Добавьте участников, чтобы работать над проектом вместе',
        cta: 'Пригласить',
        to: '/account/projects/members',
    },
]

const STORAGE_PREFIX = 'ff.onboardingChecklist.'
const DISMISS_AFTER_MS = 7 * 24 * 60 * 60 * 1000 // 7 days (FR-ONB-14)

/** Persisted per-project meta — progress itself is derived from real data. */
type ChecklistMeta = {
    firstSeen: number
    dismissed?: boolean
}

/**
 * SCR-ONB-CHECKLIST — post-onboarding "first steps" widget (FR-ONB-14).
 *
 * Host-only kernel widget rendered on the dashboard (`dashboard.widget` host
 * space; B-ONB-1). NOT a remote contribution — the host mounts it directly so it
 * needs no module manifest (OQ-UX-ONB-1/17).
 *
 * Progress is DERIVED FROM REAL DATA (BX-10), not a manual checkbox: a step is
 * done once the corresponding record actually exists —
 *  - «контакт»  → в проекте есть хотя бы один контакт (`/v1/contacts`);
 *  - «сделка»   → в проекте есть хотя бы одна сделка (`/v1/deals`);
 *  - «коллега»  → по организации есть отправленное приглашение (`invitations`).
 * localStorage хранит только «скрыт»/«впервые показан» (7-дневное авто-скрытие),
 * а не сам прогресс — поэтому чек-лист самообновляется и не врёт.
 *
 * States: ST-3 (the empty-state — checklist instead of empty dashboard),
 * ST-1/ST-2 (loading — signals still resolving), ST-6 (unreadable signal → step
 * stays actionable, no crash), ST-11/12 (permission-gated items hidden), ST-17
 * (Contextual UI — item hidden when its module is off), ST-20 (per-project
 * teardown), ST-26 (provisioning loader on the "create deal" item), ST-29
 * (auto-hide once all steps are truly done / dismissed / 7 days).
 */
type OnboardingChecklistProps = {
    /** Pending provisioning of pipeline/order types (ST-26, NFR-ONB-6). */
    provisioning?: boolean
}

const OnboardingChecklist = ({ provisioning = false }: OnboardingChecklistProps) => {
    const navigate = useNavigate()
    const can = usePermission()
    const currentProject = useProjectStore((s) => s.currentProject)
    const projectId = currentProject?.id
    const projectName = currentProject?.name

    const enabledModules = useMemo(
        () => getEnabledModules(currentProject),
        [currentProject],
    )

    // Items visible after Contextual UI + permission gating (ST-11/12/17).
    // box single-tenant: проект всегда принадлежит Системе — «пригласить коллегу»
    // применимо всегда (отдельного орг-гейта нет).
    const visibleItems = useMemo(
        () =>
            ITEMS.filter((item) => {
                if (item.module && !enabledModules.includes(item.module)) {
                    return false // ST-17 — module off
                }
                if (item.requires) {
                    const [subject, action] = item.requires.split(':')
                    if (subject && action && !can(subject, action)) return false // ST-11/12
                }
                return true
            }),
        [enabledModules, can],
    )
    const visibleIds = useMemo(
        () => new Set(visibleItems.map((i) => i.id)),
        [visibleItems],
    )

    // Persisted meta (dismiss + firstSeen) — NOT progress (ST-20 per-project).
    const [meta, setMeta] = useState<ChecklistMeta>({ firstSeen: Date.now() })
    useEffect(() => {
        if (!projectId) return
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + projectId)
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<ChecklistMeta>
                setMeta({
                    firstSeen: parsed.firstSeen ?? Date.now(),
                    dismissed: parsed.dismissed,
                })
            } else {
                const fresh: ChecklistMeta = { firstSeen: Date.now() }
                setMeta(fresh)
                localStorage.setItem(
                    STORAGE_PREFIX + projectId,
                    JSON.stringify(fresh),
                )
            }
        } catch {
            // ST-6 — unreadable meta: fall back to "just seen", never crash.
            setMeta({ firstSeen: Date.now() })
        }
    }, [projectId])

    const dismiss = useCallback(() => {
        setMeta((prev) => {
            const next: ChecklistMeta = { ...prev, dismissed: true } // EL-CL-5
            if (projectId) {
                try {
                    localStorage.setItem(
                        STORAGE_PREFIX + projectId,
                        JSON.stringify(next),
                    )
                } catch {
                    // best-effort; UI already hidden optimistically
                }
            }
            return next
        })
    }, [projectId])

    // ── Real-progress signals (fetched only for visible items) ───────────────
    const wantContact = Boolean(projectId) && visibleIds.has('contact')
    const wantDeal = Boolean(projectId) && visibleIds.has('deal')
    const wantInvite = visibleIds.has('invite')

    const { data: contactsRes, error: contactsErr } = useSWR(
        wantContact ? ['onb-contacts', projectId] : null,
        () =>
            apiGetContacts<
                { list: unknown[]; total: number },
                { projectId: string; pageSize: number }
            >({ projectId: projectId as string, pageSize: 1 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const { data: dealsRes, error: dealsErr } = useSWR(
        wantDeal ? ['onb-deals', projectId] : null,
        () =>
            apiGetDeals<
                { list: unknown[]; total: number },
                { projectId: string; pageSize: number; pageIndex: number }
            >({ projectId: projectId as string, pageSize: 1, pageIndex: 0 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const { data: invitesRes, error: invitesErr } = useSWR(
        wantInvite ? ['onb-invites'] : null,
        () => apiGetInvitations(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const done: Record<ChecklistItemId, boolean> = {
        contact: (contactsRes?.total ?? 0) > 0,
        deal: (dealsRes?.total ?? 0) > 0,
        invite: Array.isArray(invitesRes)
            ? invitesRes.some(
                  (i: OrgInvitation) =>
                      i.status === 'pending' || i.status === 'accepted',
              )
            : false,
    }

    // A signal is "resolved" once it returned data or errored (ST-6 — an errored
    // signal must not hang the spinner; the step just stays actionable).
    const resolved = (want: boolean, data: unknown, err: unknown) =>
        !want || data !== undefined || Boolean(err)
    const detecting = !(
        resolved(wantContact, contactsRes, contactsErr) &&
        resolved(wantDeal, dealsRes, dealsErr) &&
        resolved(wantInvite, invitesRes, invitesErr)
    )

    const doneCount = visibleItems.filter((i) => done[i.id]).length
    const total = visibleItems.length
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100)

    const expired = Date.now() - meta.firstSeen > DISMISS_AFTER_MS
    const allDone = total > 0 && doneCount === total

    // No current project → nothing to onboard against.
    if (!projectId) return null

    // ST-1/ST-2 — signals still resolving.
    if (detecting) {
        return (
            <Card
                bodyClass="p-6 flex items-center justify-center"
                {...qaWithAlias(
                    'host.onboarding.checklist.loading',
                    'host.dashboard.onboardingChecklist',
                )}
                {...qa('host.onboarding.checklist.loading', { state: 'loading' })}
            >
                <Spinner size={28} />
            </Card>
        )
    }

    // ST-29 — auto-hide once complete / dismissed / 7 days; ST-3 hidden when
    // there is nothing to show.
    if (meta.dismissed || expired || allDone || total === 0) {
        return null
    }

    return (
        <Card
            {...qa('host.onboardingChecklist.root')}
            className="border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20"
            bodyClass="p-5"
            {...qaWithAlias(
                'host.onboarding.checklist.card',
                'host.dashboard.onboardingChecklist',
            )}
        >
            {/* Онбординг-хребет (BX-ONB-6, BOX-ONBOARDING §3-D5/§4): этап 3
                «Первые шаги» степпера + строка-мост завершения предыдущего этапа
                («Готово! Проект «Y» создан»). Живёт в одном жизненном цикле с
                чек-листом — виден на первом заходе на дашборд после создания
                проекта и уходит вместе с ним (done / dismissed / 7 дней). */}
            <OnboardingProgress stage={3} className="mb-4" />
            <div className="flex items-center gap-2 mb-4">
                <PiCheckCircleFill
                    aria-hidden
                    className="w-5 h-5 text-emerald-500 shrink-0"
                />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {projectName
                        ? `Готово! Проект «${projectName}» создан`
                        : 'Готово! Проект создан'}
                </p>
            </div>

            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        Первые шаги
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {doneCount} из {total} выполнено
                    </p>
                </div>
                <button
                    {...qa('host.onboardingChecklist.dismiss')}
                    type="button"
                    aria-label="Скрыть"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                    onClick={dismiss}
                    {...qa('host.onboarding.checklist.dismiss')}
                >
                    <PiXBold className="w-4 h-4" />
                </button>
            </div>

            {/* EL-CL-1 — progress */}
            <div {...qa('host.onboardingChecklist.progress')}>
                <Progress percent={percent} className="mb-4" />
            </div>

            <ul className="space-y-2">
                {visibleItems.map((item) => {
                    const isDone = done[item.id]
                    // ST-26 — pending provisioning hides the "create deal" CTA
                    // behind a loader instead of showing "0 records".
                    const isPending =
                        item.id === 'deal' && provisioning && !isDone
                    return (
                        <li
                            key={item.id}
                            {...qa('host.onboardingChecklist.item', { item: item.id })}
                            className="flex items-center gap-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-3 py-2"
                            {...qaWithAlias(
                                'host.onboarding.checklist.item',
                                'host.dashboard.onboardingChecklistItem',
                            )}
                            {...qa('host.onboarding.checklist.item', {
                                item: item.id,
                            })}
                        >
                            <span aria-hidden className="shrink-0">
                                {isDone ? (
                                    <PiCheckCircleFill className="w-5 h-5 text-emerald-500" />
                                ) : (
                                    <PiCircleDuotone className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                                )}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p
                                    className={
                                        'text-sm font-medium ' +
                                        (isDone
                                            ? 'line-through text-gray-400 dark:text-gray-500'
                                            : 'text-gray-800 dark:text-gray-200')
                                    }
                                >
                                    {item.label}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {isDone
                                        ? 'Готово'
                                        : isPending
                                          ? (
                                                <span
                                                    {...qa(
                                                        'host.onboarding.checklist.dealProvisioning',
                                                    )}
                                                >
                                                    Настраиваем ваш проект…
                                                </span>
                                            )
                                          : item.hint}
                                </p>
                            </div>
                            {isPending ? (
                                <Spinner size={16} />
                            ) : (
                                !isDone && (
                                    <button
                                        {...qa('host.onboardingChecklist.cta', {
                                            item: item.id,
                                        })}
                                        type="button"
                                        className="shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                                        onClick={() => navigate(item.to)}
                                        {...qa('host.dashboard.onboardingChecklistCta', {
                                            item: item.id,
                                        })}
                                    >
                                        {item.cta} →
                                    </button>
                                )
                            )}
                        </li>
                    )
                })}
            </ul>
        </Card>
    )
}

export default OnboardingChecklist
