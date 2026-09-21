import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DocumentsModule from './DocumentsModule'

vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./DocumentList', () => ({ default: () => <div>ЭКРАН: список</div> }))
vi.mock('./Templates', () => ({ default: () => <div>ЭКРАН: шаблоны</div> }))
vi.mock('./TemplateForm', () => ({ default: () => <div>ЭКРАН: форма шаблона</div> }))
vi.mock('./DocumentDetails', () => ({ default: () => <div>ЭКРАН: карточка</div> }))
vi.mock('./DocumentsDept', () => ({ default: () => <div>ЭКРАН: отдел</div> }))

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <DocumentsModule />
        </MemoryRouter>,
    )

const cases: [string, string][] = [
    ['/documents', 'ЭКРАН: список'],
    ['/documents/g1', 'ЭКРАН: карточка'],
    ['/documents/templates', 'ЭКРАН: шаблоны'],
    ['/documents/templates/new', 'ЭКРАН: форма шаблона'],
    ['/documents/templates/t1/edit', 'ЭКРАН: форма шаблона'],
    ['/documents/department', 'ЭКРАН: отдел'],
]

describe('DocumentsModule — резолв маршрутов', () => {
    it.each(cases)('плоский путь %s → %s', (path, expected) => {
        renderAt(path)
        expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it.each(cases)(
        'project-scoped /p/:pid%s (standalone) → %s',
        (path, expected) => {
            renderAt(`/p/p1${path}`)
            expect(screen.getByText(expected)).toBeInTheDocument()
        },
    )

    it('неизвестный подпуть падает в список', () => {
        renderAt('/documents/unknown/nested')
        expect(screen.getByText('ЭКРАН: список')).toBeInTheDocument()
    })
})
