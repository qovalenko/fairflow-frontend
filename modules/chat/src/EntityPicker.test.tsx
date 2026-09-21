import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EntityPicker from './EntityPicker'

const apiSearchEntities = vi.fn()

vi.mock('./chatService', () => ({
    apiSearchEntities: (...a: unknown[]) => apiSearchEntities(...a),
}))
vi.mock('@/utils/hooks/useResolvedProjectId', () => ({
    default: () => 'p1',
}))

describe('EntityPicker', () => {
    beforeEach(() => {
        apiSearchEntities.mockResolvedValue([
            { type: 'deal', id: 'd1', label: 'Сделка №1' },
        ])
    })

    it('debounced поиск и выбор сущности', async () => {
        const onPick = vi.fn()
        const onClose = vi.fn()
        render(<EntityPicker onPick={onPick} onClose={onClose} />)
        fireEvent.change(screen.getByPlaceholderText(/Поиск:/), { target: { value: 'Сдел' } })
        await waitFor(() =>
            expect(apiSearchEntities).toHaveBeenCalledWith('deal', 'Сдел', 'p1'),
        )
        expect(await screen.findByText('Сделка №1')).toBeInTheDocument()
        fireEvent.click(screen.getByText('Сделка №1'))
        expect(onPick).toHaveBeenCalledWith({ type: 'deal', id: 'd1', label: 'Сделка №1' })
    })

    it('Escape закрывает пикер', () => {
        const onClose = vi.fn()
        render(<EntityPicker onPick={vi.fn()} onClose={onClose} />)
        fireEvent.keyDown(screen.getByPlaceholderText(/Поиск:/), { key: 'Escape' })
        expect(onClose).toHaveBeenCalled()
    })

    it('ошибка поиска → сообщение об ошибке', async () => {
        apiSearchEntities.mockRejectedValue(new Error('fail'))
        render(<EntityPicker onPick={vi.fn()} onClose={vi.fn()} />)
        expect(await screen.findByText(/Ошибка поиска/)).toBeInTheDocument()
    })
})
