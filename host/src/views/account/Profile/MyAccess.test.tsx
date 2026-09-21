import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import MyAccess from '@/views/account/Profile/MyAccess'
import * as AuthService from '@/services/AuthService'

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('MyAccess (FR-PROFILE-280)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('renders projects with visibility labels from GET /profile/my-access', async () => {
        vi.spyOn(AuthService, 'apiGetMyAccess').mockResolvedValue({
            systemRoles: ['platform_admin'],
            projects: [
                {
                    projectId: 'p1',
                    projectName: 'Демо',
                    role: 'member',
                    visibilityLevel: 'only_own',
                    visibilityLabel: 'Видишь сделки: только свои',
                    joinedAt: '2026-01-10T12:00:00.000Z',
                },
            ],
        })

        render(
            <MemoryRouter>
                <MyAccess />
            </MemoryRouter>,
        )

        await waitFor(() => {
            expect(screen.getByText('Мои доступы')).toBeTruthy()
            expect(screen.getByText('Администратор платформы')).toBeTruthy()
            expect(screen.getByText('Демо')).toBeTruthy()
            expect(screen.getByText('Видишь сделки: только свои')).toBeTruthy()
            const link = screen.getByRole('link', { name: 'Демо' })
            expect(link.getAttribute('href')).toBe('/account/projects/p1/settings')
        })
    })
})
