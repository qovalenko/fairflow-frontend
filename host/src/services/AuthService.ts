import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'
import type {
    SignInCredential,
    ForgotPassword,
    ResetPassword,
    SignInResponse,
} from '@/@types/auth'

export type MyProfileResponse = {
    user: {
        userId: string
        userName: string
        name?: string
        email: string
        avatar?: string
        phone?: string
        position?: string
        language?: string
        timezone?: string
        dateFormat?: string
        timeFormat?: string
        thousandsSeparator?: string
        defaultDealsView?: string
        defaultActivitiesView?: string
        /** [TO-BE: FR-MPROF-18] new email awaiting confirmation (ST-26). */
        pendingEmail?: string | null
        /** [TO-BE: FR-MPROF-9] whether TOTP 2FA is active. */
        twoFactorEnabled?: boolean
        /** [TO-BE: FR-MPROF-10] org policy forces 2FA → disable blocked. */
        require2fa?: boolean
        /** [TO-BE: FR-MPROF-12] number of unused backup codes. */
        backupCodesRemaining?: number
        /**
         * Сырые Project-объекты control (best-effort; [] при недоступном control).
         * Форма идентична элементам GET /v1/projects (snake_case) — мапить через
         * mapControlProjectsToUser перед укладкой в стор (см. AuthProvider).
         */
        projects?: Array<{
            id: string
            name: string
            color?: string
            owner_type?: string
            owner_id?: string
            modules?: string[]
            effective_modules?: string[]
            module_configs?: unknown[]
            module_policies?: unknown[]
        }>
    } | null
}

/** Field-projected colleague profile (FR-PROFILE-320 / §19 matrix). */
export type ForeignUserProfile = {
    userId: string
    userName?: string
    name?: string
    email?: string
    avatar?: string
    phone?: string
    position?: string
    departmentName?: string
    projectRole?: string
    lastActiveAt?: string
}

/** FR-PROFILE-280 — self-view of project memberships + visibility. */
export type MyAccessProject = {
    projectId: string
    projectName: string
    role: string
    visibilityLevel: string
    visibilityLabel: string
    joinedAt: string
}

export type MyAccessResponse = {
    systemRoles: string[]
    projects: MyAccessProject[]
}

export type ReauthCredential = {
    /** Current password (re-auth, FR-MPROF-8). */
    currentPassword: string
    /** TOTP code, only when 2FA enabled. */
    totpCode?: string
}

/**
 * Active session row — shape mirrors the gateway BFF response
 * (gateway `ProfileController.listSessions`): raw `deviceLabel` (the captured
 * User-Agent string) + `ip` + `lastSeenAt`/`createdAt` ISO timestamps.
 * The FE parses `deviceLabel` into a friendly browser/OS label for display.
 * `location` (geo from IP) is NOT yet provided by the backend — [BE-gap].
 */
export type ActiveSession = {
    id: string
    /** Raw User-Agent captured at login ('' / 'Unknown device' when absent). */
    deviceLabel?: string
    ip?: string
    /** ISO timestamp of last activity. */
    lastSeenAt?: string
    /** ISO timestamp of session creation. */
    createdAt?: string
    /** [BE-gap] geolocation string — reserved, backend does not send it yet. */
    location?: string
    isCurrent: boolean
}

export async function apiSignIn(data: SignInCredential) {
    return ApiService.fetchDataWithAxios<SignInResponse>({
        url: endpointConfig.signIn,
        method: 'post',
        data,
    })
}

export async function apiSignOut() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.signOut,
        method: 'post',
    })
}

export async function apiForgotPassword<T>(data: ForgotPassword) {
    return ApiService.fetchDataWithAxios<T>({
        url: endpointConfig.forgotPassword,
        method: 'post',
        data,
    })
}

export async function apiResetPassword<T>(data: ResetPassword) {
    return ApiService.fetchDataWithAxios<T>({
        url: endpointConfig.resetPassword,
        method: 'post',
        data,
    })
}

export async function apiGetMyProfile() {
    return ApiService.fetchDataWithAxios<MyProfileResponse>({
        url: '/v1/auth/me',
        method: 'get',
    })
}

export async function apiUpdateMyProfile(
    data: Partial<{
        name: string
        phone: string
        position: string
        language: string
        timezone: string
        dateFormat: string
        timeFormat: string
        thousandsSeparator: string
        defaultDealsView: string
        defaultActivitiesView: string
        avatar: string
    }>,
) {
    return ApiService.fetchDataWithAxios<MyProfileResponse>({
        url: '/v1/auth/me',
        method: 'patch',
        data,
    })
}

export async function apiUploadMyAvatar(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return ApiService.fetchDataWithAxios<{
        user: MyProfileResponse['user']
        avatarUrl: string
        objectKey: string
    }>({
        url: '/v1/auth/me/avatar',
        method: 'post',
        data: formData as unknown as Record<string, unknown>,
        headers: { 'Content-Type': 'multipart/form-data' },
    })
}

/* ───────────────────────── Profile-module / Auth — security ──────────────
 * Contract: docs/tz/contracts/auth.md §6.1 (all `[TO-BE]` on backend).
 * FE-side gating UX only — backend-guard is the source of truth (BR-SHELL-4).
 * ------------------------------------------------------------------------- */

/** Change password (FR-MPROF-6/7). Revokes other sessions server-side. */
export async function apiChangeMyPassword(data: {
    currentPassword: string
    newPassword: string
}) {
    return ApiService.fetchDataWithAxios<{ revokedSessions?: number }>({
        url: '/v1/auth/me/password',
        method: 'post',
        data,
    })
}

/** Request email change (FR-MPROF-18/19); confirmation lands on the new address. */
export async function apiRequestEmailChange(data: {
    newEmail: string
    currentPassword: string
    totpCode?: string
}) {
    return ApiService.fetchDataWithAxios<{ pendingEmail: string }>({
        url: '/v1/auth/me/email',
        method: 'post',
        data,
    })
}

/** Cancel a pending email change. */
export async function apiCancelEmailChange() {
    return ApiService.fetchDataWithAxios<{ pendingEmail: null }>({
        url: '/v1/auth/me/email',
        method: 'delete',
    })
}

/** Confirm new email by deep-link token (public, FR-MPROF-18). */
export async function apiConfirmEmailChange(token: string) {
    return ApiService.fetchDataWithAxios<{ email: string }>({
        url: '/v1/auth/email/confirm',
        method: 'post',
        data: { token },
    })
}

/** Cancel a pending email change — deep-link from the security-alert email (FR-MPROF-18). */
export async function apiCancelEmailChangeByToken(token: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: '/v1/auth/email/cancel',
        method: 'post',
        data: { token },
    })
}

/** 2FA enable wizard — init secret (FR-MPROF-9). */
export async function apiInit2fa(reauth: ReauthCredential) {
    return ApiService.fetchDataWithAxios<{
        secret: string
        otpauthUri: string
        qrSvg?: string
    }>({
        url: '/v1/auth/me/2fa/init',
        method: 'post',
        data: reauth,
    })
}

/** 2FA enable wizard — verify TOTP, activate, get backup codes (one-time). */
export async function apiEnable2fa(code: string) {
    // Gateway ProfileController.enable2fa reads `body.totpCode` (→ gRPC
    // `totp_code`). Sending `{ code }` left the TOTP empty server-side, so the
    // wizard always failed with INVALID_TOTP. Send the field the BFF expects.
    return ApiService.fetchDataWithAxios<{ backupCodes: string[] }>({
        url: '/v1/auth/me/2fa/enable',
        method: 'post',
        data: { totpCode: code },
    })
}

/** Disable 2FA (re-auth; blocked by org policy require2fa → 409). */
export async function apiDisable2fa(reauth: ReauthCredential) {
    return ApiService.fetchDataWithAxios<{ twoFactorEnabled: false }>({
        url: '/v1/auth/me/2fa/disable',
        method: 'post',
        data: reauth,
    })
}

/** Regenerate backup codes — invalidates previous, shows new once (FR-MPROF-12a). */
export async function apiRegenerateBackupCodes(reauth: ReauthCredential) {
    return ApiService.fetchDataWithAxios<{ backupCodes: string[] }>({
        url: '/v1/auth/me/2fa/backup-codes/regenerate',
        method: 'post',
        data: reauth,
    })
}

/** List active sessions (BR-MPROF-18). */
export async function apiGetMySessions() {
    return ApiService.fetchDataWithAxios<{ sessions: ActiveSession[] }>({
        url: '/v1/auth/me/sessions',
        method: 'get',
    })
}

/** Revoke a specific session (not the current one). */
export async function apiRevokeSession(id: string) {
    return ApiService.fetchDataWithAxios<{ id: string }>({
        url: `/v1/auth/me/sessions/${id}`,
        method: 'delete',
    })
}

/** Revoke all sessions except the current one. */
export async function apiRevokeOtherSessions() {
    return ApiService.fetchDataWithAxios<{ revoked: number }>({
        url: '/v1/auth/me/sessions/revoke-others',
        method: 'post',
    })
}

/** Second-factor verification during login (public pre-auth, FR-AUTH-10). */
export async function apiVerifyMfa(data: {
    preauthId: string
    code?: string
    backupCode?: string
}) {
    return ApiService.fetchDataWithAxios<SignInResponse>({
        url: '/v1/auth/2fa/verify',
        method: 'post',
        data,
    })
}

/** Resend / request email verification letter (public, FR-AUTH-4). */
export async function apiRequestEmailVerify(email?: string) {
    return ApiService.fetchDataWithAxios<{ ok: true }>({
        url: '/v1/auth/verify-email/request',
        method: 'post',
        data: email ? { email } : {},
    })
}

/** My projects with role and visibility (FR-PROFILE-280). */
export async function apiGetMyAccess() {
    return ApiService.fetchDataWithAxios<MyAccessResponse>({
        url: '/v1/profile/my-access',
        method: 'get',
    })
}

/** Foreign colleague profile — field-projected by viewer role (FR-PROFILE-320). */
export async function apiGetForeignUserProfile(userId: string) {
    return ApiService.fetchDataWithAxios<{ user: ForeignUserProfile }>({
        url: `/v1/profile/users/${encodeURIComponent(userId)}`,
        method: 'get',
    })
}

/** Confirm email verification by token (public, FR-AUTH-4). */
export async function apiConfirmEmailVerify(token: string) {
    return ApiService.fetchDataWithAxios<{ emailVerified: true }>({
        url: '/v1/auth/verify-email/confirm',
        method: 'post',
        data: { token },
    })
}
