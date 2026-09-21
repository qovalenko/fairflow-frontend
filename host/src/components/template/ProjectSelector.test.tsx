import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

const mockProjects = Array.from({ length: 6 }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Project ${i + 1}`,
    color: '#6366f1',
    role: 'member' as const,
    status: 'active' as const,
}))

vi.mock('@/store/projectStore', () => ({
    useProjectStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({
            currentProjectId: 'p-1',
            setCurrentProject: vi.fn(),
            currentProject: null,
        }),
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({ isSystemOwnerOrAdmin: false }),
}))
vi.mock('@/utils/hooks/useLiveProjects', () => ({
    useLiveProjects: () => ({
        projects: mockProjects,
        loading: false,
        error: null,
    }),
}))
vi.mock('@/utils/hoc/withHeaderItem', () => ({
    default: (Component: React.ComponentType) => Component,
}))
vi.mock('@/utils/hooks/invalidateProjectSwitchCaches', () => ({
    invalidateProjectSwitchCaches: vi.fn(),
}))
const hasUnsavedChangesMock = vi.fn(() => false)
vi.mock('@/utils/hooks/useUnsavedChangesGuard', () => ({
    hasUnsavedChanges: () => hasUnsavedChangesMock(),
    useUnsavedChangesGuard: vi.fn(),
}))

import ProjectSelector from './ProjectSelector'

describe('ProjectSelector search (FR-PROJ-390)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        hasUnsavedChangesMock.mockReturnValue(false)
    })

    const renderSelector = () =>
        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map() }}>
                    <ProjectSelector />
                </SWRConfig>
            </MemoryRouter>,
        )

    it('shows search when more than 5 projects and filters the list', () => {
        renderSelector()
        fireEvent.click(screen.getByText('Project 1'))

        const search = screen.getByLabelText('Поиск проекта')
        expect(search).toBeInTheDocument()

        // keyDown must not be stolen by dropdown typeahead (see ProjectSelector).
        fireEvent.keyDown(search, { key: 'P', code: 'KeyP' })
        fireEvent.change(search, { target: { value: 'Project 6' } })
        expect(screen.getByText('Project 6')).toBeInTheDocument()
        // Current project title stays in the header; only the dropdown list is filtered.
        expect(screen.getAllByText('Project 1')).toHaveLength(1)
        expect(screen.queryByText('Project 2')).not.toBeInTheDocument()
    })
})

describe('ProjectSelector dirty guard (FR-PROJ-380)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        hasUnsavedChangesMock.mockReturnValue(false)
    })

    const renderSelector = () =>
        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map() }}>
                    <ProjectSelector />
                </SWRConfig>
            </MemoryRouter>,
        )

    it('prompts before switching project when there are unsaved changes', () => {
        hasUnsavedChangesMock.mockReturnValue(true)
        renderSelector()
        fireEvent.click(screen.getByText('Project 1'))
        fireEvent.click(screen.getByText('Project 2'))

        expect(screen.getByText('Несохранённые изменения')).toBeInTheDocument()
        expect(
            screen.getByText('Есть несохранённые изменения. Сменить проект без сохранения?'),
        ).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Остаться' }))
    })

    it('switches project after confirming discard of unsaved changes', async () => {
        hasUnsavedChangesMock.mockReturnValue(true)
        renderSelector()
        fireEvent.click(screen.getByText('Project 1'))
        fireEvent.click(screen.getByText('Project 2'))
        fireEvent.click(screen.getByRole('button', { name: 'Сменить проект' }))
        await waitFor(() => {
            expect(screen.queryByText('Несохранённые изменения')).not.toBeInTheDocument()
        })
    })
})
