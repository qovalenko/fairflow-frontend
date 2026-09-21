import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DealImport from './DealImport'
import { DEALS_IMPORT_ENABLED } from '../featureFlags'

/**
 * TODO-187: мастер импорта сделок был моком — показывал «создано 10 / обновлено 2»
 * без единого запроса. Серверной ручки импорта сделок нет, поэтому маршрут отдаёт
 * честную заглушку, а точки входа скрыты флагом.
 */
// `__QA_IDS_ENABLED__` подставляется Vite-define при сборке модуля; под vitest
// (минимальный vite-пайплайн host/testing/vitest.shared.ts) его нет — объявляем сами.
vi.stubGlobal('__QA_IDS_ENABLED__', false)

describe('DealImport (заглушка импорта сделок)', () => {
    it('точка входа в импорт выключена, пока нет серверной ручки', () => {
        // Флаг включают ВМЕСТЕ с реализацией (gateway POST /v1/deals/import + мастер),
        // тогда же обновляют и этот тест — см. src/featureFlags.ts.
        expect(DEALS_IMPORT_ENABLED).toBe(false)
    })

    it('сообщает о недоступности и не показывает выдуманный отчёт импорта', () => {
        const { container } = render(
            <MemoryRouter>
                <DealImport />
            </MemoryRouter>,
        )

        expect(screen.getByText('Импорт сделок пока недоступен')).toBeInTheDocument()
        // Ни одной цифры фейкового отчёта («Создано/Обновлено/Пропущено/Ошибки»).
        expect(container.textContent).not.toMatch(/Создано|Обновлено|Пропущено/)
    })
})
