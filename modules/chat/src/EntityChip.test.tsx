import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EntityChip from './EntityChip'

const navigate = vi.fn()
vi.mock('react-router', () => ({
    useNavigate: () => navigate,
}))

describe('EntityChip', () => {
    it('клик ведёт на карточку сущности', () => {
        render(<EntityChip entity={{ type: 'deal', id: 'd1', label: 'Сделка №1' }} />)
        expect(screen.getByText('Сделка №1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button'))
        expect(navigate).toHaveBeenCalledWith('/deals/d1')
    })
})
