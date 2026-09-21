import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as AuthService from '@/services/AuthService'

vi.mock('@/views/account/AccountLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/utils/notify', () => ({
    notify: vi.fn(),
}))

import Sessions from './Sessions'

describe('Sessions (SCR-MPROF-SESSIONS)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('shows loading skeleton then session list', async () => {
        let resolveSessions!: (
            value: Awaited<ReturnType<typeof AuthService.apiGetMySessions>>,
        ) => void
        vi.spyOn(AuthService, 'apiGetMySessions').mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveSessions = resolve
                }),
        )

        render(
            <MemoryRouter>
                <Sessions />
            </MemoryRouter>,
        )

        expect(screen.getByText('Активные сессии')).toBeInTheDocument()
        expect(screen.queryByText('Chrome · Windows')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()

        resolveSessions({
            sessions: [
                {
                    id: 's-current',
                    deviceLabel:
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    ip: '10.0.0.1',
                    isCurrent: true,
                    lastSeenAt: new Date().toISOString(),
                },
                {
                    id: 's-other',
                    deviceLabel:
                        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
                    ip: '10.0.0.2',
                    isCurrent: false,
                    lastSeenAt: new Date().toISOString(),
                },
            ],
        })

        expect(await screen.findByText('Chrome · Windows')).toBeInTheDocument()
        expect(screen.getByText('Safari · iOS')).toBeInTheDocument()
        expect(screen.getByText('Текущая')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Завершить' })).toBeInTheDocument()
    })

    it('shows retry when session load fails', async () => {
        vi.spyOn(AuthService, 'apiGetMySessions').mockRejectedValue(new Error('network'))
        render(
            <MemoryRouter>
                <Sessions />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось загрузить сессии.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('shows empty state when no sessions returned', async () => {
        vi.spyOn(AuthService, 'apiGetMySessions').mockResolvedValue({ sessions: [] })
        render(
            <MemoryRouter>
                <Sessions />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Активных сессий не найдено.')).toBeInTheDocument()
    })

    it('revokes non-current session on button click', async () => {
        vi.spyOn(AuthService, 'apiGetMySessions').mockResolvedValue({
            sessions: [
                {
                    id: 's-current',
                    deviceLabel:
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
                    isCurrent: true,
                },
                {
                    id: 's-other',
                    deviceLabel: 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Firefox/120.0',
                    isCurrent: false,
                },
            ],
        })
        vi.spyOn(AuthService, 'apiRevokeSession').mockResolvedValue({ id: 's-other' })

        render(
            <MemoryRouter>
                <Sessions />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByRole('button', { name: 'Завершить' }))

        await waitFor(() =>
            expect(AuthService.apiRevokeSession).toHaveBeenCalledWith('s-other'),
        )
        expect(screen.queryByText('Firefox · Linux')).not.toBeInTheDocument()
    })
})
