import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyRequisitesWidget from './CompanyRequisitesWidget'
import type { Company } from '@/@types/crm'

vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: string; children: React.ReactNode }) => (
        <span title={title}>{children}</span>
    ),
}))

const company = (over: Partial<Company> = {}): Company => ({
    id: 'c1',
    name: 'ООО Ромашка',
    ogrn: '1027700000000',
    kpp: '770001001',
    legalAddress: 'Москва',
    bankName: 'Сбербанк',
    bik: '044525225',
    correspondentAccount: '30101810400000000225',
    settlementAccount: '40702810123456789012',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...over,
})

describe('CompanyRequisitesWidget', () => {
    it('возвращает null без реквизитов', () => {
        const { container } = render(
            <CompanyRequisitesWidget company={{ id: 'c1', name: 'X', createdAt: 0, updatedAt: 0 }} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('рендерит юридические и банковские поля', () => {
        render(<CompanyRequisitesWidget company={company()} />)
        expect(screen.getByText('1027700000000')).toBeInTheDocument()
        expect(screen.getByText('770001001')).toBeInTheDocument()
        expect(screen.getByText('Москва')).toBeInTheDocument()
        expect(screen.getByText('Сбербанк')).toBeInTheDocument()
        expect(screen.getByText('044525225')).toBeInTheDocument()
    })

    it('копирование реквизитов', async () => {
        const user = userEvent.setup()
        const onCopy = vi.fn()
        render(<CompanyRequisitesWidget company={company()} onCopy={onCopy} />)
        await user.click(screen.getByLabelText('Копировать реквизиты'))
        expect(onCopy).toHaveBeenCalled()
    })
})
