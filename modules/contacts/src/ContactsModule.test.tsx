import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

/**
 * Сторожевой тест таблицы маршрутов ремоута contacts.
 * Инвариант: плоские URL (host) и project-scoped (standalone) резолвятся
 * в один и тот же экран; специфичные маршруты выигрывают у /contacts/:id.
 */
vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./ContactList', () => ({ default: () => <div data-testid="view">ContactList</div> }))
vi.mock('./ContactDetails', () => ({ default: () => <div data-testid="view">ContactDetails</div> }))
vi.mock('./ContactEdit', () => ({ default: () => <div data-testid="view">ContactEdit</div> }))
vi.mock('./ContactImport', () => ({ default: () => <div data-testid="view">ContactImport</div> }))
vi.mock('./ContactTrash', () => ({ default: () => <div data-testid="view">ContactTrash</div> }))
vi.mock('./ContactDuplicateQueue', () => ({
    default: () => <div data-testid="view">ContactDuplicateQueue</div>,
}))
vi.mock('./ContactMerge', () => ({ default: () => <div data-testid="view">ContactMerge</div> }))

const { default: ContactsModule } = await import('./ContactsModule')

const renderAt = (pathname: string) => {
    const { unmount } = render(
        <MemoryRouter initialEntries={[pathname]}>
            <ContactsModule />
        </MemoryRouter>,
    )
    const view = screen.getByTestId('view').textContent
    unmount()
    return view
}

const cases: Array<[string, string, string]> = [
    ['/contacts', '/p/proj-1/contacts', 'ContactList'],
    ['/contacts/import', '/p/proj-1/contacts/import', 'ContactImport'],
    ['/contacts/trash', '/p/proj-1/contacts/trash', 'ContactTrash'],
    ['/contacts/duplicates', '/p/proj-1/contacts/duplicates', 'ContactDuplicateQueue'],
    ['/contacts/merge', '/p/proj-1/contacts/merge', 'ContactMerge'],
    ['/contacts/c1', '/p/proj-1/contacts/c1', 'ContactDetails'],
    ['/contacts/c1/edit', '/p/proj-1/contacts/c1/edit', 'ContactEdit'],
]

describe('ContactsModule route table', () => {
    it.each(cases)('резолвит %s и %s в %s', (flatPath, projectScopedPath, expected) => {
        expect(renderAt(flatPath)).toBe(expected)
        expect(renderAt(projectScopedPath)).toBe(expected)
    })

    it('специфичные маршруты выигрывают у /contacts/:id', () => {
        expect(renderAt('/contacts/import')).not.toBe('ContactDetails')
        expect(renderAt('/p/proj-1/contacts/merge')).not.toBe('ContactDetails')
    })

    it('неизвестный путь падает в список', () => {
        expect(renderAt('/contacts/c1/unknown-tab')).toBe('ContactList')
    })
})
