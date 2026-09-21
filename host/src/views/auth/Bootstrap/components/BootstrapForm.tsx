import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PiQuestion } from 'react-icons/pi'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import { FormItem, Form } from '@/components/ui/Form'
import PasswordInput from '@/components/shared/PasswordInput'
import { useAuth } from '@/auth'
import { apiBootstrap } from '@/services/BootstrapService'
import { usePublicConfigStore } from '@/store/publicConfigStore'
import { qa } from '@/shared/qa'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { CommonProps } from '@/@types/common'
import type { AxiosError } from 'axios'

interface BootstrapFormProps extends CommonProps {
    setMessage?: (message: string) => void
}

type BootstrapFormSchema = {
    organizationName: string
    inn: string
    name: string
    email: string
    password: string
    confirmPassword: string
}

const validationSchema = z
    .object({
        organizationName: z
            .string()
            .min(1, { message: 'Введите название организации' }),
        inn: z
            .string()
            .refine((v) => !v.trim() || /^(\d{10}|\d{12})$/.test(v.trim()), {
                message: 'ИНН — 10 цифр (юрлицо) или 12 (ИП)',
            }),
        name: z.string().min(1, { message: 'Введите ФИО' }),
        email: z
            .string()
            .min(1, { message: 'Введите email' })
            .email({ message: 'Некорректный email' }),
        password: z
            .string()
            .min(8, { message: 'Пароль должен быть не короче 8 символов' }),
        confirmPassword: z.string().min(1, { message: 'Повторите пароль' }),
    })
    .refine((v) => v.password === v.confirmPassword, {
        message: 'Пароли не совпадают',
        path: ['confirmPassword'],
    })

/**
 * «?»-иконка в правом слоте поля: подсказка при наведении. Полезна, когда поле
 * уже заполнено и плейсхолдер скрыт — наводишь на «?» и видишь, что это за поле.
 */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

/**
 * BootstrapForm — «Создание первого администратора» коробки (§5.4 / §7 шаг 17).
 * Поля без подписей: плейсхолдер + «?»-тултип справа. Успех (201) → авто-логин
 * (bootstrapSignIn) и уход в приложение. 409 ALREADY_INITIALIZED → на /auth/signin.
 * 403 BOOTSTRAP_DISABLED / 400 → показать ошибку.
 */
const BootstrapForm = (props: BootstrapFormProps) => {
    const { className, setMessage } = props
    const [isSubmitting, setSubmitting] = useState(false)
    const navigate = useNavigate()
    const { bootstrapSignIn } = useAuth()

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<BootstrapFormSchema>({
        defaultValues: {
            organizationName: '',
            inn: '',
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
        },
        resolver: zodResolver(validationSchema),
    })

    const onSubmit = async (values: BootstrapFormSchema) => {
        setSubmitting(true)
        setMessage?.('')
        try {
            const resp = await apiBootstrap({
                email: values.email,
                password: values.password,
                name: values.name,
                organizationName: values.organizationName,
                inn: values.inn.trim() || undefined,
            })
            const result = await bootstrapSignIn(resp)
            if (result?.status === 'failed') {
                setMessage?.(result.message || 'Не удалось завершить настройку')
            }
        } catch (e) {
            const err = e as AxiosError<{ code?: string; message?: string }>
            const status = err?.response?.status
            const code = err?.response?.data?.code
            if (status === 409 || code === 'ALREADY_INITIALIZED') {
                // Коробка уже инициализирована → обычный вход. Сервер только что
                // сказал это авторитетно, поэтому снимаем needsBootstrap: иначе
                // PublicConfigGate со старым конфигом вернёт с /auth/signin обратно.
                const { config, setConfig } = usePublicConfigStore.getState()
                setConfig({ ...config, needsBootstrap: false })
                navigate('/auth/signin?reason=already_initialized', {
                    replace: true,
                })
                return
            }
            if (status === 403 || code === 'BOOTSTRAP_DISABLED') {
                setMessage?.('Первичная настройка недоступна в этом окружении.')
            } else if (code === 'ORG_CREATE_FAILED') {
                setMessage?.(
                    err?.response?.data?.message ||
                        'Учётная запись создана, но Система не настроена. Повторите отправку с тем же email.',
                )
            } else {
                setMessage?.(
                    err?.response?.data?.message ||
                        'Не удалось создать администратора. Проверьте данные и повторите.',
                )
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={className}>
            <Form onSubmit={handleSubmit(onSubmit)}>
                <FormItem
                    invalid={Boolean(errors.organizationName)}
                    errorMessage={errors.organizationName?.message}
                >
                    <Controller
                        name="organizationName"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                placeholder="Название организации"
                                autoComplete="off"
                                suffix={<HelpIcon title="Название организации" />}
                                {...qa('host.bootstrap.organizationName')}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    invalid={Boolean(errors.inn)}
                    errorMessage={errors.inn?.message}
                >
                    <Controller
                        name="inn"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                inputMode="numeric"
                                placeholder="ИНН организации (необязательно)"
                                autoComplete="off"
                                suffix={
                                    <HelpIcon title="ИНН организации (необязательно) — 10 цифр (юрлицо) или 12 (ИП)" />
                                }
                                {...qa('host.bootstrap.inn')}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    invalid={Boolean(errors.name)}
                    errorMessage={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                placeholder="Иванов Иван"
                                autoComplete="off"
                                suffix={<HelpIcon title="ФИО администратора" />}
                                {...qa('host.bootstrap.name')}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
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
                                placeholder="admin@example.com"
                                autoComplete="off"
                                suffix={
                                    <HelpIcon title="Эл. почта — логин администратора" />
                                }
                                {...qa('host.bootstrap.email')}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    invalid={Boolean(errors.password)}
                    errorMessage={errors.password?.message}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Пароль — не короче 8 символов"
                                autoComplete="new-password"
                                {...qa('host.bootstrap.password')}
                                {...field}
                            />
                        )}
                    />
                </FormItem>
                <FormItem
                    invalid={Boolean(errors.confirmPassword)}
                    errorMessage={errors.confirmPassword?.message}
                >
                    <Controller
                        name="confirmPassword"
                        control={control}
                        render={({ field }) => (
                            <PasswordInput
                                placeholder="Повторите пароль"
                                autoComplete="new-password"
                                {...qa('host.bootstrap.confirmPassword')}
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
                    {...qa('host.bootstrap.submit')}
                >
                    {isSubmitting ? 'Создание...' : 'Создать администратора'}
                </Button>
            </Form>
        </div>
    )
}

export default BootstrapForm
