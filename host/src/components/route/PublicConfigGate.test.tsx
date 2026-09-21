import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import { usePublicConfigStore } from '@/store/publicConfigStore'
import { useSessionUser } from '@/store/authStore'
import { DEFAULT_PUBLIC_CONFIG } from '@/@types/publicConfig'

const loadPublicConfig = vi.fn()

vi.mock('@/services/PublicConfigService', () => ({
    loadPublicConfig: () => loadPublicConfig(),
}))
vi.mock('@/configs/app.config', () => ({
    default: { accessTokenPersistStrategy: 'localStorage' },
}))

import PublicConfigGate from './PublicConfigGate'

function LocationProbe() {
    const loc = useLocation()
    return <div data-testid="path">{loc.pathname}</div>
}

describe('PublicConfigGate', () => {
    beforeEach(() => {
        loadPublicConfig.mockReset()
        usePublicConfigStore.setState({
            loaded: false,
            config: DEFAULT_PUBLIC_CONFIG,
        })
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
    })

    it('shows loader until public config is fetched', () => {
        loadPublicConfig.mockReturnValue(new Promise(() => undefined))
        render(
            <MemoryRouter>
                <PublicConfigGate>
                    <div>app tree</div>
                </PublicConfigGate>
            </MemoryRouter>,
        )
        expect(screen.queryByText('app tree')).not.toBeInTheDocument()
    })

    it('renders children after config loads without bootstrap need', async () => {
        loadPublicConfig.mockResolvedValue({ ...DEFAULT_PUBLIC_CONFIG, needsBootstrap: false })
        render(
            <MemoryRouter>
                <PublicConfigGate>
                    <div>app tree</div>
                </PublicConfigGate>
            </MemoryRouter>,
        )
        await waitFor(() => {
            expect(usePublicConfigStore.getState().loaded).toBe(true)
        })
        expect(await screen.findByText('app tree')).toBeInTheDocument()
    })

    it('redirects unsigned user to /bootstrap when needsBootstrap is true', async () => {
        loadPublicConfig.mockResolvedValue({ ...DEFAULT_PUBLIC_CONFIG, needsBootstrap: true })
        render(
            <MemoryRouter initialEntries={['/auth/signin']}>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <>
                                <PublicConfigGate>
                                    <div>app tree</div>
                                </PublicConfigGate>
                                <LocationProbe />
                            </>
                        }
                    />
                    <Route path="/bootstrap" element={<div>bootstrap screen</div>} />
                </Routes>
            </MemoryRouter>,
        )
        await waitFor(() => {
            expect(screen.getByText('bootstrap screen')).toBeInTheDocument()
        })
    })

    it('does not redirect signed-in user even when needsBootstrap is true', async () => {
        loadPublicConfig.mockResolvedValue({ ...DEFAULT_PUBLIC_CONFIG, needsBootstrap: true })
        useSessionUser.setState({
            session: { signedIn: true },
            user: {
                avatar: '',
                userName: 'Admin',
                email: 'admin@test.local',
                authority: [],
                system: null,
                projects: [],
            },
        })
        render(
            <MemoryRouter initialEntries={['/']}>
                <PublicConfigGate>
                    <div>app tree</div>
                </PublicConfigGate>
            </MemoryRouter>,
        )
        expect(await screen.findByText('app tree')).toBeInTheDocument()
    })
})
