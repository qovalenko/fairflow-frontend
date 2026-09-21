import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ProductsModule from './ProductsModule'

vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

/**
 * TODO-417 (products): `/p/:pid/products*` — не мёртвые маршруты. В standalone
 * `StandaloneModuleApp` монтирует модуль по `${modulePath}/*` и
 * `/p/:pid${modulePath}/*`; без вторых паттернов deep-link падает в ProductList.
 * Регрессия после merge fix/cursor-products, где паттерны сняли как «dead code».
 */
vi.mock('./ProductList', () => ({ default: () => <div>ЭКРАН: список</div> }))
vi.mock('./ProductPricing', () => ({ default: () => <div>ЭКРАН: цены</div> }))
vi.mock('./ProductDetails', () => ({ default: () => <div>ЭКРАН: карточка</div> }))
vi.mock('./ProductEdit', () => ({ default: () => <div>ЭКРАН: правка</div> }))

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ProductsModule />
        </MemoryRouter>,
    )

const cases: [string, string][] = [
    ['/products', 'ЭКРАН: список'],
    ['/products/pricing', 'ЭКРАН: цены'],
    ['/products/p1', 'ЭКРАН: карточка'],
    ['/products/p1/edit', 'ЭКРАН: правка'],
]

describe('ProductsModule — резолв маршрутов', () => {
    it.each(cases)('плоский путь %s → %s', (path, expected) => {
        renderAt(path)
        expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it.each(cases)(
        'project-scoped /p/:pid%s (standalone) → %s',
        (path: string, expected: string) => {
            renderAt(`/p/proj-1${path}`)
            expect(screen.getByText(expected)).toBeInTheDocument()
        },
    )

    it('неизвестный путь внутри модуля откатывается к списку', () => {
        renderAt('/products/unknown/extra')
        expect(screen.getByText('ЭКРАН: список')).toBeInTheDocument()
    })
})
