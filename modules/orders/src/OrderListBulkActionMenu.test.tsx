import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import OrderListBulkActionMenu from './OrderListBulkActionMenu'

const navigateMock = vi.fn()

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})

describe('OrderListBulkActionMenu — bulk «Открыть продажу»', () => {
    beforeEach(() => {
        navigateMock.mockReset()
    })

    it('не рендерится для чужого entityType', () => {
        const { container } = render(
            <MemoryRouter>
                <OrderListBulkActionMenu entityType="contact" selectedIds={['o1']} />
            </MemoryRouter>,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('не рендерится при выборе нескольких записей', () => {
        const { container } = render(
            <MemoryRouter>
                <OrderListBulkActionMenu entityType="order" selectedIds={['o1', 'o2']} />
            </MemoryRouter>,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('открывает карточку единственной выбранной продажи', async () => {
        const user = userEvent.setup()
        render(
            <MemoryRouter>
                <OrderListBulkActionMenu entityType="order" selectedIds={['o-42']} />
            </MemoryRouter>,
        )

        await user.click(screen.getByRole('button', { name: 'Открыть продажу' }))
        expect(navigateMock).toHaveBeenCalledWith('/orders/o-42')
    })
})
