import { useSearchParams } from 'react-router'
import Alert from '@/components/ui/Alert'
import { qa } from '@/shared/qa'
import SignInForm from './components/SignInForm'
import SsoSignIn from './components/SsoSignIn'
import ActionLink from '@/components/shared/ActionLink'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'

// EL-SIGNIN-8 (FR-AUTH-20): why the previous session ended, via `?reason=`.
const REASON_MESSAGES: Record<string, string> = {
    signed_out: 'Вы вышли из системы.',
    session_revoked: 'Сессия была завершена. Войдите снова.',
    password_changed: 'Пароль был изменён — войдите заново.',
    account_removed: 'Учётная запись недоступна.',
    token_expired: 'Срок действия сессии истёк — войдите заново.',
    // SCR-BOX-BOOTSTRAP → 409 ALREADY_INITIALIZED: коробка уже инициализирована.
    already_initialized: 'Система уже настроена. Войдите под своей учётной записью.',
    oauth_not_employee:
        'Вход через внешний провайдер доступен только сотрудникам. Примите приглашение или войдите паролем.',
    oidc_not_employee:
        'Вход через SSO доступен только сотрудникам. Примите приглашение или войдите паролем.',
}

type SignInProps = {
    forgetPasswordUrl?: string
    disableSubmit?: boolean
}

// Коробка (on-prem): SSO показывается только при настроенных провайдерах
// (OIDC env / VITE_SSO_YANDEX). Callback-маршрут нужен всегда для handoff.
export const SignInBase = ({
    forgetPasswordUrl = '/auth/forgot-password',
    disableSubmit,
}: SignInProps) => {
    const [message, setMessage] = useTimeOutMessage()
    const [searchParams] = useSearchParams()
    const reason = searchParams.get('reason')
    const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined

    return (
        <>
            <div className="mb-10">
                <h2 className="mb-2">С возвращением!</h2>
                <p className="font-semibold heading-text">
                    Введите данные для входа
                </p>
            </div>
            {reasonMessage && !message && (
                <Alert showIcon className="mb-4" type="info">
                    <span>{reasonMessage}</span>
                </Alert>
            )}
            {message && (
                <Alert showIcon className="mb-4" type="danger" {...qa('host.login.error')}>
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <SignInForm
                disableSubmit={disableSubmit}
                setMessage={setMessage}
                passwordHint={
                    <div className="mb-7 mt-2">
                        <ActionLink
                            to={forgetPasswordUrl}
                            className="font-semibold heading-text mt-2 underline"
                            themeColor={false}
                        >
                            Забыли пароль?
                        </ActionLink>
                    </div>
                }
            />
            <SsoSignIn disableSubmit={disableSubmit} setMessage={setMessage} />
        </>
    )
}

const SignIn = () => {
    return <SignInBase />
}

export default SignIn
