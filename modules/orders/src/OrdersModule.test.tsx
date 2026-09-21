import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import OrdersModule from './OrdersModule'

/**
 * TODO-417 (часть про «недостижимые маршруты»): вторые паттерны `/p/:pid/orders*`
 * в routeViews НЕ мёртвые. В host-режиме они действительно не зарегистрированы
 * (routes.config объявляет плоские `/orders*`), но ремоут обязан работать и в
 * standalone: `StandaloneModuleApp` монтирует модуль по ДВУМ путям —
 * `${modulePath}/*` и `/p/:pid${modulePath}/*`. Убери второй паттерн — и любой
 * project-scoped deep-link в standalone-сборке отвалится в fallback.
 * Тест фиксирует это, чтобы «чистка мёртвого кода» не сломала standalone.
 */
vi.mock('./OrderList', () => ({ default: () => <div>ЭКРАН: список</div> }))
vi.mock('./OrderKanban', () => ({ default: () => <div>ЭКРАН: доска</div> }))
vi.mock('./OrderTypes', () => ({ default: () => <div>ЭКРАН: типы</div> }))
vi.mock('./OrderTypeForm', () => ({ default: () => <div>ЭКРАН: конструктор</div> }))
vi.mock('./OrderDetails', () => ({ default: () => <div>ЭКРАН: карточка</div> }))
vi.mock('./OrderEdit', () => ({ default: () => <div>ЭКРАН: правка</div> }))
vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children?: ReactNode }) => (
        <div>{children}</div>
    ),
}))

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <OrdersModule />
        </MemoryRouter>,
    )

const cases: [string, string][] = [
    ['/orders', 'ЭКРАН: список'],
    ['/orders/kanban', 'ЭКРАН: доска'],
    ['/orders/types', 'ЭКРАН: типы'],
    ['/orders/types/new', 'ЭКРАН: конструктор'],
    ['/orders/types/t1/edit', 'ЭКРАН: конструктор'],
    ['/orders/o1', 'ЭКРАН: карточка'],
    ['/orders/o1/edit', 'ЭКРАН: правка'],
]

describe('OrdersModule — резолв маршрутов', () => {
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

    /**
     * TODO-209: мастер импорта продаж был полностью фальшивым (литеральное превью
     * и выдуманный отчёт `{created:10,…}` без единого сетевого вызова). Пока нет
     * RPC ImportOrders + POST /v1/orders/import, экран снят с маршрутизации:
     * `/orders/import` не должен резолвиться в отдельный экран импорта, а падает
     * в fallback-список. Тест держит маршрут снятым до появления бэкенда.
     */
    it.each(['/orders/import', '/p/p1/orders/import'])(
        '%s не открывает экран импорта (TODO-209), а падает в список',
        (path) => {
            renderAt(path)
            expect(screen.getByText('ЭКРАН: список')).toBeInTheDocument()
            expect(screen.queryByText(/импорт/i)).not.toBeInTheDocument()
        },
    )
})
