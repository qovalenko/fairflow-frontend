import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Container } from './shared-ui-stub'

describe('shared-ui-stub — Container для vitest', () => {
    it('рендерит переданных children', () => {
        render(
            <Container>
                <span>Automation content</span>
            </Container>,
        )
        expect(screen.getByText('Automation content')).toBeInTheDocument()
    })
})
