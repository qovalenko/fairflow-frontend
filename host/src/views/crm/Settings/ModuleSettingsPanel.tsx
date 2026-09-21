import { Suspense, lazy, useMemo } from 'react'
import RemoteModuleErrorBoundary from '@/components/shared/RemoteModuleErrorBoundary'
import { qa } from '@/shared/qa'
import { getModuleSettingsPanelLoader } from '@/utils/loadRemoteComponent'

interface ModuleSettingsPanelProps {
    /** Модуль, чей экран настроек монтируется (`search`, …). */
    moduleId: string
    /** Проект, в контексте которого открыты настройки. */
    projectId?: string
    /** Contextual UI (ST-17): модуль выключен в проекте — экран показывает заглушку. */
    moduleDisabled?: boolean
}

/**
 * Экран настроек, поставляемый самим модулем (SCR-SEARCH-SETTINGS и аналоги),
 * смонтированный хостом отдельной вкладкой в настройках проекта.
 *
 * Слот `project.settings.tab` после OQ-MODULE-130 — `accessKind:"open"` с
 * гейтом `requires:'project:manage'`, так что вклад business-модуля контрактом
 * не отвергается; этот компонент — host-mount того же federated-экспоуза для
 * случаев, когда вклад через слот не смонтирован (при живом вкладе слот
 * выигрывает — см. `moduleSettingsTabs.ts`, `slotModuleIds`). Подробности —
 * `utils/loadRemoteComponent.ts` (`moduleSettingsPanelExpose`).
 *
 * Изоляция как у слота: своя граница ошибок (падение ремоута не роняет экран
 * настроек) + Suspense на время загрузки federated-бандла.
 */
const ModuleSettingsPanel = ({
    moduleId,
    projectId,
    moduleDisabled,
}: ModuleSettingsPanelProps) => {
    const Panel = useMemo(() => {
        const loader = getModuleSettingsPanelLoader(moduleId)
        return loader ? lazy(loader) : null
    }, [moduleId])

    if (!Panel) return null

    return (
        <div {...qa('host.projectSettings.moduleSettings.root', { module: moduleId })}>
            <RemoteModuleErrorBoundary moduleName={moduleId}>
                <Suspense
                    fallback={
                        <div
                            className="py-4 text-center text-xs text-gray-400 dark:text-gray-500"
                            {...qa('host.projectSettings.moduleSettings.loading', { module: moduleId })}
                        >
                            Загрузка…
                        </div>
                    }
                >
                    <Panel projectId={projectId} moduleDisabled={moduleDisabled} />
                </Suspense>
            </RemoteModuleErrorBoundary>
        </div>
    )
}

export default ModuleSettingsPanel
