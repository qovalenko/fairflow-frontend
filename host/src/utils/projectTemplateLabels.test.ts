import { describe, expect, it } from 'vitest'
import {
    buildTemplateCatalog,
    formatCreatedFromTemplateLabel,
    templateLabelFromCatalog,
} from './projectTemplateLabels'

describe('projectTemplateLabels', () => {
    const catalog = buildTemplateCatalog([
        { id: 'b2b-sales', name: 'Продажи B2B', modules: [], pipeline: { name: 'x', stages: [] } },
    ])

    it('returns null for empty template id', () => {
        expect(templateLabelFromCatalog(undefined, catalog)).toBeNull()
        expect(templateLabelFromCatalog('', catalog)).toBeNull()
    })

    it('resolves known template name from catalog', () => {
        expect(templateLabelFromCatalog('b2b-sales', catalog)).toBe('Продажи B2B')
    })

    it('falls back to raw id for unknown template', () => {
        expect(templateLabelFromCatalog('legacy-id', catalog)).toBe('legacy-id')
    })

    it('formats user-facing label', () => {
        expect(formatCreatedFromTemplateLabel('Продажи B2B')).toBe(
            'По шаблону: Продажи B2B',
        )
    })
})
