const STORAGE_KEY = 'fairflow_invite_acceptance_banner'

export type InviteAcceptanceBannerState = {
    organizationName: string
    projectIds: string[]
}

export function saveInviteAcceptanceBanner(state: InviteAcceptanceBannerState): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
        // sessionStorage may be unavailable in private mode — banner is best-effort.
    }
}

export function readInviteAcceptanceBanner(): InviteAcceptanceBannerState | null {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as InviteAcceptanceBannerState
        if (!parsed?.organizationName?.trim()) return null
        return {
            organizationName: parsed.organizationName.trim(),
            projectIds: Array.isArray(parsed.projectIds)
                ? parsed.projectIds.map((id) => String(id).trim()).filter(Boolean)
                : [],
        }
    } catch {
        return null
    }
}

export function clearInviteAcceptanceBanner(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY)
    } catch {
        // ignore
    }
}

/** FR-PSET-660 / FR-ONB-19 — confirmation copy after existing-user invite accept. */
export function buildInviteAcceptanceMessage(
    organizationName: string,
    projectIds: string[],
    projectNamesById: Map<string, string>,
): string {
    const projectNames = projectIds
        .map((id) => projectNamesById.get(id))
        .filter((name): name is string => Boolean(name))

    if (projectNames.length === 0) {
        return `Вы добавлены в организацию «${organizationName}».`
    }
    if (projectNames.length === 1) {
        return `Вы добавлены в организацию «${organizationName}», проект «${projectNames[0]}».`
    }
    return `Вы добавлены в организацию «${organizationName}», проекты: ${projectNames.join(', ')}.`
}
