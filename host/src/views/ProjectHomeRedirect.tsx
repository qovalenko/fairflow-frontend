import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import { useNavigationConfigWithState } from '@/utils/hooks/useNavigationConfig'
import useSessionHydrated from '@/utils/hooks/useSessionHydrated'
import Loading from '@/components/shared/Loading'
import NotFound from '@/views/others/NotFound'
import type { ProjectInfo } from '@/@types/auth'
import { qa } from '@/shared/qa'

/**
 * SCR-PROJECT-HOME-REDIRECT — top-level `/p/:pid` dispatcher.
 *
 * Прямой URL `/p/:pid` (deep-link/закладка) раньше падал в catch-all → 404,
 * хотя проект существует и доступен через переключатель. Этот экран
 * резолвит проект по `:pid` и редиректит в его рабочее пространство
 * (первый доступный модуль, как ветка `project` в Home-диспетчере).
 *
 * Контекст проекта живёт в store/localStorage, в URL портфельных страниц
 * `/p` нет — поэтому `useResolvedProjectId` (он читает `:pid`, валидирует по
 * userProjects и проставляет currentProject в projectStore) даёт ту же
 * установку контекста, что и переключатель проектов.
 *
 * Целевой модуль берём из ТОГО ЖЕ источника, что рендерит сайдбар
 * (`useNavigationConfigWithState` → манифест `/api/v1/platform/modules` ∩ права):
 * первый пункт меню (`firstPath`). Резолвим АСИНХРОННО — ждём `ready`, иначе
 * до загрузки модулей улетали на дефолтный `/statistics`, который может быть
 * выключен → «Раздел недоступен» + 403 dashboard (баг C).
 *
 * Невалидный `:pid` (нет в userProjects) → NotFound (ST-9), консистентно
 * с остальным роутингом.
 */
const ProjectHomeRedirect = () => {
    const navigate = useNavigate()
    const { pid } = useParams<{ pid?: string }>()
    const sessionHydrated = useSessionHydrated()
    const { projects: userProjects } = useLiveProjects()
    // Сайд-эффект хука: при валидном :pid проставляет currentProject в store.
    useResolvedProjectId()
    // Меню проекта: тот же источник, что и сайдбар (enabled-модули ∩ права),
    // загружается асинхронно — `ready` гарантирует, что дерево финальное.
    const { firstPath, ready } = useNavigationConfigWithState()

    const isValid =
        !!pid && userProjects.some((p: ProjectInfo) => p.id === pid)

    useEffect(() => {
        if (!sessionHydrated || !isValid) return
        // Ждём, пока модули/права проекта догрузятся (async) — только тогда
        // дерево меню финальное и его первый пункт корректен.
        if (!ready) return
        // firstPath — первый доступный пункт меню; при пустом меню (нет ни одного
        // включённого/разрешённого модуля) уводим на безопасный дефолт (список
        // проектов/онбординг), НЕ на статистику.
        navigate(firstPath ?? '/account/projects', { replace: true })
    }, [sessionHydrated, isValid, ready, firstPath, navigate])

    if (!sessionHydrated) {
        return (
            <div
                className="flex flex-auto flex-col h-[100vh] justify-center items-center"
                {...qa('host.projectHome.loading')}
            >
                <Loading loading={true} />
            </div>
        )
    }

    // Неизвестный/недоступный проект → 404 (как любой нераспознанный путь).
    if (!isValid) return <NotFound />

    // Пока меню проекта грузится (async) — показываем загрузку, а не пустоту.
    return (
        <div
            className="flex flex-auto flex-col h-[100vh] justify-center items-center"
            {...qa('host.projectHome.loading')}
        >
            <Loading loading={true} />
        </div>
    )
}

export default ProjectHomeRedirect

