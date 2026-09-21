import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import ManifestBootstrapGate from './ManifestBootstrapGate'

describe('ManifestBootstrapGate (TODO-511)', () => {
    beforeEach(() => {
        delete window.__MF_MANIFEST_FAILED__
        delete window.__MF_MANIFEST_READY__
    })

    it('shows degradation screen when manifest failed', async () => {
        window.__MF_MANIFEST_FAILED__ = true
        window.__MF_MANIFEST_READY__ = Promise.resolve({ remotes: {} })
        render(
            <MemoryRouter initialEntries={['/statistics']}>
                <ManifestBootstrapGate>
                    <div>app</div>
                </ManifestBootstrapGate>
            </MemoryRouter>,
        )
        expect(
            await screen.findByText(/Не удалось загрузить модули/),
        ).toBeInTheDocument()
    })

    it('passes auth shell routes through when manifest failed', async () => {
        window.__MF_MANIFEST_FAILED__ = true
        window.__MF_MANIFEST_READY__ = Promise.resolve({ remotes: {} })
        render(
            <MemoryRouter initialEntries={['/auth/signin']}>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <ManifestBootstrapGate>
                                <div>sign-in-app</div>
                            </ManifestBootstrapGate>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        )
        expect(await screen.findByText('sign-in-app')).toBeInTheDocument()
        expect(
            screen.queryByText(/Не удалось загрузить модули/),
        ).not.toBeInTheDocument()
    })
})
