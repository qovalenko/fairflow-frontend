import useSWR from 'swr'
import {
    apiGetSearchClientSettings,
    DEFAULT_SEARCH_SETTINGS,
    type SearchClientSettings,
} from '@/services/SearchService'

/**
 * TODO-492 (хвост) — единственный клиентский читатель настроек модуля «Поиск».
 *
 * Настройки (`minQueryChars`, `perTypeLimit`, `hotkeyEnabled`) сохранялись через
 * `SearchSettingsTab`, но на клиенте никто их не читал: и overlay в шапке
 * (`components/template/Search.tsx`), и экраны модуля были прибиты к
 * `DEFAULT_SEARCH_SETTINGS`. Ручка control под `project:manage` рядовому
 * участнику недоступна, поэтому источник — member-readable проекция gateway
 * `GET /api/search/settings` (гейт `search:read` — тот же, что у `/search/query`).
 *
 * Деградация всегда мягкая: пока ответа нет / проект не выбран / нет права /
 * control недоступен — отдаём дефолты модуля, а не блокируем поиск. Значения
 * gateway уже валидированы (`clampSetting`), но мусор из кэша/старого ответа
 * тоже не должен ронять порог в 0 — числа принимаем только положительные.
 */
function positive(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number.NaN
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * Ключ SWR клиентской проекции настроек.
 *
 * ВАЖНО: он намеренно НЕ совпадает с `['/search/settings', pid]`, под которым
 * `SearchSettingsTab` держит АДМИНСКОЕ чтение control-ручки
 * (`GET /projects/:id/modules/search/settings`). Ключи в SWR глобальны, и один
 * ключ на два разных фетчера с разными формами ответа означал бы, что вкладка
 * настроек и шапка перетирают данные друг друга.
 *
 * Экспортируется, чтобы вкладка настроек могла инвалидировать проекцию после
 * сохранения (иначе новый порог/хоткей доехали бы только после перезагрузки).
 */
export const searchClientSettingsKey = (projectId: string) =>
    ['/search/settings/client', projectId] as const

export interface UseSearchClientSettingsResult extends SearchClientSettings {
    /** Значения ещё не приехали — используются дефолты модуля. */
    isFallback: boolean
    /**
     * Вопрос «настройки уже известны?» закрыт: пришёл ответ, ручка ответила
     * ошибкой (работаем на дефолтах) или читать их незачем (нет проекта/права).
     * Экраны, которые шлют запрос сразу на монтировании (страница результатов
     * с `?q=` в URL), ждут этого флага, иначе успевают выстрелить с дефолтным
     * порогом 2 и показать пустой ответ там, где подсказка уже говорит «минимум
     * 5». Именно `settled`, а не `data`: недоступная ручка не должна навсегда
     * заблокировать поиск.
     */
    isSettled: boolean
}

export default function useSearchClientSettings(
    projectId?: string,
    /** UX-гейт вызывающего (обычно `can('search','read')`) — без него не ходим. */
    enabled = true,
): UseSearchClientSettingsResult {
    const enabledKey = Boolean(projectId && enabled)
    const { data, error } = useSWR(
        enabledKey ? searchClientSettingsKey(projectId as string) : null,
        ([, pid]) => apiGetSearchClientSettings(pid as string),
        {
            revalidateOnFocus: false,
            // Настройки меняет администратор, а не пользователь: ретраить и
            // перезапрашивать их на каждый фокус смысла нет, а 403/сбой control
            // не должен превращаться в шторм запросов из строки поиска.
            shouldRetryOnError: false,
            keepPreviousData: true,
        },
    )

    return {
        minQueryChars: positive(
            data?.minQueryChars,
            DEFAULT_SEARCH_SETTINGS.minQueryChars,
        ),
        perTypeLimit: positive(
            data?.perTypeLimit,
            DEFAULT_SEARCH_SETTINGS.perTypeLimit,
        ),
        hotkeyEnabled:
            typeof data?.hotkeyEnabled === 'boolean'
                ? data.hotkeyEnabled
                : DEFAULT_SEARCH_SETTINGS.hotkeyEnabled,
        indexableTypes: Array.isArray(data?.indexableTypes)
            ? data.indexableTypes
            : [],
        ...(data?.freshnessSlaMs ? { freshnessSlaMs: data.freshnessSlaMs } : {}),
        isFallback: !data,
        isSettled: !enabledKey || data !== undefined || error !== undefined,
    }
}
