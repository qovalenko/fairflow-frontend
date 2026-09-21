import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: ({
        isOpen,
        taskInitialData,
    }: {
        isOpen?: boolean
        taskInitialData?: {
            contactIds?: string[]
            companyId?: string
            dealId?: string
            orderId?: string
        }
    }) =>
        isOpen ? (
            <div>
                Drawer contactIds={taskInitialData?.contactIds?.join(',') ?? 'none'}
                company={taskInitialData?.companyId ?? 'none'}
                deal={taskInitialData?.dealId ?? 'none'}
                order={taskInitialData?.orderId ?? 'none'}
            </div>
        ) : null,
}))

import EntityListBulkActionMenu from './EntityListBulkActionMenu'

describe('EntityListBulkActionMenu', () => {
    it('не рендерится для неподдерживаемого entityType', () => {
        const { container } = render(
            <EntityListBulkActionMenu entityType="product" selectedIds={['p1']} />,
        )

        expect(container.firstChild).toBeNull()
    })

    it('не рендерится без выбранных записей', () => {
        const { container } = render(
            <EntityListBulkActionMenu entityType="contact" selectedIds={[]} />,
        )

        expect(container.firstChild).toBeNull()
    })

    it('кнопка «Задача (N)» открывает drawer с contactIds для контактов', async () => {
        const user = userEvent.setup()

        render(
            <EntityListBulkActionMenu entityType="contact" selectedIds={['c1', 'c2']} />,
        )

        await user.click(screen.getByRole('button', { name: 'Задача (2)' }))
        expect(await screen.findByText(/contactIds=c1,c2/)).toBeInTheDocument()
    })

    it('для сделки передаёт dealId первой выбранной записи', async () => {
        const user = userEvent.setup()

        render(<EntityListBulkActionMenu entityType="deal" selectedIds={['d9', 'd10']} />)

        await user.click(screen.getByRole('button', { name: 'Задача (2)' }))
        expect(await screen.findByText(/deal=d9/)).toBeInTheDocument()
    })

    it('для заказа передаёт orderId первой выбранной записи', async () => {
        const user = userEvent.setup()

        render(<EntityListBulkActionMenu entityType="order" selectedIds={['o1']} />)

        await user.click(screen.getByRole('button', { name: 'Задача (1)' }))
        expect(await screen.findByText(/order=o1/)).toBeInTheDocument()
    })

    it('для компании передаёт companyId первой выбранной записи', async () => {
        const user = userEvent.setup()

        render(<EntityListBulkActionMenu entityType="company" selectedIds={['co1', 'co2']} />)

        await user.click(screen.getByRole('button', { name: 'Задача (2)' }))
        expect(await screen.findByText(/company=co1/)).toBeInTheDocument()
    })
})
