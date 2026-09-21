import { useLocation, useNavigate } from 'react-router'
import Container from '@/components/shared/Container'
import Button from '@/components/ui/Button'
import SpaceSignBoard from '@/assets/svg/SpaceSignBoard'

/**
 * ST-9 (Not found) для любого нераспознанного маршрута.
 * Раньше неизвестный путь (например, `/imports/:id`) не матчился ни одним
 * <Route> в AllRoutes → React Router не рендерил ничего → БЕЛЫЙ ЭКРАН (U1).
 * Этот компонент монтируется catch-all маршрутом `*` и даёт явный «не найдено»
 * вместо пустой страницы.
 */
const NotFound = () => {
    const navigate = useNavigate()
    const { pathname } = useLocation()

    return (
        <Container className="h-full">
            <div className="h-full flex flex-col items-center justify-center">
                <SpaceSignBoard height={280} width={280} />
                <div className="mt-10 text-center">
                    <h3 className="mb-2">Страница не найдена</h3>
                    <p className="text-base text-gray-500">
                        Запрошенный адрес{' '}
                        <span className="font-mono">{pathname}</span> не
                        существует или был перемещён.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <Button onClick={() => navigate(-1)}>Назад</Button>
                        <Button
                            variant="solid"
                            onClick={() => navigate('/')}
                        >
                            На главную
                        </Button>
                    </div>
                </div>
            </div>
        </Container>
    )
}

export default NotFound
