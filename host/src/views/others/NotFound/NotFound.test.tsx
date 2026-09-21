import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import NotFound from './NotFound'

const navigate = vi.fn()

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
    }
})

describe('NotFound (ST-9)', () => {
    it('shows requested path and navigation actions', () => {
        render(
            <MemoryRouter initialEntries={['/unknown/path']}>
                <NotFound />
            </MemoryRouter>,
        )
        expect(screen.getByText('Страница не найдена')).toBeInTheDocument()
        expect(screen.getByText('/unknown/path')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'На главную' })).toBeInTheDocument()
    })

    it('navigates back and home from action buttons', async () => {
        render(
            <MemoryRouter>
                <NotFound />
            </MemoryRouter>,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Назад' }))
        expect(navigate).toHaveBeenCalledWith(-1)
        await userEvent.click(screen.getByRole('button', { name: 'На главную' }))
        expect(navigate).toHaveBeenCalledWith('/')
    })
})
