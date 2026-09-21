import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import ActionLink from '@/components/shared/ActionLink'
import ResetPasswordForm from './components/ResetPasswordForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import { useNavigate } from 'react-router'
import { qa } from '@/shared/qa'

type ResetPasswordProps = {
    signInUrl?: string
}

export const ResetPasswordBase = ({
    signInUrl = '/auth/signin',
}: ResetPasswordProps) => {
    const [resetComplete, setResetComplete] = useState(false)

    const [message, setMessage] = useTimeOutMessage()

    const navigate = useNavigate()

    const handleContinue = () => {
        navigate(signInUrl)
    }

    return (
        <div>
            <div className="mb-6">
                {resetComplete ? (
                    <>
                        <h3 className="mb-1" {...qa('host.resetPassword.success')}>
                            Пароль изменён
                        </h3>
                        <p className="font-semibold heading-text">
                            Ваш пароль успешно сброшен
                        </p>
                    </>
                ) : (
                    <>
                        <h3 className="mb-1">Новый пароль</h3>
                        <p className="font-semibold heading-text">
                            Новый пароль должен отличаться от предыдущего
                        </p>
                    </>
                )}
            </div>
            {message && (
                <Alert showIcon className="mb-4" type="danger" {...qa('host.resetPassword.error')}>
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <ResetPasswordForm
                resetComplete={resetComplete}
                setMessage={setMessage}
                setResetComplete={setResetComplete}
            >
                <Button
                    block
                    variant="solid"
                    type="button"
                    onClick={handleContinue}
                >
                    Продолжить
                </Button>
            </ResetPasswordForm>
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

const ResetPassword = () => {
    return <ResetPasswordBase />
}

export default ResetPassword
