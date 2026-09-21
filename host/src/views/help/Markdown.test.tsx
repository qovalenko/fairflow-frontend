import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Markdown from './Markdown'

describe('Markdown (SCR-HELP-MARKDOWN)', () => {
    it('renders markdown headings and paragraphs', () => {
        render(<Markdown>{'## Section\n\nParagraph text.'}</Markdown>)

        expect(screen.getByRole('heading', { name: 'Section' })).toBeInTheDocument()
        expect(screen.getByText('Paragraph text.')).toBeInTheDocument()
    })

    it('routes internal links through react-router', () => {
        render(
            <MemoryRouter>
                <Markdown>{'[Help hub](/help)'}</Markdown>
            </MemoryRouter>,
        )

        const link = screen.getByRole('link', { name: 'Help hub' })
        expect(link).toHaveAttribute('href', '/help')
        // Внутренние ссылки — react-router Link без новой вкладки; внешние — <a target="_blank">.
        expect(link).not.toHaveAttribute('target')
        expect(link).not.toHaveAttribute('rel')
    })

    it('opens external links in a new tab', () => {
        render(<Markdown>{'[Docs](https://example.com/docs)'}</Markdown>)

        const link = screen.getByRole('link', { name: 'Docs' })
        expect(link).toHaveAttribute('href', 'https://example.com/docs')
        expect(link).toHaveAttribute('target', '_blank')
    })
})
