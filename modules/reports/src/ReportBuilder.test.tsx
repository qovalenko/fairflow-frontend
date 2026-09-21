import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import ReportBuilder from './ReportBuilder'
import {
    apiCreateReport,
    apiGetReport,
    apiUpdateReport,
} from '@/services/ReportsService'

const navigateMock = vi.hoisted(() => vi.fn())
const canManage = vi.hoisted(() => ({ value: true }))
const confirmMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('@/services/ReportsService', () => ({
    apiCreateReport: vi.fn(),
    apiGetReport: vi.fn(),
    apiUpdateReport: vi.fn(),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        canManage.value && subject === 'reports' && action === 'manage',
}))
vi.mock('@/store/projectStore', () => ({
    useProjectStore: (selector: (s: unknown) => unknown) =>
        selector({ currentProject: { id: 'p1', enabledModules: ['deals', 'contacts'] } }),
    getEnabledModules: () => ['deals', 'contacts'],
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: vi.fn() },
}))

const createMock = vi.mocked(apiCreateReport)
const getMock = vi.mocked(apiGetReport)
const updateMock = vi.mocked(apiUpdateReport)

const renderBuilder = (route = '/reports/builder') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[route]}>
                <ReportBuilder />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ReportBuilder (SCR-REPORTS-BUILDER)', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        canManage.value = true
        confirmMock.mockReturnValue(true)
        window.confirm = confirmMock
        createMock.mockResolvedValue({ id: 'new-id' } as never)
        getMock.mockResolvedValue({
            id: 'edit-1',
            name: 'Мой отчёт',
            description: 'описание',
            visibility: 'personal',
            kind: 'custom',
            spec: {
                entity: 'deals',
                measures: [{ fn: 'count' }],
                groupBy: [{ field: 'month' }],
                dateRange: { kind: 'custom', from: Date.parse('2025-01-01'), to: Date.parse('2025-06-30') },
                viz: { type: 'bar' },
            },
            createdAt: 1,
            updatedAt: 1,
        } as never)
    })

    it('ST-10: без reports:manage — NoPermissionState', () => {
        canManage.value = false
        renderBuilder()
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(screen.getByText(/reports:manage/)).toBeInTheDocument()
    })

    it('?edit= — загрузка существующего отчёта', async () => {
        getMock.mockReturnValue(new Promise(() => {}))
        renderBuilder('/reports/builder?edit=edit-1')
        expect(screen.getByText('Загрузка отчёта…')).toBeInTheDocument()
    })

    it('форма: сущности только из включённых модулей', () => {
        renderBuilder()
        expect(screen.getByText('Конструктор отчётов')).toBeInTheDocument()
        expect(screen.getByText('Сделки')).toBeInTheDocument()
        expect(screen.getByText('Контакты')).toBeInTheDocument()
        expect(screen.queryByText('Продажи')).not.toBeInTheDocument()
    })

    it('диалог сохранения: пустое имя → inline-ошибка', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))
        expect(screen.getByText('Сохранить отчёт', { selector: 'h3' })).toBeInTheDocument()
        await user.click(screen.getAllByRole('button', { name: 'Сохранить' }).at(-1)!)
        expect(await screen.findByText('Введите название отчёта')).toBeInTheDocument()
        expect(createMock).not.toHaveBeenCalled()
    })

    it('успешное создание → toast и navigate на custom deep-link', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))
        await user.type(screen.getByPlaceholderText('Введите название'), 'Новый отчёт')
        await user.click(screen.getAllByRole('button', { name: 'Сохранить' }).at(-1)!)
        await waitFor(() => expect(createMock).toHaveBeenCalled())
        expect(createMock.mock.calls[0][0]).toMatchObject({
            name: 'Новый отчёт',
            kind: 'custom',
            visibility: 'personal',
        })
        expect(navigateMock).toHaveBeenCalledWith('/reports?custom=new-id')
    })

    it('редактирование (?edit=) подставляет имя и обновляет через PUT', async () => {
        const user = userEvent.setup()
        renderBuilder('/reports/builder?edit=edit-1')
        expect(await screen.findByText('Редактирование отчёта')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))
        expect(screen.getByDisplayValue('Мой отчёт')).toBeInTheDocument()
        await user.click(screen.getAllByRole('button', { name: 'Сохранить' }).at(-1)!)
        await waitFor(() => expect(updateMock).toHaveBeenCalledWith('edit-1', expect.any(Object), { projectId: 'p1' }))
    })

    it('ST-30 dirty-guard при уходе назад', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByLabelText('Контакты'))
        await user.click(screen.getByTitle('Назад к отчётам'))
        expect(confirmMock).toHaveBeenCalled()
        expect(navigateMock).toHaveBeenCalledWith('/reports')
    })

    it('добавление и удаление строки фильтра', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByRole('button', { name: '+ Добавить фильтр' }))
        expect(screen.getByText('×')).toBeInTheDocument()
        await user.click(screen.getByText('×'))
        expect(screen.queryByText('×')).not.toBeInTheDocument()
    })

    it('смена визуализации на «Таблица»', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByLabelText('Таблица'))
        expect(screen.getByLabelText('Таблица')).toBeChecked()
    })

    it('доступ «Для всего проекта» попадает в payload', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))
        await user.type(screen.getByPlaceholderText('Введите название'), 'Общий')
        await user.click(screen.getByLabelText('Для всего проекта'))
        await user.click(screen.getAllByRole('button', { name: 'Сохранить' }).at(-1)!)
        await waitFor(() => expect(createMock).toHaveBeenCalled())
        expect(createMock.mock.calls[0][0]).toMatchObject({ visibility: 'project' })
    })

    it('редактирование фильтра: значение, описание и доступ «Личный»', async () => {
        const user = userEvent.setup()
        renderBuilder()
        await user.click(screen.getByRole('button', { name: '+ Добавить фильтр' }))
        const valueInputs = screen.getAllByRole('textbox')
        const filterValue = valueInputs.find(
            (el) => el.getAttribute('class')?.includes('flex-1') && !(el as HTMLInputElement).placeholder,
        ) as HTMLInputElement
        await user.type(filterValue, 'won')
        await user.click(screen.getByRole('button', { name: 'Сохранить отчёт' }))
        await user.type(screen.getByPlaceholderText('Введите название'), 'С фильтром')
        await user.type(screen.getByPlaceholderText('Необязательно'), 'Краткое описание')
        await user.click(screen.getByLabelText('Для всего проекта'))
        await user.click(screen.getByLabelText('Личный'))
        await user.click(screen.getAllByRole('button', { name: 'Сохранить' }).at(-1)!)
        await waitFor(() => expect(createMock).toHaveBeenCalled())
        expect(createMock.mock.calls[0][0]).toMatchObject({
            name: 'С фильтром',
            description: 'Краткое описание',
            visibility: 'personal',
            spec: expect.objectContaining({
                filters: expect.arrayContaining([
                    expect.objectContaining({ value: 'won' }),
                ]),
            }),
        })
    })
})
