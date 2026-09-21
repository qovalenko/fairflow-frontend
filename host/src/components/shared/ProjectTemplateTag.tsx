import Tag from '@/components/ui/Tag'
import { qa } from '@/shared/qa'
import {
    formatCreatedFromTemplateLabel,
    templateLabelFromCatalog,
    useProjectTemplateCatalog,
} from '@/utils/projectTemplateLabels'

type ProjectTemplateTagProps = {
    templateId?: string
    className?: string
}

/** FR-PSET-330 — «создан по шаблону X» chip for project list / selector. */
export function ProjectTemplateTag({ templateId, className }: ProjectTemplateTagProps) {
    const catalog = useProjectTemplateCatalog()
    const label = templateLabelFromCatalog(templateId, catalog)
    if (!label) return null
    return (
        <Tag
            {...qa('host.projectsList.templateTag', { template: templateId ?? '' })}
            className={
                className ??
                'text-xs bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
            }
        >
            {formatCreatedFromTemplateLabel(label)}
        </Tag>
    )
}
