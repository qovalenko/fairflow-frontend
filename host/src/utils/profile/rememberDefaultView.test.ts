import { describe, expect, it, vi, beforeEach } from 'vitest'
import { dealsIndexRedirect, rememberProfileDefaultView } from './rememberDefaultView'
import { useSessionUser } from '@/store/authStore'

vi.mock('@/services/AuthService', () => ({
    apiUpdateMyProfile: vi.fn(),
}))

import { apiUpdateMyProfile } from '@/services/AuthService'

describe('rememberProfileDefaultView (FR-PROFILE-050)', () => {
    beforeEach(() => {
        vi.mocked(apiUpdateMyProfile).mockReset()
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'U',
                email: 'u@example.com',
                authority: [],
                system: null,
                projects: [],
                defaultDealsView: 'kanban',
                defaultActivitiesView: 'list',
            },
        })
    })

    it('skips PATCH when value unchanged', async () => {
        await rememberProfileDefaultView('defaultDealsView', 'kanban', 'kanban')
        expect(apiUpdateMyProfile).not.toHaveBeenCalled()
    })

    it('PATCHes profile and updates session store on view change', async () => {
        vi.mocked(apiUpdateMyProfile).mockResolvedValue({
            user: { defaultDealsView: 'list' },
        } as never)

        await rememberProfileDefaultView('defaultDealsView', 'list', 'kanban')

        expect(apiUpdateMyProfile).toHaveBeenCalledWith({ defaultDealsView: 'list' })
        expect(useSessionUser.getState().user.defaultDealsView).toBe('list')
    })

    it('updates the session store before PATCH resolves (no bounce on index redirect)', async () => {
        let resolvePatch: (value: unknown) => void = () => undefined
        vi.mocked(apiUpdateMyProfile).mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolvePatch = resolve
                }) as never,
        )

        const pending = rememberProfileDefaultView('defaultDealsView', 'list', 'kanban')
        expect(useSessionUser.getState().user.defaultDealsView).toBe('list')
        resolvePatch({ user: { defaultDealsView: 'list' } })
        await pending
    })

    it('redirects deals index to kanban only when that is the remembered default', () => {
        expect(dealsIndexRedirect('/deals', 'kanban')).toBe('/deals/kanban')
        expect(dealsIndexRedirect('/p/p1/deals', 'kanban')).toBe('/p/p1/deals/kanban')
        expect(dealsIndexRedirect('/deals', 'list')).toBeNull()
        expect(dealsIndexRedirect('/deals/kanban', 'kanban')).toBeNull()
        expect(dealsIndexRedirect('/deals/abc', 'kanban')).toBeNull()
    })
})
