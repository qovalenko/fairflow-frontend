import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import {
    PiUserPlusDuotone,
    PiWarningCircleDuotone,
    PiCheckCircleDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import PasswordInput from '@/components/shared/PasswordInput'
import { FormItem, Form } from '@/components/ui/Form'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    apiGetInvitation,
    apiAcceptInvitation,
    type InvitationDetails,
} from '@/services/CrmService'
import { useAuth } from '@/auth'
import type { AxiosError } from 'axios'
import { saveInviteAcceptanceBanner } from '@/utils/inviteAcceptanceBanner'
import { qa, qaWithAlias } from '@/shared/qa'

const roleLabels: Record<string, string> = {
    platform_admin: 'Администратор',
    employee: 'Сотрудник',
}

const inviteSchema = z.object({
    name: z.string().min(1, { message: 'Введите имя' }),
    password: z.string().min(6, { message: 'Пароль должен содержать минимум 6 символов' }),
})

type InviteFormSchema = z.infer<typeof inviteSchema>

const CenteredCard = ({ children }: { children: React.ReactNode }) => (
    <Container>
        <div className="min-h-screen flex items-center justify-center py-12 px-4">
            <AdaptiveCard className="max-w-md w-full">{children}</AdaptiveCard>
        </div>
    </Container>
)

const InviteAccept = () => {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const { authenticated } = useAuth()
    const signInHref = `/auth/signin?redirectUrl=${encodeURIComponent(`/auth/invite/${token ?? ''}`)}`

    const [loading, setLoading] = useState(true)
    const [details, setDetails] = useState<InvitationDetails | null>(null)
    const [loadError, setLoadError] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    // FR-ONB-10: first project this invite granted → land there after sign-in.
    const [landingProjectId, setLandingProjectId] = useState<string | null>(null)

    const {
        handleSubmit,
        formState: { errors },
        control,
    } = useForm<InviteFormSchema>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { name: '', password: '' },
    })

    const fetchDetails = useCallback(async () => {
        if (!token) {
            setLoadError(true)
            setLoading(false)
            return
        }
        setLoading(true)
        try {
            const d = await apiGetInvitation(token)
            setDetails(d)
        } catch (e) {
            console.error('Load invitation failed:', e)
            setLoadError(true)
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => {
        fetchDetails()
    }, [fetchDetails])

    const accept = async (payload?: { name?: string; password?: string }) => {
        if (!token || !details) return
        setIsSubmitting(true)
        setError(null)
        try {
            const r = await apiAcceptInvitation({ token, ...payload })
            setLandingProjectId(r.landingProjectId ?? null)
            if (details.userExists) {
                saveInviteAcceptanceBanner({
                    organizationName: details.organizationName,
                    projectIds: (r.projectGrants ?? []).map((g) => g.projectId),
                })
            }
            setDone(true)
        } catch (e) {
            console.error('Accept invitation failed:', e)
            const status = (e as AxiosError)?.response?.status
            if (status === 401) {
                setError(
                    'Войдите как приглашённый пользователь, чтобы принять приглашение.',
                )
            } else {
                setError('Не удалось принять приглашение. Попробуйте ещё раз.')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    if (loading) {
        return (
            <CenteredCard>
                <div
                    className="flex justify-center py-10"
                    {...qaWithAlias('host.inviteAccept.loading', 'host.invite.loading')}
                >
                    <Spinner size={40} />
                </div>
            </CenteredCard>
        )
    }

    if (loadError || !details) {
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.inviteAccept.notFound')}>
                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение не найдено</h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Ссылка недействительна или приглашение было удалено.
                    </p>
                </div>
            </CenteredCard>
        )
    }

    if (done) {
        // After sign-in, land on the first granted project (FR-ONB-1); the
        // AuthProvider honours ?redirectUrl. No grant → default entry path.
        const signInTarget = landingProjectId
            ? `/auth/signin?redirectUrl=${encodeURIComponent(`/p/${landingProjectId}`)}`
            : '/auth/signin'
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.inviteAccept.success')}>
                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение принято</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Вы присоединились к организации «{details.organizationName}»
                        {landingProjectId ? ' и получили доступ к проекту' : ''}. Войдите,
                        чтобы продолжить.
                    </p>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={() => navigate(signInTarget)}
                        {...qaWithAlias(
                            'host.inviteAccept.successCta',
                            'host.invite.goToSignIn',
                        )}
                    >
                        Перейти ко входу
                    </Button>
                </div>
            </CenteredCard>
        )
    }

    if (details.status === 'accepted') {
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.inviteAccept.alreadyUsed')}>
                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение уже использовано</h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Это приглашение уже было принято.
                    </p>
                </div>
            </CenteredCard>
        )
    }

    if (details.expired || details.status === 'revoked') {
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.inviteAccept.invalid')}>
                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение недействительно</h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Срок действия приглашения истёк или оно было отозвано. Обратитесь к
                        администратору организации за новым приглашением.
                    </p>
                </div>
            </CenteredCard>
        )
    }

    return (
        <CenteredCard>
            <div
                className="text-center mb-6"
                {...qaWithAlias('host.inviteAccept.form', 'host.invite.details')}
            >
                <PiUserPlusDuotone className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">
                    Вас пригласили в «{details.organizationName}»
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {details.email} · роль: {roleLabels[details.role] ?? details.role}
                </p>
            </div>

            {error && (
                <div
                    className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"
                    {...qaWithAlias('host.inviteAccept.error', 'host.invite.error')}
                >
                    {error}
                </div>
            )}

            {details.userExists ? (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        {authenticated
                            ? 'У вас уже есть аккаунт Fairflow с этим email. Подтвердите принятие приглашения.'
                            : 'У вас уже есть аккаунт Fairflow с этим email. Войдите, чтобы принять приглашение.'}
                    </p>
                    {authenticated ? (
                        <Button
                            block
                            variant="solid"
                            color="primary"
                            loading={isSubmitting}
                            onClick={() => accept()}
                            {...qaWithAlias(
                                'host.inviteAccept.acceptExisting',
                                'host.invite.acceptExisting',
                            )}
                        >
                            Принять приглашение
                        </Button>
                    ) : (
                        <Button
                            block
                            variant="solid"
                            color="primary"
                            onClick={() => navigate(signInHref)}
                            {...qaWithAlias(
                                'host.inviteAccept.signInAndAccept',
                                'host.invite.signInAndAccept',
                            )}
                        >
                            Войти и принять
                        </Button>
                    )}
                </div>
            ) : (
                <Form onSubmit={handleSubmit((v) => accept(v))}>
                    <FormItem
                        label="Имя"
                        invalid={Boolean(errors.name)}
                        errorMessage={errors.name?.message}
                    >
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    placeholder="Введите ваше имя"
                                    {...field}
                                    {...qaWithAlias('host.inviteAccept.name', 'host.invite.name')}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem
                        label="Пароль"
                        invalid={Boolean(errors.password)}
                        errorMessage={errors.password?.message}
                    >
                        <Controller
                            name="password"
                            control={control}
                            render={({ field }) => (
                                <PasswordInput
                                    placeholder="Создайте пароль"
                                    {...field}
                                    {...qaWithAlias(
                                        'host.inviteAccept.password',
                                        'host.invite.password',
                                    )}
                                />
                            )}
                        />
                    </FormItem>
                    <Button
                        block
                        variant="solid"
                        color="primary"
                        type="submit"
                        loading={isSubmitting}
                        {...qaWithAlias(
                            'host.inviteAccept.registerAndAccept',
                            'host.invite.submit',
                        )}
                    >
                        Принять и зарегистрироваться
                    </Button>
                </Form>
            )}
        </CenteredCard>
    )
}

export default InviteAccept
