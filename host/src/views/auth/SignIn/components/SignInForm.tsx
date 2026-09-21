import { useState } from 'react'
import { PiQuestion } from 'react-icons/pi'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import { qa } from '@/shared/qa'
import classNames from '@/utils/classNames'
import { useAuth } from '@/auth'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CommonProps } from '@/@types/common'
import type { ReactNode } from 'react'

interface SignInFormProps extends CommonProps {
    disableSubmit?: boolean
    passwordHint?: string | ReactNode
    setMessage?: (message: string) => void
}

type SignInFormSchema = {
    email: string
    password: string
}

const validationSchema = z.object({
    email: z.string().min(1, { message: 'Введите email' }),
    password: z.string().min(1, { message: 'Введите пароль' }),
})

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

const SignInForm = (props: SignInFormProps) => {
    const [isSubmitting, setSubmitting] = useState<boolean>(false)

    const { disableSubmit = false, className, setMessage, passwordHint } = props

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<SignInFormSchema>({
        defaultValues: {
            email: '',
            password: '',
        },
        resolver: zodResolver(validationSchema),
    })

    const { signIn } = useAuth()

    const onSignIn = async (values: SignInFormSchema) => {
        const { email, password } = values

        if (!disableSubmit) {
            setSubmitting(true)

            const result = await signIn({ email, password })

            if (result?.status === 'failed') {
                setMessage?.(result.message)
            }
        }

        setSubmitting(false)
    }

    return (
        <div className={className}>
            <Form onSubmit={handleSubmit(onSignIn)}>
                <FormItem
                    invalid={Boolean(errors.email)}
                    errorMessage={errors.email?.message}
                >
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="email"
                                placeholder="Эл. почта"
                                autoComplete="off"
                                suffix={<HelpIcon title="Эл. почта — ваш логин" />}
                                {...field}
                                {...qa('host.login.email')}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    invalid={Boolean(errors.password)}
                    errorMessage={errors.password?.message}
                    className={classNames(
                        passwordHint ? 'mb-0' : '',
                        errors.password?.message ? 'mb-8' : '',
                    )}
                >
                    <Controller
                        name="password"
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                            <PasswordInput
                                type="text"
                                placeholder="Пароль"
                                autoComplete="off"
                                {...field}
                                {...qa('host.login.password')}
                            />
                        )}
                    />
                </FormItem>
                {passwordHint}
                <Button
                    block
                    loading={isSubmitting}
                    variant="solid"
                    type="submit"
                    {...qa('host.login.submit')}
                >
                    {isSubmitting ? 'Вход...' : 'Войти'}
                </Button>
            </Form>
        </div>
    )
}

export default SignInForm
