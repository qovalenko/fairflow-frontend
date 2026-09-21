import { describe, expect, it } from 'vitest'
import { mapControlProjectsToUser } from './mapControlProjects'

describe('mapControlProjectsToUser', () => {
    it('maps template_id from control wire shape (FR-PSET-330)', () => {
        const projects = mapControlProjectsToUser([
            {
                id: 'p1',
                name: 'Alpha',
                template_id: 'b2b-sales',
                modules: ['deals'],
            },
            {
                id: 'p2',
                name: 'Beta',
                templateId: 'call-center',
                modules: ['deals'],
            },
            {
                id: 'p3',
                name: 'Gamma',
                template_id: '  ',
                modules: ['deals'],
            },
        ])
        expect(projects[0].templateId).toBe('b2b-sales')
        expect(projects[1].templateId).toBe('call-center')
        expect(projects[2].templateId).toBeUndefined()
    })
})
