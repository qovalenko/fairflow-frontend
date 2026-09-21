import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { ConversationVM } from './chatTypes'

const useConversations = vi.fn()

vi.mock('./useChat', () => ({
    useConversations: (...a: unknown[]) => useConversations(...a),
}))

import ConversationList from './ConversationList'

const conv = (over: Partial<ConversationVM> = {}): ConversationVM => ({
    id: 'c1',
    type: 'dm',
    title: '',
    scope: { kind: 'project', scopeId: 'p1' },
    lastMessageAt: Date.now(),
    unreadCount: 0,
    members: [{ userId: 'u2', role: 'member' }],
    ...over,
})

const render = (ui: ReactElement) => rtlRender(ui)

const baseProps = {
    scopeFilter: 'all' as const,
    projectId: 'p1',
    onSelect: vi.fn(),
    canRead: true,
    canWrite: true,
    onCreate: vi.fn(),
}

describe('ConversationList', () => {
    beforeEach(() => {
        useConversations.mockReturnValue({
            conversations: [
                conv({ id: 'dm1', type: 'dm', members: [{ userId: 'u2', role: 'member' }] }),
                conv({ id: 'ch1', type: 'project_channel', title: 'Общий канал' }),
            ],
            isLoading: false,
            error: undefined,
            moduleDisabled: false,
            refresh: vi.fn(),
        })
    })

    it('без canRead → экран «нет доступа»', () => {
        render(<ConversationList {...baseProps} canRead={false} />)
        expect(screen.getByText('Нет доступа')).toBeInTheDocument()
    })

    it('moduleDisabled → модуль выключен', () => {
        useConversations.mockReturnValue({
            conversations: [],
            isLoading: false,
            error: undefined,
            moduleDisabled: true,
            refresh: vi.fn(),
        })
        render(<ConversationList {...baseProps} />)
        expect(screen.getByText('Модуль выключен')).toBeInTheDocument()
    })

    it('loading → скелетон', () => {
        useConversations.mockReturnValue({
            conversations: [],
            isLoading: true,
            error: undefined,
            moduleDisabled: false,
            refresh: vi.fn(),
        })
        const { container } = render(<ConversationList {...baseProps} />)
        expect(container.querySelectorAll('[style*="linear-gradient"]').length).toBeGreaterThan(0)
    })

    it('error → retry вызывает refresh', () => {
        const refresh = vi.fn()
        useConversations.mockReturnValue({
            conversations: [],
            isLoading: false,
            error: new Error('fail'),
            moduleDisabled: false,
            refresh,
        })
        render(<ConversationList {...baseProps} />)
        fireEvent.click(screen.getByText('Повторить'))
        expect(refresh).toHaveBeenCalled()
    })

    it('empty → CTA «Новый диалог»', () => {
        useConversations.mockReturnValue({
            conversations: [],
            isLoading: false,
            error: undefined,
            moduleDisabled: false,
            refresh: vi.fn(),
        })
        const onCreate = vi.fn()
        render(<ConversationList {...baseProps} onCreate={onCreate} />)
        fireEvent.click(screen.getByText('Новый диалог'))
        expect(onCreate).toHaveBeenCalled()
    })

    it('фильтр «Каналы» показывает только project_channel', async () => {
        useConversations.mockReturnValue({
            conversations: [
                conv({
                    id: 'dm1',
                    type: 'dm',
                    title: 'DM с u2',
                    members: [{ userId: 'u2', role: 'member' }],
                }),
                conv({ id: 'ch1', type: 'project_channel', title: 'Общий канал' }),
            ],
            isLoading: false,
            error: undefined,
            moduleDisabled: false,
            refresh: vi.fn(),
        })
        render(<ConversationList {...baseProps} />)
        expect(screen.getByText('DM с u2')).toBeInTheDocument()
        fireEvent.click(screen.getByText('Каналы'))
        await waitFor(() => {
            expect(screen.getByText('Общий канал')).toBeInTheDocument()
            expect(screen.queryByText('DM с u2')).not.toBeInTheDocument()
        })
    })

    it('«+ Новый» открывает создание при canWrite', () => {
        const onCreate = vi.fn()
        render(<ConversationList {...baseProps} onCreate={onCreate} />)
        fireEvent.click(screen.getByText('+ Новый'))
        expect(onCreate).toHaveBeenCalled()
    })

    it('billingReadonly: без кнопок создания', () => {
        render(<ConversationList {...baseProps} billingReadonly onCreate={vi.fn()} onSelfNotes={vi.fn()} />)
        expect(screen.queryByText('+ Новый')).not.toBeInTheDocument()
        expect(screen.queryByText('Себе')).not.toBeInTheDocument()
    })
})
