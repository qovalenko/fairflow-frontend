import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RemoteModuleErrorBoundary from './RemoteModuleErrorBoundary'

function Boom(): null {
    throw new Error('remote chunk failed')
}

describe('RemoteModuleErrorBoundary (TODO-510)', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('логирует ошибку и показывает безопасный текст без технического moduleName', () => {
        render(
            <RemoteModuleErrorBoundary moduleName="portfolio.deals">
                <Boom />
            </RemoteModuleErrorBoundary>,
        )

        expect(screen.getByText('Модуль временно недоступен')).toBeInTheDocument()
        expect(screen.getByText(/Не удалось загрузить раздел/)).toBeInTheDocument()
        expect(screen.getByText(/данные в безопасности/i)).toBeInTheDocument()
        expect(screen.queryByText(/portfolio\.deals/)).not.toBeInTheDocument()
        expect(console.error).toHaveBeenCalled()
    })
})
