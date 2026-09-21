import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

let workspace = {
    systemId: 'sys-1' as string | null,
    isSystemOwnerOrAdmin: false,
    projects: [] as { id: string; name: string }[],
}

vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => workspace,
}))

import ProjectEntryChoice from './ProjectEntryChoice'

describe('ProjectEntryChoice (box onboarding router)', () => {
    beforeEach(() => {
        workspace = { systemId: 'sys-1', isSystemOwnerOrAdmin: false, projects: [] }
    })

    const renderChoice = () =>
        render(
            <MemoryRouter initialEntries={['/onboarding']}>
                <Routes>
                    <Route
                        path="/onboarding"
                        element={<ProjectEntryChoice />}
                    />
                    <Route path="/" element={<div>home</div>} />
                    <Route path="/onboarding/organization" element={<div>org recovery</div>} />
                    <Route path="/onboarding/no-projects" element={<div>no projects</div>} />
                    <Route
                        path="/account/projects/new"
                        element={<div>create project</div>}
                    />
                </Routes>
            </MemoryRouter>,
        )

    it('redirects to home when user already has projects', async () => {
        workspace.projects = [{ id: 'p-1', name: 'Demo' }]
        renderChoice()
        await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument())
    })

    it('redirects to org recovery when system is not resolved', async () => {
        workspace.systemId = null
        renderChoice()
        await waitFor(() => expect(screen.getByText('org recovery')).toBeInTheDocument())
    })

    it('redirects admin without projects to project creation wizard', async () => {
        workspace.isSystemOwnerOrAdmin = true
        renderChoice()
        await waitFor(() => expect(screen.getByText('create project')).toBeInTheDocument())
    })

    it('redirects employee without projects to no-projects stub', async () => {
        renderChoice()
        await waitFor(() => expect(screen.getByText('no projects')).toBeInTheDocument())
    })
})
