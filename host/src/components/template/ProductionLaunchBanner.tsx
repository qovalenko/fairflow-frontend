import { PiRocketLaunchDuotone } from 'react-icons/pi'
import appConfig from '@/configs/app.config'

/**
 * Глобальный баннер «идёт подготовка к продакшн-запуску» — kernel-UI host-shell
 * над контентом всех экранов. Показывается ТОЛЬКО когда включён режим
 * `appConfig.productionLaunch` (env `VITE_PRODUCTION_LAUNCH=true`, app.example.com).
 *
 * Self-gated: вне launch-режима рендерит null и ничего не
 * добавляет в разметку. Текст можно переопределить через
 * `VITE_PRODUCTION_LAUNCH_MESSAGE`.
 */
const DEFAULT_TITLE = 'Идёт подготовка к запуску'
const DEFAULT_MESSAGE =
    'Fairflow CRM ещё не выпущена в продакшн — сейчас открыта предварительная (preview) версия для ознакомления. Часть возможностей может быть ограничена или временно недоступна, данные демонстрационные. Спасибо, что вы с нами на старте!'

const ProductionLaunchBanner = () => {
    if (!appConfig.productionLaunch) return null

    const message = appConfig.productionLaunchMessage || DEFAULT_MESSAGE

    return (
        <div
            className="flex items-start gap-3 px-4 py-3 border-b bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800/40"
            role="status"
            aria-live="polite"
        >
            <PiRocketLaunchDuotone className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{DEFAULT_TITLE}. </span>
                <span className="text-sm">{message}</span>
            </div>
        </div>
    )
}

export default ProductionLaunchBanner
