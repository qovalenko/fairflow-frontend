import { useLocation, useNavigate } from 'react-router'
import Tabs from '@/components/ui/Tabs'
import { qa } from './qa'

const { TabNav, TabList } = Tabs

type ProductsTab = 'catalog' | 'pricing'

interface ProductsTabsProps {
    /** Возврат false отменяет переключение таба (напр. подтверждение несохранённых цен). */
    beforeLeave?: () => boolean
}

/**
 * Единый заголовок раздела «Продукты» с табами «Каталог» / «Цены».
 * Каталог и прайс-лист (bulk-редактор цен) — один раздел, переключаемый табами.
 * Активный таб выводится из маршрута (контролируемый таб); путь без /p/:pid-префикса,
 * как и остальная навигация модуля (текущий проект резолвится из контекста).
 */
const ProductsTabs = ({ beforeLeave }: ProductsTabsProps) => {
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const active: ProductsTab = pathname.endsWith('/pricing') ? 'pricing' : 'catalog'

    const handleChange = (val: string) => {
        const target: ProductsTab = val === 'pricing' ? 'pricing' : 'catalog'
        if (target === active) return
        if (beforeLeave && !beforeLeave()) return
        navigate(target === 'pricing' ? '/products/pricing' : '/products')
    }

    return (
        <Tabs value={active} onChange={handleChange} {...qa('products.tabs')}>
            <TabList>
                <TabNav value="catalog" {...qa('products.tabs.catalog')}>
                    Каталог
                </TabNav>
                <TabNav value="pricing" {...qa('products.tabs.pricing')}>
                    Цены
                </TabNav>
            </TabList>
        </Tabs>
    )
}

export default ProductsTabs
