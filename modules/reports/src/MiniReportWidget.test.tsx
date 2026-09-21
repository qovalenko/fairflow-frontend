import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import MiniReportWidget from './MiniReportWidget'
import { apiListReports, apiRunReport } from '@/services/ReportsService'

const navigateMock = vi.hoisted(() => vi.fn())
const canRead = vi.hoisted(() => ({ value: true }))

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('@/services/ReportsService', () => ({
    apiListReports: vi.fn(),
    apiRunReport: vi.fn(),
    formatRub: (v: number) => `${v.toLocaleString('ru-RU')} ₽`,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        canRead.value && subject === 'reports' && action === 'read',
}))

const listMock = vi.mocked(apiListReports)
const runMock = vi.mocked(apiRunReport)

const salesReport = {
    id: 'rep-sales',
    projectId: 'p1',
    name: 'По продажам',
    kind: 'builtin',
    presetKey: 'sales',
    createdAt: 1,
    updatedAt: 1,
}

const renderWidget = (props: { dealId?: string; companyId?: string }) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter>
                <MiniReportWidget {...props} />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('MiniReportWidget (FR-REPORTS-380)', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        canRead.value = true
        listMock.mockResolvedValue({ list: [salesReport], total: 1 } as never)
        runMock.mockResolvedValue({
            entityMini: {
                entityType: 'deal',
                entityId: 'd1',
                found: true,
                name: 'Сделка X',
                amount: 250_000,
                activitiesOverdue: 2,
                dealsCount: 3,
                dealsAmount: 900_000,
            },
        } as never)
    })

    it('не рендерится без reports:read', () => {
        canRead.value = false
        const { container } = renderWidget({ dealId: 'd1' })
        expect(container).toBeEmptyDOMElement()
    })

    it('не рендерится без dealId/companyId', async () => {
        const { container } = renderWidget({})
        await waitFor(() => expect(listMock).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('пресет sales не засеян → честное сообщение', async () => {
        listMock.mockResolvedValue({ list: [], total: 0 } as never)
        renderWidget({ dealId: 'd1' })
        expect(
            await screen.findByText('Мини-отчёт недоступен: пресет sales не засеян.'),
        ).toBeInTheDocument()
    })

    it('ошибка run → «Повторить»', async () => {
        runMock.mockRejectedValue(new Error('boom'))
        renderWidget({ dealId: 'd1' })
        expect(await screen.findByText('Не удалось загрузить мини-отчёт.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('loading — pulse-placeholder', async () => {
        runMock.mockReturnValue(new Promise(() => {}))
        const { container } = renderWidget({ companyId: 'c1' })
        await waitFor(() => {
            expect(container.querySelector('.animate-pulse')).toBeTruthy()
        })
    })

    it('entity вне видимости', async () => {
        runMock.mockResolvedValue({
            entityMini: { entityType: 'deal', entityId: 'd1', found: false },
        } as never)
        renderWidget({ dealId: 'd1' })
        expect(
            await screen.findByText('Запись недоступна в вашей видимости.'),
        ).toBeInTheDocument()
    })

    it('данные: теги и переход «Все отчёты»', async () => {
        const user = userEvent.setup()
        renderWidget({ dealId: 'd1' })
        expect(await screen.findByText('Мини-отчёт')).toBeInTheDocument()
        expect(screen.getByText('Сделка X')).toBeInTheDocument()
        expect(screen.getByText(/250/)).toBeInTheDocument()
        expect(screen.getByText(/Просрочено: 2/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Все отчёты' }))
        expect(navigateMock).toHaveBeenCalledWith('/reports')
    })
})
