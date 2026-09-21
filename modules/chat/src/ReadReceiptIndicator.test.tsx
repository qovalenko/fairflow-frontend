import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReadReceiptIndicator from './ReadReceiptIndicator'

describe('ReadReceiptIndicator', () => {
    it('DM: прочитано / отправлено', () => {
        const { rerender } = render(<ReadReceiptIndicator variant="dm" read={false} />)
        expect(screen.getByText('✓ отправлено')).toBeInTheDocument()
        rerender(<ReadReceiptIndicator variant="dm" read />)
        expect(screen.getByText('✓✓ прочитано')).toBeInTheDocument()
    })

    it('group: счётчик прочитавших', () => {
        render(
            <ReadReceiptIndicator variant="group" read readCount={2} totalMembers={5} />,
        )
        expect(screen.getByText('прочитали 2 из 5')).toBeInTheDocument()
    })

    it('group aggregateOnly: только агрегат', () => {
        render(
            <ReadReceiptIndicator variant="group" read aggregateOnly readCount={12} totalMembers={50} />,
        )
        expect(screen.getByText('прочитали 12')).toBeInTheDocument()
        expect(screen.queryByText(/из/)).not.toBeInTheDocument()
    })
})
