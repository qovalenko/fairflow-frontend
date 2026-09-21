import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import OrderListActionMenu from './OrderListActionMenu'
import Dropdown from '@/components/ui/Dropdown'

vi.mock('@/components/ui/Dropdown', () => {
    const Item = ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    )
    const MockDropdown = ({ children }: { children: ReactNode }) => <div>{children}</div>
    MockDropdown.Item = Item
    return { default: MockDropdown }
})

const navigateMock = vi.fn()

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})

describe('OrderListActionMenu — строка «Редактировать»', () => {
    beforeEach(() => {
        navigateMock.mockReset()
    })

    it('не рендерится для чужого entityType', () => {
        render(
            <MemoryRouter>
                <Dropdown>
                    <OrderListActionMenu entityType="deal" recordId="o1" />
                </Dropdown>
            </MemoryRouter>,
        )
        expect(screen.queryByText('Редактировать')).not.toBeInTheDocument()
    })

    it('ведёт на форму редактирования продажи', async () => {
        const user = userEvent.setup()
        render(
            <MemoryRouter>
                <Dropdown>
                    <OrderListActionMenu entityType="order" recordId="o-7" />
                </Dropdown>
            </MemoryRouter>,
        )

        await user.click(screen.getByText('Редактировать'))
        expect(navigateMock).toHaveBeenCalledWith('/orders/o-7/edit')
    })
})
