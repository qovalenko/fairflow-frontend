import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccessDenied from './AccessDenied'

describe('AccessDenied', () => {
    it('renders access denied message', () => {
        render(<AccessDenied />)
        expect(screen.getByText('Access Denied!')).toBeInTheDocument()
        expect(
            screen.getByText('You have no permission to visit this page'),
        ).toBeInTheDocument()
    })
})
