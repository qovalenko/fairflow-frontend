import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import Loading from '@/components/shared/Loading'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { qa } from '@/shared/qa'

/**
 * Коробка = одна Система (single-tenant, invite-only): личного вектора нет,
 * Система создаётся при первом запуске (bootstrap). Экран выбора не нужен — это
 * невидимый детерминированный редиректор:
 *  - есть проект → в приложение;
 *  - Система резолвится, проекта нет, пользователь владелец/админ → в мастер
 *    первого проекта Системы;
 *  - Система резолвится, проекта нет, сотрудник → на информ-заглушку NO-PROJECTS
 *    (ждёт назначения администратором);
 *  - Система НЕ резолвится (сессия ещё без Системы) → в box-восстановление
 *    (`/onboarding/organization`), а не в белый экран.
 *
 * Любой вход приводит к навигации; пока идёт переход — показываем лоадер.
 */
const ProjectEntryChoice = () => {
    const navigate = useNavigate()
    const { systemId, isSystemOwnerOrAdmin, projects } = useWorkspaceRole()

    useEffect(() => {
        if (projects.length > 0) {
            navigate('/', { replace: true })
        } else if (!systemId) {
            navigate('/onboarding/organization', { replace: true })
        } else if (isSystemOwnerOrAdmin) {
            navigate(`/account/projects/new?owner=${systemId}`, {
                replace: true,
            })
        } else {
            navigate('/onboarding/no-projects', { replace: true })
        }
    }, [projects.length, systemId, isSystemOwnerOrAdmin, navigate])

    return (
        <div {...qa('host.onboarding.entryChoice.loader')}>
            <Loading loading className="min-h-screen" />
        </div>
    )
}

export default ProjectEntryChoice
