import { describe, expect, it } from 'vitest'
import {
    openEntityDrawer,
    openUserProfile,
    registerUserProfileOpener,
    resetUserProfileBridge,
} from '@/components/shared/userProfileBridge'

describe('userProfileBridge (FR-PROFILE-320)', () => {
    it('openUserProfile delegates to the registered opener', () => {
        resetUserProfileBridge()
        const opened: string[] = []
        registerUserProfileOpener((id) => opened.push(id))
        openUserProfile('user-42')
        expect(opened).toEqual(['user-42'])
    })

    it('openEntityDrawer routes entityType=user to the profile opener', () => {
        resetUserProfileBridge()
        const opened: string[] = []
        registerUserProfileOpener((id) => opened.push(id))
        openEntityDrawer('user', 'u-7')
        expect(opened).toEqual(['u-7'])
    })
})
