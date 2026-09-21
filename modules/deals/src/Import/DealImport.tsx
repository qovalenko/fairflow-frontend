import { useNavigate } from 'react-router'
import { PiWarningCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import { qa } from '../qa'

/**
 * TODO-187. Мастер импорта сделок был моком: файл не парсился, запросов не было,
 * отчёт «создано 10 / обновлено 2» был захардкожен — экран врал об успешном
 * импорте. Серверной ручки импорта сделок нет (в gateway существуют только
 * `contacts/import` и `companies/import`), поэтому мок удалён, а маршрут
 * отвечает честной заглушкой. Флаг и порядок включения — src/featureFlags.ts.
 */
export default function DealImport() {
    const navigate = useNavigate()

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col items-center gap-3 py-10 text-center" {...qa('deals.import.unavailable')}>
                    <PiWarningCircleDuotone className="w-12 h-12 text-amber-500" />
                    <h3 className="text-lg font-medium">Импорт сделок пока недоступен</h3>
                    <p className="text-sm text-gray-500 max-w-md">
                        Загрузка сделок из файла ещё не поддерживается сервером. Сделки можно
                        завести вручную — кнопкой «Создать сделку» в списке, в том числе как
                        лид без контакта.
                    </p>
                    <Button variant="solid" color="primary" onClick={() => navigate('/deals')}>
                        К списку сделок
                    </Button>
                </div>
            </AdaptiveCard>
        </Container>
    )
}
