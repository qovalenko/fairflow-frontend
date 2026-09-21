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
    apiGetProjectInvitation,
    apiAcceptProjectInvitation,
    type ProjectInvitationDetails,
} from '@/services/CrmService'
import { useAuth } from '@/auth'
import type { AxiosError } from 'axios'
import { qa, qaWithAlias } from '@/shared/qa'

const roleLabels: Record<string, string> = {
    owner: 'Владелец',
    admin: 'Админ',
    manager: 'Менеджер',
    member: 'Участник',
    viewer: 'Наблюдатель',
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

const ProjectInviteAccept = () => {
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const { authenticated } = useAuth()
    const signInHref = `/auth/signin?redirectUrl=${encodeURIComponent(
        `/auth/project-invite/${token ?? ''}`,
    )}`

    const [loading, setLoading] = useState(true)
    const [details, setDetails] = useState<ProjectInvitationDetails | null>(null)
    const [loadError, setLoadError] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
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
            const d = await apiGetProjectInvitation(token)
            setDetails(d)
        } catch {
            setLoadError(true)
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => {
        void fetchDetails()
    }, [fetchDetails])

    const accept = async (payload?: { name?: string; password?: string }) => {
        if (!token || !details) return
        setIsSubmitting(true)
        setError(null)
        try {
            const r = await apiAcceptProjectInvitation({ token, ...payload })
            setLandingProjectId(r.landingProjectId ?? r.projectId ?? null)
            setDone(true)
        } catch (e) {
            const status = (e as AxiosError)?.response?.status
            if (status === 401) {
                setError('Войдите как приглашённый пользователь, чтобы принять приглашение.')
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
                    {...qaWithAlias(
                        'host.projectInviteAccept.loading',
                        'host.projectInvite.loading',
                    )}
                >
                    <Spinner size={40} />
                </div>
            </CenteredCard>
        )
    }

    if (loadError || !details) {
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.projectInviteAccept.notFound')}>
                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение не найдено</h2>
                </div>
            </CenteredCard>
        )
    }

    if (done) {
        const signInTarget = landingProjectId
            ? `/auth/signin?redirectUrl=${encodeURIComponent(`/p/${landingProjectId}`)}`
            : '/auth/signin'
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.projectInviteAccept.success')}>
                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение принято</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Вы присоединились к проекту «{details.projectName}». Войдите, чтобы
                        продолжить.
                    </p>
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={() => navigate(signInTarget)}
                        {...qaWithAlias(
                            'host.projectInviteAccept.successCta',
                            'host.projectInvite.goToSignIn',
                        )}
                        {...qa('host.projectInvite.signIn')}
                    >
                        Перейти ко входу
                    </Button>
                </div>
            </CenteredCard>
        )
    }

    if (details.status === 'accepted' || details.expired || details.status === 'revoked') {
        return (
            <CenteredCard>
                <div className="text-center" {...qa('host.projectInviteAccept.invalid')}>
                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Приглашение недействительно</h2>
                </div>
            </CenteredCard>
        )
    }

    return (
        <CenteredCard>
            <div
                className="text-center mb-6"
                {...qaWithAlias('host.projectInviteAccept.form', 'host.projectInvite.details')}
            >
                <PiUserPlusDuotone className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2" {...qa('host.projectInviteAccept.heading')}>
                    Вас пригласили в проект «{details.projectName}»
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {details.email} · роль: {roleLabels[details.role] ?? details.role}
                </p>
            </div>
            {error && (
                <div
                    className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm"
                    {...qaWithAlias('host.projectInviteAccept.error', 'host.projectInvite.error')}
                >
                    {error}
                </div>
            )}
            {details.userExists ? (
                <div className="space-y-4">
                    {authenticated ? (
                        <Button
                            block
                            variant="solid"
                            color="primary"
                            loading={isSubmitting}
                            {...qa('host.projectInvite.accept')}
                            onClick={() => accept()}
                            {...qaWithAlias(
                                'host.projectInviteAccept.acceptExisting',
                                'host.projectInvite.acceptExisting',
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
                                'host.projectInviteAccept.signInAndAccept',
                                'host.projectInvite.signInAndAccept',
                            )}
                        >
                            Войти и принять
                        </Button>
                    )}
                </div>
            ) : (
                <Form onSubmit={handleSubmit((v) => accept(v))}>
                    <FormItem label="Имя" invalid={Boolean(errors.name)} errorMessage={errors.name?.message}>
                        <Controller
                            name="name"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    placeholder="Введите ваше имя"
                                    {...field}
                                    {...qaWithAlias(
                                        'host.projectInviteAccept.name',
                                        'host.projectInvite.name',
                                    )}
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
                                        'host.projectInviteAccept.password',
                                        'host.projectInvite.password',
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
                            'host.projectInviteAccept.registerAndAccept',
                            'host.projectInvite.submit',
                        )}
                        {...qa('host.projectInvite.registerSubmit')}
                    >
                        Принять и зарегистрироваться
                    </Button>
                </Form>
            )}
        </CenteredCard>
    )
}

export default ProjectInviteAccept
