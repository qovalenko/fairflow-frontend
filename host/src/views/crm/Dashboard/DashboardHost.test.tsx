import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/views/onboarding/OnboardingChecklist', () => ({
    default: () => <div role="region" aria-label="Onboarding checklist stub" />,
}))
vi.mock('@/utils/loadRemoteModule', () => ({
    lazyRemote: () => () =>
        Promise.resolve({
            default: () => <div role="region" aria-label="Statistics remote stub" />,
        }),
}))

import DashboardHost from './DashboardHost'

describe('DashboardHost (SCR-DASHBOARD-HOST)', () => {
    it('renders onboarding checklist and statistics remote mount points', async () => {
        render(
            <MemoryRouter>
                <DashboardHost />
            </MemoryRouter>,
        )

        expect(screen.getByRole('region', { name: 'Onboarding checklist stub' })).toBeInTheDocument()
        expect(
            await screen.findByRole('region', { name: 'Statistics remote stub' }),
        ).toBeInTheDocument()
    })
})
