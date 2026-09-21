import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

const mockProjects = [
    { id: 'p-1', name: 'Project 1', color: '#6366f1', role: 'member' as const, status: 'active' as const },
    { id: 'p-2', name: 'Project 2', color: '#6366f1', role: 'member' as const, status: 'active' as const },
]

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

import ProjectSelector from './ProjectSelector'
import { useProjectSwitchDirtyStore } from '@/store/projectSwitchDirtyStore'

describe('ProjectSelector dirty guard (FR-SHELL-190)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useProjectSwitchDirtyStore.getState().clearAll()
    })

    it('prompts before switching project when dirty state is registered', () => {
        useProjectSwitchDirtyStore.getState().registerDirty('form', true)
        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map() }}>
                    <ProjectSelector />
                </SWRConfig>
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByText('Project 1'))
        fireEvent.click(screen.getByText('Project 2'))
        expect(screen.getByText('Несохранённые изменения')).toBeInTheDocument()
        expect(
            screen.getByText('Есть несохранённые изменения. Сменить проект без сохранения?'),
        ).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Остаться' }))
    })
})
