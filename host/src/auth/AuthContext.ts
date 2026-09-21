import { createContext } from 'react'
import type {
    SignInCredential,
    AuthResult,
    User,
    OauthSignInCallbackPayload,
} from '@/@types/auth'
import type { BootstrapResponse } from '@/services/BootstrapService'

type Auth = {
    authenticated: boolean
    user: User
    signIn: (values: SignInCredential) => AuthResult
    /**
     * Завершить вход после успешного bootstrap первого админа коробки (§5.4):
     * ответ `POST /api/bootstrap` уже содержит токен + user + organization —
     * сохраняем сессию как при обычном логине и уходим в приложение (redirect).
     */
    bootstrapSignIn: (resp: BootstrapResponse) => AuthResult
    signOut: () => void
    oAuthSignIn: (
        callback: (payload: OauthSignInCallbackPayload) => void,
    ) => void
    /**
     * Завершить OAuth-вход по токену, полученному из gateway-callback (фрагмент
     * URL): сохранить токен, дотянуть профиль/проекты/организации, пометить сессию.
     * Возвращает success/failed (как signIn). Сам не делает redirect — это решает
     * вызывающая handoff-страница (через `oAuthRedirect`).
     */
    completeOAuthSignIn: (accessToken: string) => AuthResult
    /** Навигация после успешного входа: на ?redirectUrl= или на authenticatedEntryPath. */
    oAuthRedirect: () => void
}

const defaultFunctionPlaceHolder = async (): AuthResult => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    return {
        status: '',
        message: '',
    }
}

const defaultOAuthSignInPlaceHolder = (
    callback: (payload: OauthSignInCallbackPayload) => void,
): void => {
    callback({
        onSignIn: () => {},
        redirect: () => {},
    })
}

const AuthContext = createContext<Auth>({
    authenticated: false,
    user: {},
    signIn: async () => defaultFunctionPlaceHolder(),
    bootstrapSignIn: async () => defaultFunctionPlaceHolder(),
    signOut: () => {},
    oAuthSignIn: defaultOAuthSignInPlaceHolder,
    completeOAuthSignIn: async () => defaultFunctionPlaceHolder(),
    oAuthRedirect: () => {},
})

export default AuthContext
