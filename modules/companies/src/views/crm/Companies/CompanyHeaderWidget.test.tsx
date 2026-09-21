import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyHeaderWidget from './CompanyHeaderWidget'
import type { Company } from '@/@types/crm'

vi.mock('@/store/globalEntityDrawerStore', () => ({
    useGlobalEntityDrawer: { getState: () => ({ open: vi.fn() }) },
}))
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: string; children: React.ReactNode }) => (
        <span title={title}>{children}</span>
    ),
}))

const company = (over: Partial<Company> = {}): Company => ({
    id: 'c1',
    name: 'ООО Ромашка',
    inn: '7700000001',
    phone: '+7 999 000-00-00',
    email: 'info@romashka.ru',
    industry: 'ИТ',
    tags: ['VIP'],
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    ogrn: '1027700000000',
    kpp: '770001001',
    legalAddress: 'Москва, ул. Цветная, 1',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...over,
})

describe('CompanyHeaderWidget', () => {
    it('рендерит имя, контакты, теги и ответственного', () => {
        render(<CompanyHeaderWidget company={company()} isPinned />)
        expect(screen.getByText('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByText(/7700000001/)).toBeInTheDocument()
        expect(screen.getByText('+7 999 000-00-00')).toBeInTheDocument()
        expect(screen.getByText('VIP')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
        expect(screen.getByText('ЗАКРЕПЛЁН')).toBeInTheDocument()
    })

    it('кнопки действий вызывают колбэки', async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        render(<CompanyHeaderWidget company={company()} onEdit={onEdit} onDelete={onDelete} />)
        await user.click(screen.getByLabelText('Редактировать'))
        await user.click(screen.getByLabelText('Удалить'))
        expect(onEdit).toHaveBeenCalled()
        expect(onDelete).toHaveBeenCalled()
    })

    it('попover реквизитов открывается по кнопке', async () => {
        const user = userEvent.setup()
        render(<CompanyHeaderWidget company={company()} />)
        await user.click(screen.getByLabelText('Реквизиты'))
        expect(await screen.findByText('Реквизиты')).toBeInTheDocument()
        expect(screen.getByText('1027700000000')).toBeInTheDocument()
    })

    it('не рисует кнопку реквизитов без данных', () => {
        render(
            <CompanyHeaderWidget
                company={company({ ogrn: undefined, kpp: undefined, legalAddress: undefined })}
            />,
        )
        expect(screen.queryByLabelText('Реквизиты')).not.toBeInTheDocument()
    })
})
