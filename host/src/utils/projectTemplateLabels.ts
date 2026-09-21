import { useEffect, useState } from 'react'
import { apiGetProjectTemplates, type ProjectTemplate } from '@/services/CrmService'
import { FALLBACK_PROJECT_TEMPLATES } from '@/views/global/CreateProject/templatesFallback'

export type ProjectTemplateCatalog = Map<string, string>

/** Resolve human-readable template name; unknown ids fall back to the raw id. */
export function templateLabelFromCatalog(
    templateId: string | undefined,
    catalog: ProjectTemplateCatalog,
): string | null {
    const id = templateId?.trim()
    if (!id) return null
    return catalog.get(id) ?? id
}

/** User-facing label for project list / selector (FR-PSET-330). */
export function formatCreatedFromTemplateLabel(templateName: string): string {
    return `По шаблону: ${templateName}`
}

export function buildTemplateCatalog(templates: ProjectTemplate[]): ProjectTemplateCatalog {
    return new Map(templates.map((t) => [t.id, t.name]))
}

let cachedCatalog: ProjectTemplateCatalog | null = null

/**
 * Loads the authoritative template catalog once per session (with FE fallback).
 * Shared by ProjectsList and ProjectSelector.
 */
export function useProjectTemplateCatalog(): ProjectTemplateCatalog {
    const [catalog, setCatalog] = useState<ProjectTemplateCatalog>(
        () => cachedCatalog ?? buildTemplateCatalog(FALLBACK_PROJECT_TEMPLATES),
    )

    useEffect(() => {
        if (cachedCatalog) {
            setCatalog(cachedCatalog)
            return
        }
        let cancelled = false
        void apiGetProjectTemplates()
            .then((list) => {
                if (cancelled) return
                const next = buildTemplateCatalog(
                    Array.isArray(list) && list.length > 0
                        ? list
                        : FALLBACK_PROJECT_TEMPLATES,
                )
                cachedCatalog = next
                setCatalog(next)
            })
            .catch(() => {
                if (cancelled) return
                const next = buildTemplateCatalog(FALLBACK_PROJECT_TEMPLATES)
                cachedCatalog = next
                setCatalog(next)
            })
        return () => {
            cancelled = true
        }
    }, [])

    return catalog
}
