import { useMemo } from 'react'
import { getEnabledModules, useProjectStore } from '@/store/projectStore'

/** FR-DOCS-290: вкладка «Документы» на карточках — только при включённом модуле. */
export default function useDocumentsModuleEnabled(): boolean {
    const currentProject = useProjectStore((s) => s.currentProject)
    return useMemo(
        () => getEnabledModules(currentProject).includes('documents'),
        [currentProject],
    )
}
