import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Pipeline } from '@/@types/crm'

const apiGetPipelines = vi.fn()
const apiDeletePipeline = vi.fn()
const navigate = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetPipelines: (...a: unknown[]) => apiGetPipelines(...a),
    apiDeletePipeline: (...a: unknown[]) => apiDeletePipeline(...a),
}))
vi.mock('../Deals/dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))

import PipelineList from './PipelineList'

const pipeline = (over: Partial<Pipeline> = {}): Pipeline => ({
    id: 'pl1',
    name: 'Основная воронка',
    isDefault: true,
    stages: [
        { id: 's1', name: 'Новая', color: '#3B82F6', order: 0 },
        { id: 's2', name: 'Won', color: '#10B981', order: 1 },
    ],
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('PipelineList', () => {
    beforeEach(() => {
        permissions = new Set(['deals:read', 'deals:manage'])
        apiGetPipelines.mockReset()
        apiDeletePipeline.mockReset()
        navigate.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiGetPipelines.mockResolvedValue([pipeline()])
        apiDeletePipeline.mockResolvedValue(undefined)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('ошибка загрузки — сообщение и «Повторить»', async () => {
        apiGetPipelines.mockRejectedValue(new Error('boom'))
        render(<PipelineList />)

        expect(await screen.findByText('Не удалось загрузить воронки')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой список предлагает создать первую воронку менеджеру', async () => {
        apiGetPipelines.mockResolvedValue([])
        render(<PipelineList />)

        expect(await screen.findByText('Воронок пока нет')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Создать первую' }))
        expect(navigate).toHaveBeenCalledWith('/deals/pipelines/new')
    })

    it('рендерит воронки и удаляет не-default по подтверждению', async () => {
        apiGetPipelines.mockResolvedValue([
            pipeline(),
            pipeline({ id: 'pl2', name: 'Дополнительная', isDefault: false }),
        ])

        render(<PipelineList />)

        expect(await screen.findByText('Основная воронка')).toBeInTheDocument()
        expect(screen.getByText('Дополнительная')).toBeInTheDocument()
        expect(screen.getAllByText('Стадий: 2')).toHaveLength(2)

        const deleteButtons = screen.getAllByRole('button').filter((btn) =>
            btn.className.includes('text-red-500'),
        )
        expect(deleteButtons).toHaveLength(1)
        fireEvent.click(deleteButtons[0]!)

        await waitFor(() => expect(apiDeletePipeline).toHaveBeenCalledWith('pl2'))
        expect(notifySuccess).toHaveBeenCalledWith('Воронка удалена')
    })

    it('без deals:manage не показывает кнопку создания', async () => {
        permissions = new Set(['deals:read'])
        render(<PipelineList />)

        await screen.findByText('Основная воронка')
        expect(screen.queryByRole('button', { name: 'Создать воронку' })).not.toBeInTheDocument()
    })
})
