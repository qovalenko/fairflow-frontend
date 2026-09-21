import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import Loading from '@/components/shared/Loading'
import appConfig from '@/configs/app.config'
import { loadPublicConfig } from '@/services/PublicConfigService'
import { usePublicConfigStore } from '@/store/publicConfigStore'
import { useSessionUser, useToken } from '@/store/authStore'
import { qaWithAlias } from '@/shared/qa'
import type { ReactNode } from 'react'

const BOOTSTRAP_PATH = '/bootstrap'

/**
 * PublicConfigGate — Фаза F, шаг 17 (documents/box/03-ARCHITECTURE.md §7).
 *
 * На старте приложения (до резолва landing / до рендера основного дерева)
 * один раз тянет `GET /api/public-config` и кладёт в стор. Устойчиво: любая
 * ошибка/404 → дефолты SaaS (loadPublicConfig fail-soft), поэтому SaaS-host без
 * коробочного бэка ведёт себя как раньше.
 *
 * Поведение по результату:
 *  - `needsBootstrap:true` (свежая коробка, админа ещё нет) → редирект на
 *    `/bootstrap` (экран create-first-admin). Пускаем на `/bootstrap` без
 *    авторизации; прочие пути перехватываем.
 *  - `needsBootstrap:false` → ничего не меняем: обычный флоу (`/auth/signin`).
 *
 * Уже вошедшего пользователя не трогаем ни при каком конфиге: `/bootstrap` лежит
 * под `PublicRoute`, который уводит аутентифицированного обратно на `/`, — так
 * что редирект отсюда замкнул бы бесконечный цикл навигаций вместо приложения.
 *
 * До первого ответа показываем короткий лоадер, чтобы не мигнуть sign-in-ом на
 * коробке, которой на самом деле нужен bootstrap.
 */
const PublicConfigGate = ({ children }: { children: ReactNode }) => {
    const loaded = usePublicConfigStore((s) => s.loaded)
    const config = usePublicConfigStore((s) => s.config)
    const setConfig = usePublicConfigStore((s) => s.setConfig)
    const signedIn = useSessionUser((s) => s.session.signedIn)
    const { token } = useToken()
    const navigate = useNavigate()
    const location = useLocation()
    const fetchedRef = useRef(false)

    // Гейт смонтирован выше AuthProvider, поэтому `useAuth` здесь недоступен —
    // считаем признак сессии ровно так же, как AuthProvider, иначе разойдёмся с
    // PublicRoute, который и создаёт встречный редирект.
    const hasSession =
        appConfig.accessTokenPersistStrategy === 'cookies'
            ? signedIn
            : Boolean(token && signedIn)

    // Один раз на старте: тянем публичный конфиг (fail-soft к дефолтам SaaS).
    // NB: без `alive`-cleanup — в React StrictMode (dev) эффект инвокается дважды
    // (mount→cleanup→mount), и cleanup первого прохода погасил бы единственный
    // fetch (второй проход выходит по fetchedRef), оставив loaded=false навсегда
    // (вечный лоадер только в dev; в prod StrictMode не дублирует эффекты).
    // fetchedRef гарантирует единственный запрос; setConfig идемпотентен.
    useEffect(() => {
        if (fetchedRef.current) return
        fetchedRef.current = true
        loadPublicConfig().then(setConfig)
    }, [setConfig])

    // После загрузки: коробка без первого админа → на /bootstrap. Вошедшего не
    // уводим (см. шапку); когда сессия отвалится, эффект отработает снова.
    useEffect(() => {
        if (!loaded || hasSession) return
        if (config.needsBootstrap && location.pathname !== BOOTSTRAP_PATH) {
            navigate(BOOTSTRAP_PATH, { replace: true })
        }
    }, [loaded, hasSession, config.needsBootstrap, location.pathname, navigate])

    if (!loaded) {
        return (
            <div
                className="flex flex-auto flex-col h-[100vh]"
                {...qaWithAlias('host.publicConfig.loader', 'host.publicConfig.loading')}
            >
                <Loading loading />
            </div>
        )
    }

    return <>{children}</>
}

export default PublicConfigGate
