import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Pipeline } from '@/@types/crm'

const apiGetPipeline = vi.fn()
const apiCreatePipeline = vi.fn()
const apiUpdatePipeline = vi.fn()
const navigate = vi.fn()
const notifySuccess = vi.fn()
const notifyError = vi.fn()

let routeId: string | undefined

vi.mock('react-router', () => ({
    useParams: () => ({ id: routeId }),
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetPipeline: (...a: unknown[]) => apiGetPipeline(...a),
    apiCreatePipeline: (...a: unknown[]) => apiCreatePipeline(...a),
    apiUpdatePipeline: (...a: unknown[]) => apiUpdatePipeline(...a),
}))
vi.mock('../Deals/dealUtils', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifySuccess: (m: string) => notifySuccess(m),
    notifyError: (m: string) => notifyError(m),
}))

import PipelineEdit from './PipelineEdit'

const loadedPipeline: Pipeline = {
    id: 'pl1',
    name: 'Продажи B2B',
    isDefault: false,
    stages: [
        { id: 's1', name: 'Лид', color: '#3B82F6', order: 0, kind: 'active' },
        { id: 's2', name: 'Won', color: '#10B981', order: 1, kind: 'won' },
    ],
}

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('PipelineEdit', () => {
    beforeEach(() => {
        routeId = undefined
        apiGetPipeline.mockReset()
        apiCreatePipeline.mockReset()
        apiUpdatePipeline.mockReset()
        navigate.mockReset()
        notifySuccess.mockClear()
        notifyError.mockClear()
        apiCreatePipeline.mockResolvedValue(loadedPipeline)
        apiUpdatePipeline.mockResolvedValue(loadedPipeline)
    })

    it('режим создания: дефолтные стадии и сохранение новой воронки', async () => {
        render(<PipelineEdit />)

        expect(await screen.findByDisplayValue('Обращение')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText('Название воронки'), {
            target: { value: 'Новая воронка' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreatePipeline).toHaveBeenCalled())
        expect(apiCreatePipeline.mock.calls[0]?.[0]).toMatchObject({
            name: 'Новая воронка',
        })
        expect(notifySuccess).toHaveBeenCalledWith('Воронка сохранена')
        expect(navigate).toHaveBeenCalledWith('/deals/pipelines')
    })

    it('режим редактирования: загрузка и not-found при ошибке', async () => {
        routeId = 'pl-missing'
        apiGetPipeline.mockRejectedValue(new Error('404'))

        render(<PipelineEdit />)

        expect(await screen.findByText('Воронка не найдена')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'К списку воронок' }))
        expect(navigate).toHaveBeenCalledWith('/deals/pipelines')
    })

    it('режим редактирования: гидратация формы и update', async () => {
        routeId = 'pl1'
        apiGetPipeline.mockResolvedValue(loadedPipeline)

        render(<PipelineEdit />)

        expect(await screen.findByDisplayValue('Продажи B2B')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText('Название воронки'), {
            target: { value: 'Продажи B2B v2' },
        })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() =>
            expect(apiUpdatePipeline).toHaveBeenCalledWith(
                'pl1',
                expect.objectContaining({ name: 'Продажи B2B v2' }),
            ),
        )
    })
})
