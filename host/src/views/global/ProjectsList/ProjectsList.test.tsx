import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const mockProjects = Array.from({ length: 6 }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Project ${i + 1}`,
    color: '#6366f1',
    role: 'member' as const,
    status: 'active' as const,
}))

vi.mock('@/utils/hooks/useLiveProjects', () => ({
    useLiveProjects: () => ({
        projects: mockProjects,
        loading: false,
        error: null,
        refresh: vi.fn(),
    }),
}))
vi.mock('@/components/shared/ProjectTemplateTag', () => ({
    ProjectTemplateTag: () => null,
}))
vi.mock('@/services/CrmService', () => ({
    apiRestoreProject: vi.fn(),
}))

import ProjectsList from './ProjectsList'

describe('ProjectsList search (FR-PROJ-390)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows search when more than 5 projects and filters cards', () => {
        render(
            <MemoryRouter>
                <ProjectsList skipContainer />
            </MemoryRouter>,
        )

        const search = screen.getByLabelText('Поиск проекта')
        expect(search).toBeInTheDocument()

        fireEvent.change(search, { target: { value: 'Project 6' } })
        expect(screen.getByText('Project 6')).toBeInTheDocument()
        expect(screen.queryByText('Project 1')).not.toBeInTheDocument()
    })
})
