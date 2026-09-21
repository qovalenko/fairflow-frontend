import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiGetCompany = vi.fn()
const apiPreviewCompanyMerge = vi.fn()
const apiMergeCompanies = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['companies:read', 'companies:manage'])

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('@/services/CrmService', () => ({
    apiGetCompany: (...a: unknown[]) => apiGetCompany(...a),
    apiPreviewCompanyMerge: (...a: unknown[]) => apiPreviewCompanyMerge(...a),
    apiMergeCompanies: (...a: unknown[]) => apiMergeCompanies(...a),
}))

const { default: CompanyMerge } = await import('./CompanyMerge')

const master = { id: 'c1', name: 'ООО Master', inn: '7700000001', createdAt: 0, updatedAt: 0 }
const loser = { id: 'c2', name: 'ООО Loser', inn: '7700000002', createdAt: 0, updatedAt: 0 }

const renderMerge = (search = '?master=c1&loser=c2') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[`/companies/merge${search}`]}>
                <Routes>
                    <Route path="/companies/merge" element={<CompanyMerge />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyMerge — экран слияния', () => {
    afterEach(async () => {
        cleanup()
        await new Promise((r) => setTimeout(r, 160))
    })

    beforeEach(() => {
        permissions = new Set(['companies:read', 'companies:manage'])
        navigate.mockReset()
        toastPush.mockReset()
        apiGetCompany.mockImplementation((_id: string) =>
            _id === 'c1' ? Promise.resolve(master) : Promise.resolve(loser),
        )
        apiPreviewCompanyMerge.mockResolvedValue({
            fieldConflicts: [{ field: 'phone', master: '+7 111', loser: '+7 222' }],
            relations: { contacts: 3, deals: 2, orders: 1, activities: 0, documents: 0 },
        })
        apiMergeCompanies.mockResolvedValue({ masterId: 'c1' })
    })

    it('без master/loser просит выбрать компании в списке', () => {
        renderMerge('')
        expect(screen.getByText('Не выбраны компании')).toBeInTheDocument()
    })

    it('запрещает слияние компании с самой собой', () => {
        renderMerge('?master=c1&loser=c1')
        expect(screen.getByText('Нельзя объединить компанию саму с собой')).toBeInTheDocument()
    })

    it('показывает preview связей и конфликты полей', async () => {
        renderMerge()
        expect(await screen.findByText('ООО Master')).toBeInTheDocument()
        expect(screen.getByText('ООО Loser')).toBeInTheDocument()
        expect(screen.getByText('Контакты')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('Телефон')).toBeInTheDocument()
    })

    it('подтверждение вызывает apiMergeCompanies и уводит на master', async () => {
        const user = userEvent.setup()
        renderMerge()
        await screen.findByText('ООО Master')
        await user.click(screen.getByRole('button', { name: 'Объединить' }))
        expect(await screen.findByText('Подтвердите объединение')).toBeInTheDocument()
        await user.click(screen.getAllByRole('button', { name: 'Объединить' }).pop() as HTMLElement)

        await waitFor(() =>
            expect(apiMergeCompanies).toHaveBeenCalledWith(
                expect.objectContaining({ masterId: 'c1', loserId: 'c2' }),
                { projectId: 'proj-1' },
            ),
        )
        expect(toastPush).toHaveBeenCalledWith('Компании объединены')
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('ошибка preview не блокирует экран, но показывает предупреждение', async () => {
        apiPreviewCompanyMerge.mockRejectedValue(new Error('preview fail'))
        renderMerge()
        expect(await screen.findByText(/Не удалось построить превью слияния/)).toBeInTheDocument()
    })
})
