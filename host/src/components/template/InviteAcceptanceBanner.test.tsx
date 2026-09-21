import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import {
    saveInviteAcceptanceBanner,
    readInviteAcceptanceBanner,
} from '@/utils/inviteAcceptanceBanner'

vi.mock('@/utils/hooks/useLiveProjects', () => ({
    useLiveProjects: () => ({
        projects: [
            { id: 'p-1', name: 'Demo Project', color: '#6366f1', role: 'member', status: 'active' },
        ],
    }),
}))

import InviteAcceptanceBanner from './InviteAcceptanceBanner'

describe('InviteAcceptanceBanner (FR-ONB-19)', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('renders nothing when banner state is absent', () => {
        const { container } = render(
            <MemoryRouter>
                <InviteAcceptanceBanner />
            </MemoryRouter>,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('shows acceptance message built from sessionStorage and live projects', () => {
        saveInviteAcceptanceBanner({
            organizationName: 'Acme Corp',
            projectIds: ['p-1'],
        })
        render(
            <MemoryRouter>
                <InviteAcceptanceBanner />
            </MemoryRouter>,
        )
        expect(
            screen.getByText(
                'Вы добавлены в организацию «Acme Corp», проект «Demo Project».',
            ),
        ).toBeInTheDocument()
    })

    it('dismisses banner and clears sessionStorage', async () => {
        saveInviteAcceptanceBanner({
            organizationName: 'Acme Corp',
            projectIds: [],
        })
        render(
            <MemoryRouter>
                <InviteAcceptanceBanner />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(readInviteAcceptanceBanner()).toBeNull()
    })
})
