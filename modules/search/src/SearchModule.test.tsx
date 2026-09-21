import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('./SearchResults', () => ({
    default: () => <div>ЭКРАН: результаты поиска</div>,
}))

import SearchModule from './SearchModule'

describe('SearchModule — маршрут', () => {
    it('рендерит экран результатов поиска в Container', () => {
        render(
            <MemoryRouter initialEntries={['/search?q=test']}>
                <SearchModule />
            </MemoryRouter>,
        )
        expect(screen.getByTestId('shared-ui-container')).toBeInTheDocument()
        expect(screen.getByText('ЭКРАН: результаты поиска')).toBeInTheDocument()
    })
})
