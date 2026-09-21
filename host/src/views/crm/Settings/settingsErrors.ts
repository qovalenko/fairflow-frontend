/**
 * Разбор ошибок сохранения настроек проекта в человекочитаемый текст.
 *
 * Вынесено из Settings.tsx (шаг разбора монолита, TODO-453/516): чистые функции
 * без React, тестируются напрямую и не тянут за собой вкладки.
 */

/**
 * TODO-242: человекочитаемая причина отказа при сохранении состава модулей.
 * Разбираем коды, которые реально отдают gateway/control по этой ручке:
 *  - 403 PERMISSION_DENIED — нет `project:manage`;
 *  - 403/409 MODULE_DISABLED / DEPENDENTS_ENABLED — модуль нельзя выключить, пока
 *    включены зависимые (control возвращает их список в `details.dependents`);
 *  - остальное — общий текст, чтобы тумблер не «молчал».
 */
export const moduleSaveErrorMessage = (e: unknown): string => {
    const resp = (e as { response?: { status?: number; data?: unknown } })?.response
    const data = (resp?.data ?? {}) as {
        code?: string
        message?: string
        details?: { dependents?: unknown }
    }
    const code = typeof data.code === 'string' ? data.code : ''
    const dependents = Array.isArray(data.details?.dependents)
        ? (data.details?.dependents as unknown[]).filter(
              (d): d is string => typeof d === 'string',
          )
        : []

    if (code === 'DEPENDENTS_ENABLED' || dependents.length > 0) {
        return dependents.length > 0
            ? `Модуль нельзя выключить: от него зависят включённые модули — ${dependents.join(', ')}`
            : 'Модуль нельзя выключить: от него зависят другие включённые модули'
    }
    if (code === 'MODULE_DISABLED') {
        return 'Модуль недоступен в этом проекте'
    }
    if (code === 'PERMISSION_DENIED' || resp?.status === 403) {
        return 'Недостаточно прав для изменения состава модулей проекта'
    }
    if (typeof data.message === 'string' && data.message) {
        return `Не удалось сохранить состав модулей: ${data.message}`
    }
    return 'Не удалось сохранить состав модулей'
}

/** TODO-452: причина отказа при сохранении охвата записей (visibilityConfig). */
export const accessSaveErrorMessage = (e: unknown): string => {
    const resp = (e as { response?: { status?: number; data?: unknown } })?.response
    const data = (resp?.data ?? {}) as { code?: string; message?: string }
    if (data.code === 'PERMISSION_DENIED' || resp?.status === 403) {
        return 'Недостаточно прав для изменения охвата записей (нужно project:manage)'
    }
    if (typeof data.message === 'string' && data.message) {
        return `Не удалось сохранить охват: ${data.message}`
    }
    return 'Не удалось сохранить охват'
}
