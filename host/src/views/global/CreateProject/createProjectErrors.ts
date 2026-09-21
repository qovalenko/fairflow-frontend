import { normalizeApiError } from '@/utils/apiError'

/** FR-PROJ-400: human-readable denial when control rejects project creation. */
export function resolveCreateProjectSubmitError(error: unknown): string {
    const normalized = normalizeApiError(
        error,
        'Не удалось создать проект. Попробуйте ещё раз.',
    )
    if (normalized.code === 'PERMISSION_DENIED') {
        return 'Создание проектов доступно только владельцу или администратору системы.'
    }
    return normalized.message
}
