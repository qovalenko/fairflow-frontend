import { describe, expect, it, beforeEach } from 'vitest'
import {
    buildInviteAcceptanceMessage,
    clearInviteAcceptanceBanner,
    readInviteAcceptanceBanner,
    saveInviteAcceptanceBanner,
} from './inviteAcceptanceBanner'

describe('inviteAcceptanceBanner', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('persists and reads banner state in sessionStorage', () => {
        saveInviteAcceptanceBanner({
            organizationName: 'Acme',
            projectIds: ['p1', 'p2'],
        })
        expect(readInviteAcceptanceBanner()).toEqual({
            organizationName: 'Acme',
            projectIds: ['p1', 'p2'],
        })
        clearInviteAcceptanceBanner()
        expect(readInviteAcceptanceBanner()).toBeNull()
    })

    it('builds confirmation message with org and single project', () => {
        const names = new Map([['p1', 'Продажи']])
        expect(buildInviteAcceptanceMessage('Acme', ['p1'], names)).toBe(
            'Вы добавлены в организацию «Acme», проект «Продажи».',
        )
    })

    it('builds confirmation message with multiple projects', () => {
        const names = new Map([
            ['p1', 'Продажи'],
            ['p2', 'Склад'],
        ])
        expect(buildInviteAcceptanceMessage('Acme', ['p1', 'p2'], names)).toBe(
            'Вы добавлены в организацию «Acme», проекты: Продажи, Склад.',
        )
    })

    it('builds org-only message when project names are not resolved yet', () => {
        expect(buildInviteAcceptanceMessage('Acme', ['p1'], new Map())).toBe(
            'Вы добавлены в организацию «Acme».',
        )
    })
})
