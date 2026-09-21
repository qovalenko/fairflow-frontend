import { useMemo, type ComponentType } from 'react'
import { Navigate, matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import OrderList from './OrderList'
import OrderKanban from './OrderKanban'
import OrderTypes from './OrderTypes'
import OrderTypeForm from './OrderTypeForm'
import OrderDetails from './OrderDetails'
import OrderEdit from './OrderEdit'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

/**
 * TODO-209: мастер импорта продаж был полностью фальшивым — литеральное превью
 * и выдуманный отчёт `{created:10, updated:2, skipped:1}` без единого сетевого
 * вызова (RPC ImportOrders и POST /v1/orders/import не существуют). Экран снят;
 * старые deep-link'и уводим в список, иначе `/orders/import` подхватит маршрут
 * `/orders/:id` и откроет карточку несуществующей продажи «import».
 */
const ImportRemoved = () => {
    const { pathname } = useLocation()
    return <Navigate to={pathname.replace(/\/import$/, '')} replace />
}

const routeViews: RouteView[] = [
    {
        patterns: ['/orders/import', '/p/:pid/orders/import'],
        component: ImportRemoved,
    },
    {
        patterns: ['/orders/types/new', '/p/:pid/orders/types/new'],
        component: OrderTypeForm,
    },
    {
        patterns: ['/orders/types/:id/edit', '/p/:pid/orders/types/:id/edit'],
        component: OrderTypeForm,
    },
    {
        patterns: ['/orders/types', '/p/:pid/orders/types'],
        component: OrderTypes,
    },
    {
        patterns: ['/orders/kanban', '/p/:pid/orders/kanban'],
        component: OrderKanban,
    },
    {
        patterns: ['/orders/:id/edit', '/p/:pid/orders/:id/edit'],
        component: OrderEdit,
    },
    {
        patterns: ['/orders/:id', '/p/:pid/orders/:id'],
        component: OrderDetails,
    },
    {
        patterns: ['/orders', '/p/:pid/orders'],
        component: OrderList,
    },
]

const OrdersModule = () => {
    const { pathname } = useLocation()

    const ResolvedView = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                return route.component
            }
        }
        return OrderList
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default OrdersModule
