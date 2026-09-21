import { useRef, useImperativeHandle, useState } from 'react'
import AuthContext from './AuthContext'
import appConfig from '@/configs/app.config'
import { useSessionUser, useToken } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import {
    apiGetMyProfile,
    apiSignIn,
    apiSignOut,
} from '@/services/AuthService'
import { apiGetSystem, apiGetMyProjects } from '@/services/CrmService'
import { usePublicConfigStore } from '@/store/publicConfigStore'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import type { BootstrapResponse } from '@/services/BootstrapService'
import { useNavigate } from 'react-router'
import type {
    SignInCredential,
    AuthResult,
    OauthSignInCallbackPayload,
    User,
    Token,
    BackendAuthUser,
    ProjectInfo,
    OrganizationInfo,
    OrgRole,
} from '@/@types/auth'

import type { ReactNode, Ref } from 'react'
import type { NavigateFunction } from 'react-router'

/** Display name from email when name is missing (e.g. anna@example.com → Anna) */
function displayNameFromEmail(email: string | undefined): string {
    if (!email || !email.includes('@')) return ''
    const local = email.split('@')[0]?.trim() ?? ''
    return local ? local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() : ''
}

type AuthUserPayload = Partial<BackendAuthUser> & User & { login?: string }

/** Normalize auth payload (id/userId, login/userName, name) to frontend User. */
function mapAuthUserToFrontend(raw: AuthUserPayload): User {
    const userId = raw.userId ?? raw.id ?? null
    const login = (raw.login ?? raw.userName ?? '').trim()
    const displayNameFromRaw = typeof raw.name === 'string' ? raw.name.trim() : ''
    const fromEmail = displayNameFromEmail(raw.email ?? undefined)
    const displayName =
        displayNameFromRaw ||
        (login.includes(' ') ? login : null) ||
        fromEmail ||
        login ||
        ''

    const projects = raw.projects ?? []

    return {
        userId,
        userName: displayName,
        name: displayNameFromRaw || null,
        email: raw.email ?? '',
        authority: raw.authority ?? ['user'],
        avatar: raw.avatar ?? '',
        phone: (raw as User).phone ?? null,
        position: (raw as User).position ?? null,
        language: (raw as User).language ?? 'ru',
        timezone: (raw as User).timezone ?? 'Europe/Moscow',
        dateFormat: (raw as User).dateFormat ?? 'DD.MM.YYYY',
        timeFormat: (raw as User).timeFormat ?? '24h',
        thousandsSeparator: (raw as User).thousandsSeparator ?? 'space',
        defaultDealsView: (raw as User).defaultDealsView ?? 'kanban',
        defaultActivitiesView: (raw as User).defaultActivitiesView ?? 'list',
        projects,
        // box single-tenant: Система резолвится отдельно (apiGetSystem) — не из
        // логин-ответа. Сессия держит одну Систему + роль, не массив орг.
        system: null,
    }
}

import { mapControlProjectsToUser } from '@/utils/mapControlProjects'
/**
 * box single-tenant: одна Система из `GET /v1/system` (или `null` до bootstrap).
 * Держим id/name (для реквизитов/резолва якоря) + роль пользователя в Системе.
 */
function mapSystemToUser(
    org: { id: string; name: string; slug?: string; role?: string } | null,
): OrganizationInfo | null {
    if (!org?.id) return null
    const role: OrgRole =
        org.role === 'platform_owner' || org.role === 'platform_admin'
            ? org.role
            : 'employee'
    return { id: org.id, name: org.name, role }
}

type AuthProviderProps = { children: ReactNode }

export type IsolatedNavigatorRef = {
    navigate: NavigateFunction
}

const IsolatedNavigator = ({ ref }: { ref: Ref<IsolatedNavigatorRef> }) => {
    const navigate = useNavigate()

    useImperativeHandle(ref, () => {
        return {
            navigate,
        }
    }, [navigate])

    return <></>
}

function AuthProvider({ children }: AuthProviderProps) {
    const signedIn = useSessionUser((state) => state.session.signedIn)
    const user = useSessionUser((state) => state.user)
    const setUser = useSessionUser((state) => state.setUser)
    const setSessionSignedIn = useSessionUser(
        (state) => state.setSessionSignedIn,
    )
    const { token, setToken } = useToken()
    const [tokenState, setTokenState] = useState(token)
    const useHttpOnlyCookies = appConfig.accessTokenPersistStrategy === 'cookies'

    const authenticated = useHttpOnlyCookies ? signedIn : Boolean(tokenState && signedIn)

    const navigatorRef = useRef<IsolatedNavigatorRef>(null)

    const redirect = () => {
        const search = window.location.search
        const params = new URLSearchParams(search)
        const redirectUrl = params.get(REDIRECT_URL_KEY)

        navigatorRef.current?.navigate(
            redirectUrl ? redirectUrl : appConfig.authenticatedEntryPath,
        )
    }

    const handleSignIn = (tokens: Token, user?: User) => {
        if (!useHttpOnlyCookies) {
            setToken(tokens.accessToken)
            setTokenState(tokens.accessToken)
        } else {
            setToken('')
            setTokenState('')
        }
        setSessionSignedIn(true)
        if (user) {
            setUser(user)
        }
    }

    const handleSignOut = () => {
        if (!useHttpOnlyCookies) setToken('')
        setTokenState('')
        // T-001-FE: чистим project-scoped стейт сессии. `setUser` в authStore
        // МЕРЖИТ payload поверх текущего user (zustand), поэтому `setUser({})`
        // НЕ обнуляет `projects`/`system` — они переживают logout. Из-за
        // этого useResolvedProjectId сразу пере-выводил currentProject из
        // прошлых `user.projects` и заново писал stale id в localStorage. Явно
        // зануляем проекты и Систему, чтобы контекст действительно очистился.
        setUser({ projects: [], system: null, systemRole: undefined })
        setSessionSignedIn(false)
        // T-001-FE: зануляем контекст проекта (и его localStorage-ключи), иначе
        // stale `fairflow_current_project(_id)` переживает смену пользователя и
        // следующий юзер шлёт project-scoped запросы с чужим X-Project-Id → 403.
        useProjectStore.getState().setCurrentProject(null)
    }

    /**
     * Общий post-token-хидратор: дотягивает проекты/организации из control по
     * userId и кладёт полного пользователя в стор. Вызывается из signIn и из
     * завершения OAuth (completeOAuthSignIn), чтобы оба входа давали одинаково
     * наполненную сессию (проекты/организации) — без дублирования логики.
     */
    const loadProjectsAndOrganizations = async (user: User) => {
        const userId = user.userId
        if (!userId) {
            return
        }
        try {
            const [projectsRes, systemRes] = await Promise.allSettled([
                apiGetMyProjects<Array<{ id: string; name: string; color?: string; owner_type?: string; owner_id?: string; modules?: string[] }>>({ userId }),
                apiGetSystem(),
            ])
            const projects =
                projectsRes.status === 'fulfilled' && Array.isArray(projectsRes.value)
                    ? mapControlProjectsToUser(projectsRes.value)
                    : user.projects ?? []
            const system =
                systemRes.status === 'fulfilled'
                    ? mapSystemToUser(systemRes.value)
                    : user.system ?? null

            setUser({
                ...user,
                projects,
                system,
                systemRole: system?.role,
            })

            // T-001-FE: сверяем сохранённый (возможно stale/чужой) выбор проекта
            // со списком проектов ТЕКУЩЕГО юзера. Если id отсутствует в них —
            // зануляем контекст, чтобы project-scoped запросы не ушли с чужим
            // X-Project-Id (403). Отрабатывает и без logout (смена сессии в
            // другой вкладке / token-swap) — как только подгрузили /me-проекты.
            const { currentProjectId, setCurrentProject } =
                useProjectStore.getState()
            if (
                currentProjectId &&
                !projects.some((p) => p.id === currentProjectId)
            ) {
                setCurrentProject(null)
            }
        } catch {
            // Control not available or not configured
        }
    }

    const signIn = async (values: SignInCredential): AuthResult => {
        try {
            const resp = await apiSignIn(values)
            if (resp) {
                // [TO-BE: FR-AUTH-10] Включена 2FA → JWT/сессия НЕ выданы,
                // нужен второй фактор. Не логиним, ведём на SCR-AUTH-2FA с
                // одноразовым preauthId (и сохраняем целевой redirectUrl).
                if (resp.mfaRequired && resp.preauthId) {
                    const search = new URLSearchParams(window.location.search)
                    const redirectUrl = search.get(REDIRECT_URL_KEY)
                    const params = new URLSearchParams({ preauthId: resp.preauthId })
                    if (redirectUrl) params.set(REDIRECT_URL_KEY, redirectUrl)
                    navigatorRef.current?.navigate(`/auth/2fa?${params.toString()}`)
                    return { status: 'success', message: '' }
                }
                // При httpOnly cookies бэкенд отдаёт только user; токен в куке
                const accessToken = resp.token ?? ''
                const user: User = mapAuthUserToFrontend(resp.user as AuthUserPayload)
                if (!user.userId) {
                    user.userId = (resp.user as BackendAuthUser).id ?? null
                }
                handleSignIn({ accessToken }, user)
                // Load organizations and projects from control service
                await loadProjectsAndOrganizations(user)
                redirect()
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'Не удалось войти',
            }
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        } catch (errors: any) {
            return {
                status: 'failed',
                message: errors?.response?.data?.message || errors.toString(),
            }
        }
    }

    /**
     * Завершение OAuth (Яндекс): gateway-callback отдал нам JWT во фрагменте URL
     * и привёл на SCR /auth/oauth/callback. Дальше — тот же путь, что и в signIn:
     * сохранить токен (handleSignIn) → получить профиль через /me → дотянуть
     * проекты/организации → пометить сессию. handoff-страница после этого делает
     * redirect на исходный redirectUrl.
     */
    const completeOAuthSignIn = async (accessToken: string): AuthResult => {
        try {
            if (!accessToken) {
                return { status: 'failed', message: 'Не получен токен входа' }
            }
            // Под localStorage/sessionStorage handleSignIn кладёт токен в стор —
            // и следующий запрос (/me) уже уйдёт с Authorization. Под cookies
            // токен в HttpOnly-куке (gateway уже её выставил) и едет с withCredentials.
            handleSignIn({ accessToken })
            const resp = await apiGetMyProfile()
            if (!resp?.user) {
                handleSignOut()
                return { status: 'failed', message: 'Не удалось получить профиль' }
            }
            const user: User = mapAuthUserToFrontend(resp.user as AuthUserPayload)
            // /v1/auth/me теперь может отдавать сырые control-проекты
            // (snake_case). mapAuthUserToFrontend кладёт raw.projects БЕЗ
            // мапинга — сырые объекты сломали бы resolveModules, поэтому мапим
            // явно через mapControlProjectsToUser. Best-effort: при пустом []
            // (старый BE / control недоступен) оставляем как есть — дотяжка ниже
            // (loadProjectsAndOrganizations) отработает как раньше.
            const rawMeProjects = resp.user.projects
            if (Array.isArray(rawMeProjects) && rawMeProjects.length) {
                user.projects = mapControlProjectsToUser(
                    rawMeProjects as Parameters<
                        typeof mapControlProjectsToUser
                    >[0],
                )
            }
            setUser(user)
            await loadProjectsAndOrganizations(user)
            return { status: 'success', message: '' }
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        } catch (errors: any) {
            handleSignOut()
            return {
                status: 'failed',
                message: errors?.response?.data?.message || errors.toString(),
            }
        }
    }

    /**
     * Завершение bootstrap первого админа коробки (§5.4). Ответ
     * `POST /api/bootstrap` — как `register`: содержит токен + user + orga.
     * Сохранить токен/сессию, дотянуть проекты/орги, пометить конфиг
     * «инициализирован» (needsBootstrap=false, чтобы гейт больше не выкинул
     * на /bootstrap) и уйти в приложение (redirect). the box stand invite-only:
     * публичной само-регистрации нет — единственные пути создания аккаунта —
     * это bootstrap первого админа и приём приглашения.
     */
    const bootstrapSignIn = async (resp: BootstrapResponse): AuthResult => {
        try {
            const mapped = mapAuthUserToFrontend(
                resp.user as AuthUserPayload,
            )
            if (!mapped.userId) {
                mapped.userId = resp.user.id ?? resp.user.userId ?? null
            }
            // Первый админ коробки — владелец созданной Системы.
            if (resp.organization?.id) {
                const sysRole: OrgRole = 'platform_owner'
                mapped.system = {
                    id: resp.organization.id,
                    name: resp.organization.name,
                    role: sysRole,
                }
                mapped.systemRole = sysRole
            }
            handleSignIn({ accessToken: resp.token ?? '' }, mapped)
            await loadProjectsAndOrganizations(mapped)
            // Коробка инициализирована → снять needsBootstrap, чтобы
            // PublicConfigGate не редиректил обратно на /bootstrap.
            const { config, setConfig } = usePublicConfigStore.getState()
            setConfig({ ...config, needsBootstrap: false })
            // BX-ONB-4: вместо молчаливого редиректа в приложение — детерминированный
            // мост Bootstrap → мастер. Экран /onboarding/welcome подтверждает «Организация
            // «X» создана», показывает прогресс этап 1→2 и ведёт в мастер первого проекта.
            // orgId прокидываем надёжно из ответа bootstrap (не из хрупкого резолвера).
            const orgOwner = resp.organization?.id
            navigatorRef.current?.navigate(
                orgOwner
                    ? `/onboarding/welcome?owner=${orgOwner}`
                    : '/onboarding/welcome',
            )
            return { status: 'success', message: '' }
            // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        } catch (errors: any) {
            return {
                status: 'failed',
                message: errors?.response?.data?.message || errors.toString(),
            }
        }
    }

    const signOut = async () => {
        try {
            await apiSignOut()
        } finally {
            handleSignOut()
            navigatorRef.current?.navigate('/')
        }
    }
    const oAuthSignIn = (
        callback: (payload: OauthSignInCallbackPayload) => void,
    ) => {
        callback({
            onSignIn: handleSignIn,
            redirect,
        })
    }

    return (
        <AuthContext.Provider
            value={{
                authenticated,
                user,
                signIn,
                bootstrapSignIn,
                signOut,
                oAuthSignIn,
                completeOAuthSignIn,
                oAuthRedirect: redirect,
            }}
        >
            {children}
            <IsolatedNavigator ref={navigatorRef} />
        </AuthContext.Provider>
    )
}

export default AuthProvider
