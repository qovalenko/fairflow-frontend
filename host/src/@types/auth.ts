export type SignInCredential = {
    email: string
    password: string
}

export type OrgRole = 'platform_owner' | 'platform_admin' | 'employee'
export type ProjectRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'
export type OrganizationInfo = {
    id: string
    name: string
    role?: OrgRole
}

export type ProjectInfo = {
    id: string
    name: string
    color: string
    /**
     * box single-tenant: проект всегда принадлежит Системе. Поле оставлено
     * (backend отдаёт константу `'ORGANIZATION'` в proto), но личного вектора
     * (`PERSONAL`) в box нет — ветвление по владельцу выпилено (DEORG-W4).
     */
    ownerType?: 'ORGANIZATION'
    ownerId?: string
    role: ProjectRole
    enabledModules?: string[]
    moduleConfigs?: ProjectModuleConfig[]
    modulePolicies?: ProjectModulePolicyRule[]
    effectiveModules?: string[]
    /** Lifecycle: active | archived | pending_deletion (FR-PROJ-180). */
    status?: 'active' | 'archived' | 'pending_deletion'
    /** FR-PROJ-095: template provisioning observability. */
    provisioningStatus?: 'pending' | 'complete' | 'failed'
    /** Onboarding template id (FR-PSET-330 / FR-ONB-23). */
    templateId?: string
}

export type ProjectModuleConfig = {
    moduleId: string
    enabled: boolean
    personalSettings: Record<string, unknown>
    integrationSettings: Record<string, unknown>
    integrationMethodsEnabled: string[]
    runtimeStatus?: 'active' | 'suspended'
    everSuspended?: boolean
    configState?: 'ready' | 'needs_config'
    config?: Record<string, unknown>
    installed?: boolean
}

export type ProjectModulePolicyRule = {
    id: string
    moduleId: string
    effect: 'allow' | 'deny'
    subject: string
    action: string
    resource: string
    condition: Record<string, unknown>
}

/** Backend auth service (Nest) returns this user shape from login/me */
export type BackendAuthUser = {
    id: string
    login: string
    email: string
    name: string | null
    organizations?: OrganizationInfo[]
    projects?: ProjectInfo[]
}

export type SignInResponse = {
    /** Отсутствует при выдаче токена в HTTP-only cookie */
    token?: string
    /**
     * [TO-BE: FR-AUTH-10] Второй фактор. При включённой 2FA бэкенд НЕ выдаёт
     * JWT/сессию на этом шаге, а возвращает `mfaRequired:true` + одноразовый
     * `preauthId` — клиент должен перейти на SCR-AUTH-2FA (`/auth/2fa`).
     */
    mfaRequired?: boolean
    preauthId?: string
    user: {
        userId?: string
        userName?: string
        authority?: string[]
        avatar?: string
        email: string
        name?: string
        phone?: string
        position?: string
        language?: string
        timezone?: string
        dateFormat?: string
        timeFormat?: string
        thousandsSeparator?: 'space' | 'comma' | string
        defaultDealsView?: 'kanban' | 'list' | string
        defaultActivitiesView?: 'list' | 'calendar' | string
        organizations?: OrganizationInfo[]
        projects?: ProjectInfo[]
    } & Partial<BackendAuthUser>
}

export type ForgotPassword = {
    email: string
}

export type ResetPassword = {
    password: string
    /** One-time reset token from the email deep-link (FR-AUTH-5, OQ-UX-AUTH-6). */
    token?: string
}

export type AuthRequestStatus = 'success' | 'failed' | ''

export type AuthResult = Promise<{
    status: AuthRequestStatus
    message: string
}>

export type User = {
    userId?: string | null
    avatar?: string | null
    userName?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
    position?: string | null
    language?: string | null
    timezone?: string | null
    dateFormat?: string | null
    timeFormat?: string | null
    thousandsSeparator?: string | null
    defaultDealsView?: string | null
    defaultActivitiesView?: string | null
    authority?: string[]
    /**
     * box single-tenant: одна Система вместо массива организаций (DEORG-W4).
     * Держит id/name (для реквизитов/резолва якоря) + роль пользователя в Системе.
     * `null`/`undefined` — до bootstrap (Система ещё не создана).
     */
    system?: OrganizationInfo | null
    /** Роль текущего пользователя в Системе (владелец/админ/сотрудник). */
    systemRole?: OrgRole
    projects?: ProjectInfo[]
    /**
     * Bootstrap ctx: last active project id (FR-ONB-1) — the resolver prefers it
     * over recency. `undefined` until backend provides it; falls back to first
     * project by store recency.
     */
    lastActiveProjectId?: string | null
    /** Bootstrap ctx: email verification flag (OQ-UX-ONB-2). */
    emailVerified?: boolean
}

export type Token = {
    accessToken: string
    refereshToken?: string
}

export type OauthSignInCallbackPayload = {
    onSignIn: (tokens: Token, user?: User) => void
    redirect: () => void
}
