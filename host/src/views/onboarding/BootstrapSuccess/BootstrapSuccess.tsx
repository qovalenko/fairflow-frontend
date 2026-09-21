import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PiBuildingsDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Container from '@/components/shared/Container'
import { useSessionUser } from '@/store/authStore'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import OnboardingProgress from '@/views/onboarding/OnboardingProgress'
import { qa } from '@/shared/qa'

/**
 * SCR-BOX-BOOTSTRAP-SUCCESS (BX-ONB-4, BOX-ONBOARDING §3-D3/§4) — мост
 * Bootstrap → мастер первого проекта.
 *
 * После успешного bootstrap первый администратор раньше молча телепортировался
 * в «Выберите шаблон» (через невидимый резолвер) — без подтверждения и без
 * общего прогресса. Этот экран замыкает разрыв D3: краткое подтверждение
 * «Организация «X» создана», видимый переход `OnboardingProgress` этап 1→2
 * (Аккаунт готов → Проект) и детерминированный уход в мастер первого проекта.
 *
 * `orgId` берётся надёжно из Системы сессии (`user.system`, single-tenant) с
 * фолбэком на query `owner` (проставляет `bootstrapSignIn` из ответа bootstrap).
 * Если Системы нет — восстановление в `/onboarding/organization` (хвост D2).
 * Если проект уже есть (повторный заход) — молча в приложение.
 */
const BootstrapSuccess = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { system, systemId } = useWorkspaceRole()
    const projects = useSessionUser((s) => s.user.projects)

    const ownerFromQuery = searchParams.get('owner') || undefined
    // orgId надёжно: Система сессии → query (из ответа bootstrap).
    const orgId = systemId ?? ownerFromQuery
    const orgName = system?.name ?? ''

    const hasProject = (projects ?? []).length > 0

    // No-dead-end: нет организации → recovery-экран; уже есть проект (повторный
    // заход на мост) → в приложение. В штатном first-run оба false — рендерим мост.
    useEffect(() => {
        if (hasProject) {
            navigate('/', { replace: true })
            return
        }
        if (!orgId) {
            navigate('/onboarding/organization', { replace: true })
        }
    }, [hasProject, orgId, navigate])

    const goToWizard = () => {
        if (!orgId) return
        navigate(`/account/projects/new?owner=${orgId}`, { replace: true })
    }

    if (hasProject || !orgId) {
        return null
    }

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard
                    className="max-w-md w-full"
                    {...qa('host.onboarding.welcome.card')}
                >
                    <OnboardingProgress stage={2} className="mb-8" />
                    <div className="text-center">
                        <div className="mb-4 flex justify-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
                                <PiBuildingsDuotone className="text-3xl" />
                            </span>
                        </div>
                        <h4 className="mb-2" {...qa('host.onboarding.welcome.heading')}>
                            {orgName
                                ? `Организация «${orgName}» создана`
                                : 'Организация создана'}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Учётная запись администратора готова. Осталось
                            создать первый проект — с него начнётся работа в
                            системе.
                        </p>
                        <Button
                            block
                            variant="solid"
                            className="mt-6"
                            onClick={goToWizard}
                        >
                            Создать первый проект
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default BootstrapSuccess
