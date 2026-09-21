import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: ({ isOpen, taskInitialData }: { isOpen?: boolean; taskInitialData?: Record<string, string> }) =>
        isOpen ? (
            <div>
                Drawer contact={taskInitialData?.contactId ?? 'none'}
                company={taskInitialData?.companyId ?? 'none'}
                deal={taskInitialData?.dealId ?? 'none'}
                order={taskInitialData?.orderId ?? 'none'}
            </div>
        ) : null,
}))
vi.mock('@/components/ui/Dropdown', () => ({
    default: {
        Item: ({
            children,
            onClick,
        }: {
            children?: React.ReactNode
            onClick?: () => void
        }) => (
            <button type="button" onClick={onClick}>
                {children}
            </button>
        ),
    },
}))

import EntityListActionMenu from './EntityListActionMenu'

describe('EntityListActionMenu', () => {
    it('не рендерится для неподдерживаемого entityType', () => {
        const { container } = render(
            <EntityListActionMenu entityType="product" recordId="p1" />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('открывает drawer задачи с contactId', () => {
        render(<EntityListActionMenu entityType="contact" recordId="c1" />)

        fireEvent.click(screen.getByRole('button', { name: /Задача/ }))
        expect(screen.getByText(/contact=c1/)).toBeInTheDocument()
    })

    it('открывает drawer задачи с companyId', () => {
        render(<EntityListActionMenu entityType="company" recordId="co1" />)

        fireEvent.click(screen.getByRole('button', { name: /Задача/ }))
        expect(screen.getByText(/company=co1/)).toBeInTheDocument()
    })

    it('открывает drawer задачи с dealId', () => {
        render(<EntityListActionMenu entityType="deal" recordId="d1" />)

        fireEvent.click(screen.getByRole('button', { name: /Задача/ }))
        expect(screen.getByText(/deal=d1/)).toBeInTheDocument()
    })

    it('открывает drawer задачи с orderId', () => {
        render(<EntityListActionMenu entityType="order" recordId="o1" />)

        fireEvent.click(screen.getByRole('button', { name: /Задача/ }))
        expect(screen.getByText(/order=o1/)).toBeInTheDocument()
    })
})
