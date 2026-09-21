import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { Company } from '@/@types/crm'

const apiGetCompaniesTrash = vi.fn()
const apiRestoreCompany = vi.fn()
const apiPurgeCompany = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['companies:read', 'companies:write', 'companies:delete'])

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
    apiGetCompaniesTrash: (...a: unknown[]) => apiGetCompaniesTrash(...a),
    apiRestoreCompany: (...a: unknown[]) => apiRestoreCompany(...a),
    apiPurgeCompany: (...a: unknown[]) => apiPurgeCompany(...a),
}))

const { default: CompanyTrash } = await import('./CompanyTrash')

const trashed = (n: number): Company[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        name: `ООО Удалённая ${i}`,
        inn: `770000000${i}`,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: 1_700_000_000 + i,
    }))

const renderTrash = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies/trash']}>
                <CompanyTrash />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyTrash', () => {
    afterEach(async () => {
        cleanup()
        await new Promise((r) => setTimeout(r, 160))
    })

    beforeEach(() => {
        permissions = new Set(['companies:read', 'companies:write', 'companies:delete'])
        navigate.mockReset()
        toastPush.mockReset()
        apiGetCompaniesTrash.mockReset().mockResolvedValue({ list: trashed(2), total: 2 })
        apiRestoreCompany.mockReset().mockResolvedValue({})
        apiPurgeCompany.mockReset().mockResolvedValue({ ok: true })
    })

    it('показывает заглушку без права на чтение', () => {
        permissions = new Set()
        renderTrash()
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(apiGetCompaniesTrash).not.toHaveBeenCalled()
    })

    it('загружает корзину и показывает записи', async () => {
        renderTrash()
        expect(await screen.findByText('ООО Удалённая 0')).toBeInTheDocument()
        expect(apiGetCompaniesTrash).toHaveBeenCalledWith({
            projectId: 'proj-1',
            query: '',
            pageIndex: 0,
            pageSize: 10,
        })
    })

    it('пустая корзина — честное empty-state', async () => {
        apiGetCompaniesTrash.mockResolvedValue({ list: [], total: 0 })
        renderTrash()
        expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    })

    it('ошибка загрузки — retry', async () => {
        apiGetCompaniesTrash.mockRejectedValueOnce(new Error('fail')).mockResolvedValue({ list: trashed(1), total: 1 })
        renderTrash()
        expect(await screen.findByText('Не удалось загрузить корзину')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(await screen.findByText('ООО Удалённая 0')).toBeInTheDocument()
    })

    it('восстанавливает компанию из корзины', async () => {
        const user = userEvent.setup()
        renderTrash()
        await screen.findByText('ООО Удалённая 0')
        await user.click(screen.getAllByRole('button', { name: 'Восстановить' })[0])
        await waitFor(() =>
            expect(apiRestoreCompany).toHaveBeenCalledWith('t0', undefined, { projectId: 'proj-1' }),
        )
        expect(toastPush).toHaveBeenCalledWith(expect.stringContaining('восстановлена'))
    })

    it('показывает диалог коллизии ключа при восстановлении', async () => {
        apiRestoreCompany.mockRejectedValueOnce({
            response: {
                data: {
                    error: {
                        code: 'FAILED_PRECONDITION',
                        message: 'Ключ занят',
                        details: { options: ['merge', 'clear_key'] },
                    },
                },
            },
        })
        const user = userEvent.setup()
        renderTrash()
        await screen.findByText('ООО Удалённая 0')
        await user.click(screen.getAllByRole('button', { name: 'Восстановить' })[0])
        expect(await screen.findByText('Есть активный дубль')).toBeInTheDocument()
    })

    it('purge — удаляет навсегда после подтверждения', async () => {
        const user = userEvent.setup()
        renderTrash()
        await screen.findByText('ООО Удалённая 0')
        await user.click(screen.getAllByRole('button', { name: 'Удалить навсегда' })[0])
        expect(await screen.findByText('Удалить навсегда?')).toBeInTheDocument()
        await user.click(screen.getAllByRole('button', { name: 'Удалить навсегда' }).pop()!)
        await waitFor(() => expect(apiPurgeCompany).toHaveBeenCalledWith('t0', { projectId: 'proj-1' }))
    })

    it('поиск сбрасывает страницу на первую', async () => {
        const user = userEvent.setup()
        renderTrash()
        await screen.findByText('ООО Удалённая 0')
        await user.type(screen.getByPlaceholderText('Поиск в корзине...'), 'ромаш')
        await waitFor(() =>
            expect(apiGetCompaniesTrash).toHaveBeenCalledWith(
                expect.objectContaining({ query: 'ромаш', pageIndex: 0 }),
            ),
        )
    })
})
