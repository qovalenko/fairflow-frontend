import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import ArticleView from './ArticleView'

describe('ArticleView (SCR-HELP-ARTICLE)', () => {
    it('shows article content with breadcrumbs for known slug', () => {
        render(
            <MemoryRouter initialEntries={['/help/article/getting-started']}>
                <Routes>
                    <Route path="/help/article/:slug" element={<ArticleView />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByRole('link', { name: 'Центр поддержки' })).toHaveAttribute(
            'href',
            '/help',
        )
        expect(
            screen.getByRole('heading', {
                name: 'Обзор Fairflow: проекты, модули и роли',
            }),
        ).toBeInTheDocument()
        expect(screen.getByText(/мин на чтение/)).toBeInTheDocument()
        expect(screen.getByText('Не нашли ответ?')).toBeInTheDocument()
    })

    it('shows not-found state for unknown slug', () => {
        render(
            <MemoryRouter initialEntries={['/help/article/unknown-slug-xyz']}>
                <Routes>
                    <Route path="/help/article/:slug" element={<ArticleView />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('Статья не найдена')).toBeInTheDocument()
        expect(
            screen.getByRole('link', { name: 'Вернуться в Центр поддержки' }),
        ).toHaveAttribute('href', '/help')
    })
})
