import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import SupportHub from './SupportHub'

describe('SupportHub (SCR-HELP-HUB)', () => {
    it('shows overview sections without search query', () => {
        render(
            <MemoryRouter initialEntries={['/help']}>
                <SupportHub />
            </MemoryRouter>,
        )

        expect(screen.getByText('Рекомендуем начать с этого')).toBeInTheDocument()
        expect(screen.queryByText(/Результаты по запросу/i)).not.toBeInTheDocument()
    })

    it('shows search results for query param', () => {
        render(
            <MemoryRouter initialEntries={['/help?q=проект']}>
                <SupportHub />
            </MemoryRouter>,
        )

        expect(screen.getByText(/Результаты по запросу:/)).toBeInTheDocument()
        expect(screen.getByText('проект')).toBeInTheDocument()
    })

    it('shows empty search state for unknown query', () => {
        render(
            <MemoryRouter initialEntries={['/help?q=zzzz-no-articles-zzzz']}>
                <SupportHub />
            </MemoryRouter>,
        )

        expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'списку разделов' })).toHaveAttribute(
            'href',
            '/help',
        )
    })
})
