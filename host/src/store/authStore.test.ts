import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionUser } from './authStore'
import type { ProjectInfo } from '@/@types/auth'

const proj = (id: string): ProjectInfo => ({
    id,
    name: id,
    color: '#000',
    role: 'member',
})

const resetAuth = () =>
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

describe('authStore — setUser MERGE semantics (T-001 root cause)', () => {
    beforeEach(resetAuth)

    it('setUser merges the payload over the current user (does NOT replace)', () => {
        useSessionUser.getState().setUser({ email: 'a@b.c', projects: [proj('p1')] })
        useSessionUser.getState().setUser({ userName: 'Ann' })

        const user = useSessionUser.getState().user
        expect(user.userName).toBe('Ann')
        // Merge, not replace: email + projects survive the second call.
        expect(user.email).toBe('a@b.c')
        expect(user.projects).toHaveLength(1)
    })

    it('setUser({}) does NOT clear projects — why logout must pass empty scope', () => {
        useSessionUser
            .getState()
            .setUser({
                projects: [proj('p1')],
                system: { id: 'o1', name: 'Org', role: 'platform_owner' },
            })

        // This is exactly the trap the T-001 fix avoids: an empty merge leaves the
        // previous user's projects/system in place, so the context resolver
        // re-derived a stale currentProject after logout.
        useSessionUser.getState().setUser({})
        expect(useSessionUser.getState().user.projects).toHaveLength(1)
        expect(useSessionUser.getState().user.system).not.toBeNull()

        // The fix passes explicit empty scope to actually clear the session:
        // box single-tenant → one System (nulled), not an organizations[] array.
        useSessionUser.getState().setUser({ projects: [], system: null })
        expect(useSessionUser.getState().user.projects).toEqual([])
        expect(useSessionUser.getState().user.system).toBeNull()
    })

    it('setSessionSignedIn toggles the session flag only', () => {
        useSessionUser.getState().setSessionSignedIn(true)
        expect(useSessionUser.getState().session.signedIn).toBe(true)
        useSessionUser.getState().setSessionSignedIn(false)
        expect(useSessionUser.getState().session.signedIn).toBe(false)
    })
})
