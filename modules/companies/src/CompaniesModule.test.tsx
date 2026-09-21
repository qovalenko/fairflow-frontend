import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

/**
 * Сторожевой тест таблицы маршрутов ремоута (TODO-367).
 *
 * TODO-367 требовал «убрать нерегистрируемые паттерны /p/:pid/companies/*»,
 * считая их мёртвыми ветками резолвера. Реестр собирался по ветке main, где
 * standalone-раскатки ещё не было; после коммита e0e98b0 ("feat(frontend): roll
 * out standalone runtime across all microfrontends") оболочка standalone
 * регистрирует ДВА маршрута на модуль —
 *   host/src/components/template/StandaloneModuleApp.tsx:250  `${modulePath}/*`
 *   host/src/components/template/StandaloneModuleApp.tsx:261  `/p/:pid${modulePath}/*`
 * — то есть project-scoped deep-link `/p/<pid>/companies/...` реально монтирует
 * CompaniesModule, и вторые элементы patterns[] достижимы. Под host'ом
 * (routes.config.ts:567-604) зарегистрирован только префикс `/companies`, и там
 * работают первые элементы.
 *
 * Инвариант: обе формы URL — плоская и project-scoped — резолвятся в ОДИН и тот
 * же экран. Тест падает, если кто-то снова вычистит `/p/:pid`-паттерны как
 * «мёртвые» (сломав standalone deep-link) или разведёт две формы по разным вьюхам.
 */
vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./views/crm/Companies/CompanyList', () => ({
    default: () => <div data-testid="view">CompanyList</div>,
}))
vi.mock('./views/crm/Companies/CompanyDetails', () => ({
    default: () => <div data-testid="view">CompanyDetails</div>,
}))
vi.mock('./views/crm/Companies/CompanyEdit', () => ({
    default: () => <div data-testid="view">CompanyEdit</div>,
}))
vi.mock('./views/crm/Companies/CompanyTrash', () => ({
    default: () => <div data-testid="view">CompanyTrash</div>,
}))
vi.mock('./views/crm/Companies/CompanyMerge', () => ({
    default: () => <div data-testid="view">CompanyMerge</div>,
}))
vi.mock('./views/crm/Import/CompanyImport', () => ({
    default: () => <div data-testid="view">CompanyImport</div>,
}))

const { default: CompaniesModule } = await import('./CompaniesModule')

const renderAt = (pathname: string) => {
    const { unmount } = render(
        <MemoryRouter initialEntries={[pathname]}>
            <CompaniesModule />
        </MemoryRouter>,
    )
    const view = screen.getByTestId('view').textContent
    unmount()
    return view
}

/** [плоский URL (host), project-scoped URL (standalone), ожидаемый экран] */
const cases: Array<[string, string, string]> = [
    ['/companies', '/p/proj-1/companies', 'CompanyList'],
    ['/companies/import', '/p/proj-1/companies/import', 'CompanyImport'],
    ['/companies/trash', '/p/proj-1/companies/trash', 'CompanyTrash'],
    ['/companies/merge', '/p/proj-1/companies/merge', 'CompanyMerge'],
    ['/companies/c1', '/p/proj-1/companies/c1', 'CompanyDetails'],
    ['/companies/c1/edit', '/p/proj-1/companies/c1/edit', 'CompanyEdit'],
]

describe('CompaniesModule route table', () => {
    it.each(cases)(
        'резолвит %s и %s в %s',
        (flatPath, projectScopedPath, expected) => {
            expect(renderAt(flatPath)).toBe(expected)
            expect(renderAt(projectScopedPath)).toBe(expected)
        },
    )

    it('специфичные маршруты выигрывают у /companies/:id', () => {
        // Порядок routeViews важен: 'import'/'trash'/'merge' объявлены ВЫШЕ
        // '/companies/:id', иначе они бы съелись как id компании.
        expect(renderAt('/companies/import')).not.toBe('CompanyDetails')
        expect(renderAt('/p/proj-1/companies/merge')).not.toBe('CompanyDetails')
    })

    it('неизвестный путь падает в список, а не в белый экран', () => {
        expect(renderAt('/companies/c1/unknown-tab')).toBe('CompanyList')
    })
})
