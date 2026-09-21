import Alert from '@/components/ui/Alert'
import BootstrapForm from './components/BootstrapForm'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'
import usePublicConfig from '@/utils/hooks/usePublicConfig'
import OnboardingProgress from '@/views/onboarding/OnboardingProgress'
import { qa } from '@/shared/qa'

/**
 * SCR-BOX-BOOTSTRAP — «Создание первого администратора» коробки.
 * documents/box/03-ARCHITECTURE.md §5.4 / §7 шаг 17. Публичный экран (до
 * логина). Форма: Организация / ФИО / Email / Пароль≥8 / подтверждение.
 * Поля без подписей — плейсхолдеры + тултипы при наведении (см. BootstrapForm).
 */
const Bootstrap = () => {
    const [message, setMessage] = useTimeOutMessage()
    const { appName } = usePublicConfig()

    return (
        <div {...qa('host.bootstrap.page')}>
            {/* BX-ONB-4: видимый онбординг-хребет — этап 1 «Аккаунт» активен;
                после bootstrap мост /onboarding/welcome покажет этап 2. */}
            <OnboardingProgress stage={1} className="mb-8" />
            <div className="mb-8">
                <h2 className="mb-2">Добро пожаловать в {appName}</h2>
                <p className="font-semibold heading-text">
                    Это первый запуск. Создайте организацию и учётную запись
                    администратора.
                </p>
            </div>
            {message && (
                <Alert
                    showIcon
                    className="mb-4"
                    type="danger"
                    {...qa('host.bootstrap.error')}
                >
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <BootstrapForm setMessage={setMessage} />
        </div>
    )
}

export default Bootstrap
