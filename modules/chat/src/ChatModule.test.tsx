import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { SWRConfig } from 'swr'

const apiListProjectMembers = vi.hoisted(() =>
    vi.fn().mockResolvedValue([{ id: 'u2', name: 'Пётр' }]),
)

vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string; userName: string; name: string } }) => unknown) =>
        sel({ user: { userId: 'u1', userName: 'Я', name: 'Я' } }),
}))
vi.mock('@/utils/hooks/useResolvedProjectId', () => ({ default: () => 'p1' }))
vi.mock('./chatService', () => ({
    apiListProjectMembers: (...a: unknown[]) => apiListProjectMembers(...a),
}))
vi.mock('./ChatLayout', () => ({
    default: ({
        activeConversationId,
        resolveName,
    }: {
        activeConversationId?: string
        resolveName?: (id: string) => string
    }) => (
        <div>
            LAYOUT active={activeConversationId ?? 'none'} peer={resolveName?.('u2')}
        </div>
    ),
}))

import ChatModule from './ChatModule'

describe('ChatModule', () => {
    it('/chat/:id передаёт conversationId и запрашивает участников проекта', async () => {
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter initialEntries={['/chat/conv-42?seq=7']}>
                    <Routes>
                        <Route path="/chat/*" element={<ChatModule />} />
                    </Routes>
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(screen.getByText(/active=conv-42/)).toBeInTheDocument()
        await waitFor(() => expect(apiListProjectMembers).toHaveBeenCalledWith('p1'))
        // resolveName доступен сразу (fallback к id до загрузки members)
        expect(screen.getByText(/peer=u2/)).toBeInTheDocument()
    })

    it('/p/:pid/chat/:id — project-scoped маршрут', () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <MemoryRouter initialEntries={['/p/p9/chat/conv-99']}>
                    <Routes>
                        <Route path="/p/:pid/chat/*" element={<ChatModule />} />
                    </Routes>
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(screen.getByText(/active=conv-99/)).toBeInTheDocument()
    })
})
