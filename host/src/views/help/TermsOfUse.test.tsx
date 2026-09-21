import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TermsOfUse from './TermsOfUse'

describe('TermsOfUse (SCR-HELP-TERMS)', () => {
    it('shows terms title and all sections', () => {
        render(<TermsOfUse />)

        expect(
            screen.getByRole('heading', { name: 'Правила использования' }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Актуальная версия. Использование сервиса означает согласие с данными правилами.',
            ),
        ).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '1. Общие положения' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: '7. Контакты' })).toBeInTheDocument()
    })
})
