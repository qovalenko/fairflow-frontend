import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PiBuildingsDuotone } from 'react-icons/pi'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Container from '@/components/shared/Container'
import { useSessionUser } from '@/store/authStore'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import OnboardingProgress from '@/views/onboarding/OnboardingProgress'
import { apiGetSystem } from '@/services/CrmService'
import { qa, qaWithAlias } from '@/shared/qa'
import type { OrganizationInfo, OrgRole } from '@/@types/auth'

/**
 * SCR-BOX-ORG-RECOVERY (BX-ONB-2, BOX-ONBOARDING §3-D1/D2/§4) — восстановление
 * посадки, когда сессия ещё без Системы.
 *
 * box single-tenant, invite-only: единственная Система создаётся при первом
 * запуске (bootstrap), пользователь НЕ заводит её из UI (метод создания убран —
 * DEORG-W4). Этот экран закрывает ровно один хвост: сессия вошла, но Система
 * ещё не зарезолвилась (`user.system` пуст). Вместо белого экрана — краткое
 * пояснение и кнопка «Обновить», которая перечитывает Систему (`GET /v1/system`)
 * и, как только она появилась, детерминированно уводит дальше:
 *  - есть проект → в приложение;
 *  - владелец/админ без проекта → в мастер первого проекта Системы;
 *  - сотрудник без проекта → на информ-заглушку NO-PROJECTS.
 *
 * Если Система уже есть — форма не показывается (гейт-редирект уводит сразу).
 */
const OrgSetupRecovery = () => {
    const navigate = useNavigate()
    const user = useSessionUser((s) => s.user)
    const setUser = useSessionUser((s) => s.setUser)
    const { systemId, isSystemOwnerOrAdmin, projects } = useWorkspaceRole()
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Пока идёт наш собственный редирект — не даём гейту сработать повторно.
    const leavingRef = useRef(false)

    // Детерминированный уход, как только Система зарезолвилась.
    const routeOnward = (
        hasSystem: boolean,
        canCreate: boolean,
        hasProjects: boolean,
    ) => {
        if (!hasSystem) return
        leavingRef.current = true
        if (hasProjects) {
            navigate('/', { replace: true })
        } else if (canCreate && systemId) {
            navigate(`/account/projects/new?owner=${systemId}`, {
                replace: true,
            })
        } else {
            navigate('/onboarding/no-projects', { replace: true })
        }
    }

    // Гейт: Система уже есть → уводим сразу (форма не нужна).
    useEffect(() => {
        if (leavingRef.current) return
        if (systemId) {
            routeOnward(true, isSystemOwnerOrAdmin, projects.length > 0)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [systemId, isSystemOwnerOrAdmin, projects.length])

    const handleRefresh = async () => {
        setError(null)
        setRefreshing(true)
        try {
            const systemData = await apiGetSystem()
            if (!systemData) {
                setError(
                    'Система ещё не инициализирована. Обратитесь к администратору.',
                )
                return
            }
            const nextSystem: OrganizationInfo = {
                id: systemData.id,
                name: systemData.name,
                role: (systemData.role as OrgRole | undefined) ?? 'employee',
            }
            leavingRef.current = true
            setUser({
                ...user,
                system: nextSystem,
                systemRole: nextSystem.role ?? user.systemRole,
            })
            const canCreate =
                nextSystem.role === 'platform_owner' ||
                nextSystem.role === 'platform_admin'
            const hasProjects = (user.projects ?? []).length > 0
            if (hasProjects) {
                navigate('/', { replace: true })
            } else if (canCreate) {
                navigate(`/account/projects/new?owner=${nextSystem.id}`, {
                    replace: true,
                })
            } else {
                navigate('/onboarding/no-projects', { replace: true })
            }
        } catch {
            leavingRef.current = false
            setError('Не удалось получить данные Системы. Попробуйте позже.')
        } finally {
            setRefreshing(false)
        }
    }

    // Система уже есть — форму не рендерим (гейт уже уводит дальше).
    if (systemId) {
        return null
    }

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard
                    className="max-w-md w-full"
                    {...qa('host.onboarding.orgRecovery.card')}
                >
                    <OnboardingProgress stage={1} className="mb-8" />
                    <div className="text-center">
                        <div className="mb-4 flex justify-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-subtle text-primary">
                                <PiBuildingsDuotone className="text-3xl" />
                            </span>
                        </div>
                        <h4 className="mb-2" {...qa('host.orgRecovery.title')}>
                            Система ещё не готова
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Учётная запись создана, но данные Системы ещё не
                            загрузились. Нажмите «Обновить» — как только Система
                            появится, вы продолжите работу.
                        </p>
                        {error && (
                            <p
                                className="text-sm text-red-600 dark:text-red-400 mt-4"
                                {...qaWithAlias(
                                    'host.onboarding.orgSetupRecovery.error',
                                    'host.orgRecovery.error',
                                )}
                            >
                                {error}
                            </p>
                        )}
                        <Button
                            block
                            variant="solid"
                            className="mt-6"
                            loading={refreshing}
                            onClick={handleRefresh}
                            {...qaWithAlias(
                                'host.onboarding.orgSetupRecovery.refresh',
                                'host.orgRecovery.refresh',
                            )}
                        >
                            Обновить
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default OrgSetupRecovery
