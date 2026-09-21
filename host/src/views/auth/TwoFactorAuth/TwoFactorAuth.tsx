import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PiShieldDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import OtpInput from '@/components/shared/OtpInput'
import { FormItem, Form } from '@/components/ui/Form'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { apiVerifyMfa } from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa, qaWithAlias } from '@/shared/qa'

const validationSchema = z.object({
    code: z.string().min(6, { message: 'Введите код из 6 цифр' }),
})

type TwoFactorFormSchema = {
    code: string
}

const TwoFactorAuth = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const preauthId = searchParams.get('preauthId') || ''
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<TwoFactorFormSchema>({
        resolver: zodResolver(validationSchema),
        defaultValues: {
            code: '',
        },
    })

    const onSubmit = async (values: TwoFactorFormSchema) => {
        setIsSubmitting(true)
        setError(null)
        try {
            await apiVerifyMfa({ preauthId, code: values.code })
            // ST-29: backend issues JWT+Session; continue into the app.
            navigate('/')
        } catch (e) {
            const err = normalizeApiError(e, 'Неверный код')
            // ST-26: expired pre-auth → restart login.
            if (err.status === 410) {
                navigate('/auth/signin?reason=token_expired')
                return
            }
            setError(err.message) // ST-7
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard className="max-w-md w-full">
                    <div className="text-center mb-6">
                        <div className="flex justify-center mb-4">
                            <PiShieldDuotone className="w-12 h-12 text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Двухфакторная аутентификация</h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Введите код из приложения
                        </p>
                    </div>

                    {error && (
                        <Alert
                            showIcon
                            type="danger"
                            className="mb-4"
                            {...qaWithAlias('host.2fa.error', 'host.twoFactor.error')}
                        >
                            {error}
                        </Alert>
                    )}

                    <Form onSubmit={handleSubmit(onSubmit)}>
                        <FormItem
                            invalid={Boolean(errors.code)}
                            errorMessage={errors.code?.message}
                        >
                            <Controller
                                name="code"
                                control={control}
                                render={({ field }) => (
                                    <div
                                        className="flex justify-center"
                                        {...qaWithAlias('host.2fa.code', 'host.twoFactor.code')}
                                    >
                                        <OtpInput
                                            length={6}
                                            {...field}
                                            autoFocus
                                        />
                                    </div>
                                )}
                            />
                        </FormItem>

                        <div className="text-center mb-6">
                            <Link
                                to={
                                    preauthId
                                        ? `/auth/backup-code?preauthId=${preauthId}`
                                        : '/auth/backup-code'
                                }
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                Использовать резервный код
                            </Link>
                        </div>

                        <Button
                            block
                            variant="solid"
                            color="primary"
                            type="submit"
                            loading={isSubmitting}
                            {...qa('host.2fa.submit')}
                        >
                            Подтвердить
                        </Button>
                    </Form>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default TwoFactorAuth
