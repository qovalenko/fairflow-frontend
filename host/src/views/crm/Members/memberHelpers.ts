import type { ProjectRole } from '@/services/CrmService'

/**
 * Shared member-management helpers for the standalone member screens
 * (`SCR-PRJSET-MEMBERS`, `SCR-PRJSET-MEMBER-INVITE`). Kept in sync with the
 * in-Settings `MembersTab` (Settings.tsx) so the two surfaces (D10 duplicate —
 * M-4 acceptance) present roles/errors identically.
 */

export const roleLabels: Record<string, { label: string; className: string }> = {
    owner: {
        label: 'Владелец',
        className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    },
    admin: {
        label: 'Админ',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    manager: {
        label: 'Менеджер',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    member: {
        label: 'Участник',
        className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    },
    viewer: {
        label: 'Наблюдатель',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
}

/** Roles assignable from the UI (owner is transferred, never picked here). */
export const assignableRoleOptions: { value: ProjectRole; label: string }[] = [
    { value: 'viewer', label: 'Наблюдатель' },
    { value: 'member', label: 'Участник' },
    { value: 'manager', label: 'Менеджер' },
    { value: 'admin', label: 'Админ' },
]

export const getInitials = (name: string): string =>
    name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type AxiosLikeError = {
    response?: {
        status?: number
        data?: { error?: { code?: string; message?: string; details?: { reason?: string } }; message?: string }
    }
}

/**
 * Map a member-mutation failure to a Russian message per the control contract
 * (§3.1): 409 LAST_OWNER / owned-records reassign (FR-MPRJ-4), 403 outside-org
 * (FR-MPRJ-2), 423 LOCKED on an archived/pending-deletion project (FR-MPRJ-22).
 * Falls back to the server message, then `fallback`.
 */
export function memberErrorMessage(err: unknown, fallback: string): string {
    const e = err as AxiosLikeError
    const status = e?.response?.status
    const code = e?.response?.data?.error?.code
    const serverMsg = e?.response?.data?.error?.message ?? e?.response?.data?.message

    if (
        status === 409 ||
        code === 'LAST_OWNER' ||
        code === 'OWNED_RECORDS' ||
        e?.response?.data?.error?.details?.reason === 'OWNED_RECORDS_CHECK_FAILED'
    ) {
        if (
            code === 'OWNED_RECORDS' ||
            e?.response?.data?.error?.details?.reason === 'OWNED_RECORDS'
        ) {
            return (
                serverMsg ??
                'У участника есть записи во владении. Переназначьте их на другого участника перед удалением.'
            )
        }
        if (e?.response?.data?.error?.details?.reason === 'OWNED_RECORDS_CHECK_FAILED') {
            return (
                serverMsg ??
                'Не удалось проверить записи участника. Удаление заблокировано, пока проверка недоступна.'
            )
        }
        return (
            serverMsg ??
            'Нельзя оставить проект без владельца. Сначала передайте права владельца другому участнику.'
        )
    }
    if (status === 403) {
        return serverMsg ?? 'Недостаточно прав либо пользователь вне организации проекта.'
    }
    if (status === 423) {
        return (
            serverMsg ??
            'Проект в архиве или помечен на удаление — изменения участников недоступны.'
        )
    }
    if (status === 404) {
        return serverMsg ?? 'Участник или проект не найдены.'
    }
    return serverMsg ?? fallback
}
