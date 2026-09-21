import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import Button from '@/components/ui/Button'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import { apiResetPassword } from '@/services/AuthService'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CommonProps } from '@/@types/common'
import { qa, qaWithAlias } from '@/shared/qa'

interface ResetPasswordFormProps extends CommonProps {
    resetComplete: boolean
    setResetComplete?: (compplete: boolean) => void
    setMessage?: (message: string) => void
}

type ResetPasswordFormSchema = {
    newPassword: string
    confirmPassword: string
}

const validationSchema = z
    .object({
        newPassword: z.string().min(8, 'Минимум 8 символов'),
        confirmPassword: z.string().min(1, 'Подтвердите пароль'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Пароли не совпадают',
        path: ['confirmPassword'],
    })

const ResetPasswordForm = (props: ResetPasswordFormProps) => {
    const [isSubmitting, setSubmitting] = useState<boolean>(false)
    // OQ-UX-AUTH-6: read the one-time token from path-param OR query.
    const params = useParams<{ token?: string }>()
    const [searchParams] = useSearchParams()
    const token = params.token || searchParams.get('token') || ''

    const { className, setMessage, setResetComplete, resetComplete, children } =
        props

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<ResetPasswordFormSchema>({
        resolver: zodResolver(validationSchema),
    })

    const onResetPassword = async (values: ResetPasswordFormSchema) => {
        const { newPassword } = values

        try {
            const resp = await apiResetPassword<boolean>({
                password: newPassword,
                token,
            })
            if (resp) {
                setSubmitting(false)
                setResetComplete?.(true)
            }
        } catch (errors) {
            setMessage?.(
                typeof errors === 'string'
                    ? errors
                    : 'Не удалось сбросить пароль. Ссылка могла устареть.',
            )
            setSubmitting(false)
        }

        setSubmitting(false)
    }

    return (
        <div className={className}>
            {!resetComplete ? (
                <Form onSubmit={handleSubmit(onResetPassword)}>
                    <FormItem
                        label="Пароль"
                        invalid={Boolean(errors.newPassword)}
                        errorMessage={errors.newPassword?.message}
                    >
                        <Controller
                            name="newPassword"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    autoComplete="off"
                                    placeholder="••••••••••••"
                                    {...qaWithAlias(
                                        'host.resetPassword.newPassword',
                                        'host.resetPassword.password',
                                    )}
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Подтвердите пароль"
                        invalid={Boolean(errors.confirmPassword)}
                        errorMessage={errors.confirmPassword?.message}
                    >
                        <Controller
                            name="confirmPassword"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    autoComplete="off"
                                    placeholder="Подтвердите пароль"
                                    {...qa('host.resetPassword.confirmPassword')}
                                    {...field}
                                />
                            )}
                        />
                    </FormItem>
                    <Button
                        block
                        loading={isSubmitting}
                        variant="solid"
                        type="submit"
                        {...qa('host.resetPassword.submit')}
                    >
                        {isSubmitting ? 'Сохранение...' : 'Сбросить пароль'}
                    </Button>
                </Form>
            ) : (
                <>{children}</>
            )}
        </div>
    )
}

export default ResetPasswordForm
