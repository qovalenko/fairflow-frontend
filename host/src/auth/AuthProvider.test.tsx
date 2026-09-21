import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AuthProvider from './AuthProvider'
import useAuth from './useAuth'
import { useProjectStore } from '@/store/projectStore'
import { useSessionUser } from '@/store/authStore'
import type { Project } from '@/store/projectStore'

/**
 * T-001-FE regression: the selected project context (currentProject + its
 * localStorage keys + user.projects) must be reset on logout AND reconciled on
 * login/register. A stored project the current user is NOT a member of must not
 * be restored — otherwise project-scoped requests go out with a foreign
 * X-Project-Id → 403.
 *
 * Boundary mocks: the API clients are mocked so NO network is hit; we exercise
 * the real reset/reconcile logic in AuthProvider against the real stores.
 */
const mocks = vi.hoisted(() => ({
    apiSignIn: vi.fn(),
    apiSignOut: vi.fn(),
    apiGetMyProfile: vi.fn(),
    apiGetMyProjects: vi.fn(),
    apiGetSystem: vi.fn(),
}))

vi.mock('@/services/AuthService', () => ({
    apiSignIn: mocks.apiSignIn,
    apiSignOut: mocks.apiSignOut,
    apiGetMyProfile: mocks.apiGetMyProfile,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetMyProjects: mocks.apiGetMyProjects,
    apiGetSystem: mocks.apiGetSystem,
}))

const storedProject = (id: string): Project => ({
    id,
    name: `Project ${id}`,
    enabledModules: [],
})

let auth: ReturnType<typeof useAuth>
function Capture() {
    auth = useAuth()
    return null
}
function renderAuth() {
    render(
        <MemoryRouter>
            <AuthProvider>
                <Capture />
            </AuthProvider>
        </MemoryRouter>,
    )
}

function resetStores() {
    useProjectStore.setState({ currentProject: null, currentProjectId: null })
    useSessionUser.setState({
        session: { signedIn: false },
        user: {
            avatar: '',
            userName: '',
            email: '',
            authority: [],
            system: null,
            projects: [],
        },
    })
    localStorage.clear()
}

describe('AuthProvider — project context reset/reconcile (T-001)', () => {
    beforeEach(resetStores)

    it('signOut clears project context AND session scope', async () => {
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                email: 'old@x',
                userName: 'Old',
                authority: ['user'],
                system: { id: 'o1', name: 'Org', role: 'platform_owner' },
                systemRole: 'platform_owner',
                projects: [{ id: 'p1', name: 'P1', color: '#000', role: 'member' }],
            },
        })
        useProjectStore.getState().setCurrentProject(storedProject('p1'))
        mocks.apiSignOut.mockResolvedValue(undefined)

        renderAuth()
        await act(async () => {
            await auth.signOut()
        })

        expect(useProjectStore.getState().currentProject).toBeNull()
        expect(useProjectStore.getState().currentProjectId).toBeNull()
        expect(localStorage.getItem('fairflow_current_project_id')).toBeNull()
        // T-001: projects/system must be actually emptied (not just merged over).
        expect(useSessionUser.getState().user.projects).toEqual([])
        expect(useSessionUser.getState().user.system).toBeNull()
        expect(useSessionUser.getState().session.signedIn).toBe(false)
    })

    it('signIn drops a stored project the new user is NOT a member of', async () => {
        // Stale selection left over from a previous user/session.
        useProjectStore.getState().setCurrentProject(storedProject('stale'))
        mocks.apiSignIn.mockResolvedValue({
            token: 't',
            user: { userId: 'u2', id: 'u2', email: 'u2@x', login: 'u2' },
        })
        mocks.apiGetMyProjects.mockResolvedValue([
            { id: 'p2', name: 'P2', modules: ['contacts'] },
        ])
        mocks.apiGetSystem.mockResolvedValue({
            id: 'sys',
            name: 'Sys',
            role: 'employee',
        })

        renderAuth()
        await act(async () => {
            await auth.signIn({ email: 'u2@x', password: 'x' })
        })

        // 'stale' not in the new user's [p2] → context cleared.
        expect(useProjectStore.getState().currentProject).toBeNull()
        expect(
            useSessionUser.getState().user.projects?.map((p) => p.id),
        ).toEqual(['p2'])
        // box single-tenant: the resolved System (GET /v1/system) is stored on
        // the session as a single object + role (not an organizations[] array).
        expect(useSessionUser.getState().user.system).toEqual({
            id: 'sys',
            name: 'Sys',
            role: 'employee',
        })
        expect(useSessionUser.getState().user.systemRole).toBe('employee')
    })

    it('signIn KEEPS a stored project the user still belongs to', async () => {
        useProjectStore.getState().setCurrentProject(storedProject('p2'))
        mocks.apiSignIn.mockResolvedValue({
            token: 't',
            user: { userId: 'u2', id: 'u2', email: 'u2@x', login: 'u2' },
        })
        mocks.apiGetMyProjects.mockResolvedValue([
            { id: 'p2', name: 'P2', modules: ['contacts'] },
        ])
        mocks.apiGetSystem.mockResolvedValue({
            id: 'sys',
            name: 'Sys',
            role: 'employee',
        })

        renderAuth()
        await act(async () => {
            await auth.signIn({ email: 'u2@x', password: 'x' })
        })

        // Membership still valid → selection preserved (no over-clearing).
        expect(useProjectStore.getState().currentProjectId).toBe('p2')
    })
})
