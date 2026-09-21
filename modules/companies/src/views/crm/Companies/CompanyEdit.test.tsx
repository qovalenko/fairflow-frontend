import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { Company } from '@/@types/crm'

const apiGetCompany = vi.fn()
const apiUpdateCompany = vi.fn()
const apiGetMembers = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['companies:read', 'companies:write', 'companies:manage'])

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useParams: () => ({ id: 'c1' }),
        useNavigate: () => navigate,
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({
        options: [{ value: 'd1', label: 'Отдел продаж' }],
        unavailable: false,
    }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('@/services/CrmService', () => ({
    apiGetCompany: (...a: unknown[]) => apiGetCompany(...a),
    apiUpdateCompany: (...a: unknown[]) => apiUpdateCompany(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
}))

const { default: CompanyEdit } = await import('./CompanyEdit')

const company: Company = {
    id: 'c1',
    name: 'ООО Ромашка',
    inn: '7700000001',
    kpp: '770001001',
    industry: 'ИТ',
    status: 'client',
    legalAddress: 'Москва',
    phone: '+7 999 000-00-00',
    email: 'info@romashka.ru',
    website: 'romashka.ru',
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    departmentId: 'd1',
    tags: ['VIP'],
    notes: 'Важный клиент',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

const renderEdit = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies/c1/edit']}>
                <CompanyEdit />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyEdit', () => {
    afterEach(async () => {
        cleanup()
        await new Promise((r) => setTimeout(r, 160))
    })

    beforeEach(() => {
        permissions = new Set(['companies:read', 'companies:write', 'companies:manage'])
        navigate.mockReset()
        toastPush.mockReset()
        apiGetCompany.mockReset().mockResolvedValue(company)
        apiGetMembers.mockReset().mockResolvedValue([{ id: 'u1', name: 'Пётр Петров' }])
        apiUpdateCompany.mockReset().mockResolvedValue(company)
    })

    it('без companies:write показывает заглушку', async () => {
        permissions = new Set(['companies:read'])
        renderEdit()
        expect(await screen.findByText('Редактирование недоступно')).toBeInTheDocument()
    })

    it('ошибка загрузки — «Компания не найдена»', async () => {
        apiGetCompany.mockRejectedValue(new Error('404'))
        renderEdit()
        expect(await screen.findByText('Компания не найдена')).toBeInTheDocument()
    })

    it('подставляет поля компании и блокирует «Сохранить», пока форма чистая', async () => {
        renderEdit()
        expect(await screen.findByDisplayValue('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByDisplayValue('7700000001')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveClass('cursor-not-allowed')
    })

    it('валидирует обязательное название', async () => {
        renderEdit()
        const nameInput = await screen.findByDisplayValue('ООО Ромашка')
        fireEvent.change(nameInput, { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        expect(await screen.findByText('Название обязательно')).toBeInTheDocument()
        expect(apiUpdateCompany).not.toHaveBeenCalled()
    })

    it('сохраняет изменения с departmentId и projectId в query', async () => {
        const user = userEvent.setup()
        renderEdit()
        const notes = await screen.findByDisplayValue('Важный клиент')
        await user.clear(notes)
        await user.type(notes, 'Обновлено')
        const saveBtn = screen.getByRole('button', { name: 'Сохранить' })
        await waitFor(() => expect(saveBtn).not.toHaveClass('cursor-not-allowed'))
        await user.click(saveBtn)

        await waitFor(() => expect(apiUpdateCompany).toHaveBeenCalled())
        expect(apiUpdateCompany).toHaveBeenCalledWith(
            'c1',
            expect.objectContaining({
                name: 'ООО Ромашка',
                departmentId: 'd1',
                notes: 'Обновлено',
            }),
            { projectId: 'proj-1' },
        )
        expect(toastPush).toHaveBeenCalledWith('Сохранено')
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('dirty-guard при уходе без сохранения', async () => {
        const user = userEvent.setup()
        renderEdit()
        const nameInput = await screen.findByDisplayValue('ООО Ромашка')
        await user.type(nameInput, ' Plus')
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Сохранить' })).not.toHaveClass(
                'cursor-not-allowed',
            ),
        )
        await user.click(screen.getByTitle('Назад'))
        expect(await screen.findByText('Несохранённые изменения')).toBeInTheDocument()
    })
})
