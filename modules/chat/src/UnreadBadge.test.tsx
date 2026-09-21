import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UnreadBadge from './UnreadBadge'

describe('UnreadBadge', () => {
    it('не рендерится при count=0', () => {
        const { container } = render(<UnreadBadge count={0} />)
        expect(container.firstChild).toBeNull()
    })

    it('показывает число непрочитанных', () => {
        render(<UnreadBadge count={5} />)
        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('сжимает 99+ для больших значений', () => {
        render(<UnreadBadge count={120} />)
        expect(screen.getByText('99+')).toBeInTheDocument()
    })
})
