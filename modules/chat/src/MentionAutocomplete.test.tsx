import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MentionAutocomplete from './MentionAutocomplete'
import type { MemberVM } from './chatTypes'

const members: MemberVM[] = [
    { userId: 'u1', role: 'owner' },
    { userId: 'u2', role: 'member' },
    { userId: 'u3', role: 'member', leftAt: Date.now() },
]

describe('MentionAutocomplete', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('фильтрует по query и исключает leftAt', () => {
        render(
            <MentionAutocomplete
                query="П"
                members={members}
                resolveName={(id) => (id === 'u2' ? 'Пётр' : id)}
                onPick={vi.fn()}
            />,
        )
        expect(screen.getByText(/@Пётр/)).toBeInTheDocument()
        expect(screen.queryByText(/@u1/)).not.toBeInTheDocument()
        expect(screen.queryByText(/@u3/)).not.toBeInTheDocument()
    })

    it('onPick при клике по кандидату', () => {
        const onPick = vi.fn()
        render(
            <MentionAutocomplete
                query=""
                members={members}
                resolveName={(id) => id}
                onPick={onPick}
            />,
        )
        fireEvent.click(screen.getByText(/@u1/))
        expect(onPick).toHaveBeenCalledWith({ userId: 'u1', name: 'u1' })
    })

    it('пустой результат → null (ничего не рисует)', () => {
        const { container } = render(
            <MentionAutocomplete query="zzz" members={members} onPick={vi.fn()} />,
        )
        expect(container.firstChild).toBeNull()
    })
})
