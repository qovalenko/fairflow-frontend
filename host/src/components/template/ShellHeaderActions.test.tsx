import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import ShellHeaderActions from './ShellHeaderActions'

vi.mock('@/components/shared/Slot', () => ({
    default: ({
        id,
        className,
        pending,
    }: {
        id: string
        className?: string
        pending?: unknown
    }) => (
        <div
            data-testid="slot"
            data-slot-id={id}
            data-pending={pending === null ? 'null' : 'default'}
            className={className}
        />
    ),
}))

describe('ShellHeaderActions', () => {
    it('монтирует слот shell.header.action', () => {
        const { getByTestId } = render(<ShellHeaderActions />)
        const slot = getByTestId('slot')
        expect(slot.getAttribute('data-slot-id')).toBe('shell.header.action')
        expect(slot.getAttribute('data-pending')).toBe('null')
        expect(slot.className).toContain('flex')
    })
})
