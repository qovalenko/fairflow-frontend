import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OnboardingProgress from './OnboardingProgress'

describe('OnboardingProgress (BX-ONB-1)', () => {
    it('marks completed stages and highlights the current one', () => {
        const { container } = render(<OnboardingProgress stage={2} />)

        expect(screen.getByText('Аккаунт')).toBeInTheDocument()
        expect(screen.getByText('Проект')).toBeInTheDocument()
        expect(screen.getByText('Первые шаги')).toBeInTheDocument()

        const steps = container.querySelectorAll('.step-item')
        expect(steps[0]).toHaveClass('step-item-complete')
        expect(steps[1]).toHaveClass('step-item-in-progress')
        expect(steps[2]).toHaveClass('step-item-pending')
    })
})
