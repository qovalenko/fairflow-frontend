import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ComponentProps } from 'react'
import ProductsTabs from './ProductsTabs'

const navigateMock = vi.fn()
/** Перехват onChange из ProductsTabs.handleChange (UI-kit не вызывает его повторно для активного таба). */
let tabsOnChange: ((val: string) => void) | undefined

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/components/ui/Tabs', async () => {
    const actual = await vi.importActual<typeof import('@/components/ui/Tabs')>('@/components/ui/Tabs')
    const ActualTabs = actual.default

    const Tabs = (props: ComponentProps<typeof ActualTabs>) => {
        tabsOnChange = props.onChange as ((val: string) => void) | undefined
        return <ActualTabs {...props} />
    }
    Tabs.TabList = ActualTabs.TabList
    Tabs.TabNav = ActualTabs.TabNav
    Tabs.TabContent = ActualTabs.TabContent

    return { default: Tabs, Tabs }
})

const renderTabs = (path: string, beforeLeave?: () => boolean) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <ProductsTabs beforeLeave={beforeLeave} />
        </MemoryRouter>,
    )

describe('ProductsTabs', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        tabsOnChange = undefined
    })

    it('подсвечивает «Каталог» на /products', () => {
        renderTabs('/products')

        expect(screen.getByRole('tab', { name: 'Каталог' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'false')
    })

    it('подсвечивает «Цены» на /products/pricing', () => {
        renderTabs('/products/pricing')

        expect(screen.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'true')
    })

    it('переключение на «Цены» вызывает navigate', async () => {
        renderTabs('/products')

        fireEvent.click(screen.getByRole('tab', { name: 'Цены' }))
        expect(navigateMock).toHaveBeenCalledWith('/products/pricing')
    })

    it('beforeLeave=false блокирует переключение таба', async () => {
        const beforeLeave = vi.fn(() => false)
        renderTabs('/products', beforeLeave)

        fireEvent.click(screen.getByRole('tab', { name: 'Цены' }))
        expect(beforeLeave).toHaveBeenCalled()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('project-scoped путь /p/:pid/products/pricing подсвечивает «Цены»', () => {
        renderTabs('/p/proj-1/products/pricing')

        expect(screen.getByRole('tab', { name: 'Цены' })).toHaveAttribute('aria-selected', 'true')
    })

    it('клик по уже активному табу не вызывает navigate', () => {
        renderTabs('/products/pricing')
        expect(tabsOnChange).toBeDefined()

        // TabNav не вызывает onChange для уже выбранного таба — проверяем prod-guard в handleChange.
        tabsOnChange!('pricing')
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('переключение на «Каталог» с /products/pricing вызывает navigate', () => {
        renderTabs('/products/pricing')

        fireEvent.click(screen.getByRole('tab', { name: 'Каталог' }))
        expect(navigateMock).toHaveBeenCalledWith('/products')
    })
})
