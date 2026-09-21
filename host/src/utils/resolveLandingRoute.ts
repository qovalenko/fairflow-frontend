import type { ProjectInfo } from '@/@types/auth'

/**
 * Landing-resolver ctx (FR-ONB-1, TZ §6.2 bootstrap `GET /api/me`).
 *
 * Derived from the session user. box single-tenant: развилка «пусто → онбординг
 * vs NO-PROJECTS» больше не гейтится удалённым флагом `personalProjectsAllowed`,
 * а решается ПО ФАКТУ — есть ли у пользователя проекты и может ли он завести
 * первый проект Системы (`canCreateProject`, владелец/админ Системы).
 */
export type LandingCtx = {
    hasProjects: boolean
    lastActiveProjectId?: string | null
    /**
     * Может ли пользователь создать первый проект Системы (владелец/админ). При
     * пустом списке проектов: `true`/`undefined` → ENTRY-CHOICE (мастер),
     * `false` → NO-PROJECTS (сотрудник ждёт назначения). Permissive-дефолт
     * (`undefined`→`true`) сохраняет no-dead-end до резолва роли.
     */
    canCreateProject?: boolean
    projects: ProjectInfo[]
}

export type LandingTarget =
    | { kind: 'project'; projectId: string }
    | { kind: 'entry-choice' } // SCR-ONB-ENTRY-CHOICE
    | { kind: 'no-projects' } // SCR-ONB-NO-PROJECTS
    | { kind: 'portfolio' } // SCR-PROJ-LIST-ACCOUNT (AS-IS fallback)

export type ResolveOptions = {
    /**
     * Explicit "+ New project" intent (FR-ONB-22): bypass the auto-redirect even
     * when `hasProjects`. Wired by the portfolio "+ Новый проект" entry point
     * (project-module) — not consumed by the Home resolver.
     */
    forceNewProject?: boolean
    /**
     * Project id preferred by the caller (e.g. store recency / route param) when
     * `lastActiveProjectId` is empty.
     */
    fallbackProjectId?: string
}

/**
 * `resolveLandingRoute(ctx)` — deterministic no-dead-end landing resolver
 * (FR-ONB-1, INV-ONB-1, SCREENS §C.1).
 *
 * Pure function: same `ctx` → same target. Single source of truth replacing the
 * AS-IS triple redirect scattered across `Home.tsx` / `usePortfolioProjectGuard`
 * / `ProjectEntryChoice` (m-15 risk of non-determinism).
 *
 * Decision table (SCREENS §C.1, box single-tenant):
 *   hasProjects                          → /p/<lastActive ∥ firstByRecency>
 *   !hasProjects && canCreateProject     → /onboarding         (ENTRY-CHOICE)
 *   !hasProjects && !canCreateProject    → /onboarding/no-projects (NO-PROJECTS)
 *   forceNewProject (FR-ONB-22)          → /account/projects/new (caller-handled)
 *
 * BOX-хардкод (BX-ONB-6, BOX-ONBOARDING §3-D5): первый запуск НИКОГДА не гейтится
 * на email-верификации. В box (invite-only, первый вход = bootstrap) `emailVerified`
 * намеренно НЕ входит в резолвер посадки — по построению его нельзя сделать
 * условием маршрута, поэтому `VerifyEmail` в онбординг-хребте не всплывает (он
 * реачится только по токену из письма; успех ведёт в `/onboarding` → обычный
 * резолв без гейта). `bootstrap-fail` здесь НЕ обрабатывается (это чистая
 * ctx→route функция); ретрай-заглушку показывает вызывающий, без молчаливого
 * редиректа.
 */
export function resolveLandingRoute(
    ctx: LandingCtx,
    options: ResolveOptions = {},
): LandingTarget {
    // Has projects → working space (unless explicit new-project intent).
    if (ctx.hasProjects && !options.forceNewProject) {
        const target =
            (ctx.lastActiveProjectId &&
                ctx.projects.some((p) => p.id === ctx.lastActiveProjectId) &&
                ctx.lastActiveProjectId) ||
            (options.fallbackProjectId &&
                ctx.projects.some((p) => p.id === options.fallbackProjectId) &&
                options.fallbackProjectId) ||
            ctx.projects[0]?.id

        if (target) return { kind: 'project', projectId: target }
        // hasProjects but no resolvable id — AS-IS fallback to portfolio (§A F).
        return { kind: 'portfolio' }
    }

    // No projects (по факту пустого списка): владелец/админ Системы идёт в мастер
    // первого проекта, сотрудник без проекта — на информ-заглушку NO-PROJECTS.
    // `undefined` permissive (ENTRY-CHOICE) — no-dead-end до резолва роли.
    const canCreate = ctx.canCreateProject !== false
    return canCreate ? { kind: 'entry-choice' } : { kind: 'no-projects' }
}

/** Map a resolved target to a concrete route path. */
export function landingTargetToPath(target: LandingTarget): string {
    switch (target.kind) {
        case 'project':
            // Dashboard is the project home (m-9: actual dashboard route `/dashboard`,
            // project context lives in store; `/p/:pid` reserved for settings).
            return '/dashboard'
        case 'entry-choice':
            return '/onboarding'
        case 'no-projects':
            return '/onboarding/no-projects'
        case 'portfolio':
            return '/account/projects'
    }
}
