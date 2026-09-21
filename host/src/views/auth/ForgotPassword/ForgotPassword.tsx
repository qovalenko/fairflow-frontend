import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import ActionLink from '@/components/shared/ActionLink'
import ForgotPasswordForm from './components/ForgotPasswordForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import { useNavigate } from 'react-router'
import { qa } from '@/shared/qa'

type ForgotPasswordProps = {
    signInUrl?: string
}

export const ForgotPasswordBase = ({
    signInUrl = '/auth/signin',
}: ForgotPasswordProps) => {
    const [emailSent, setEmailSent] = useState(false)
    const [message, setMessage] = useTimeOutMessage()

    const navigate = useNavigate()

    const handleContinue = () => {
        navigate(signInUrl)
    }

    return (
        <div>
            <div className="mb-6">
                {emailSent ? (
                    <>
                        <h3 className="mb-2" {...qa('host.forgotPassword.success')}>
                            Проверьте почту
                        </h3>
                        <p className="font-semibold heading-text">
                            Мы отправили инструкцию по восстановлению пароля
                            на вашу почту
                        </p>
                    </>
                ) : (
                    <>
                        <h3 className="mb-2">Восстановление пароля</h3>
                        <p className="font-semibold heading-text">
                            Введите email, чтобы получить код подтверждения
                        </p>
                    </>
                )}
            </div>
            {message && (
                <Alert showIcon className="mb-4" type="danger" {...qa('host.forgotPassword.error')}>
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <ForgotPasswordForm
                emailSent={emailSent}
                setMessage={setMessage}
                setEmailSent={setEmailSent}
            >
                <Button
                    block
                    variant="solid"
                    type="button"
                    onClick={handleContinue}
                >
                    Продолжить
                </Button>
            </ForgotPasswordForm>
            <div className="mt-4 text-center">
                <span>Назад </span>
                <ActionLink
                    to={signInUrl}
                    className="heading-text font-bold"
                    themeColor={false}
                >
                    ко входу
                </ActionLink>
            </div>
        </div>
    )
}

const ForgotPassword = () => {
    return <ForgotPasswordBase />
}

export default ForgotPassword
