import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import ProductList from './ProductList'
import ProductPricing from './ProductPricing'
import ProductDetails from './ProductDetails'
import ProductEdit from './ProductEdit'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/products/pricing', '/p/:pid/products/pricing'],
        component: ProductPricing,
    },
    {
        patterns: ['/products/:id/edit', '/p/:pid/products/:id/edit'],
        component: ProductEdit,
    },
    {
        patterns: ['/products/:id', '/p/:pid/products/:id'],
        component: ProductDetails,
    },
    {
        patterns: ['/products', '/p/:pid/products'],
        component: ProductList,
    },
]

const ProductsModule = () => {
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
        return ProductList
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default ProductsModule
