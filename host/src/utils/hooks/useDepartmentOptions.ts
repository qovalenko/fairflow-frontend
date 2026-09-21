import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { apiGetDepartments } from '@/services/CrmService'
import type { OrgDepartment } from '@/services/CrmService'

export type DepartmentOption = { value: string; label: string }

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

/**
 * W-6 — справочник подразделений Системы для селектов «Отдел» в карточках CRM
 * (контакт / компания / продукт).
 *
 * `GET /v1/system/departments` гейтится системной ролью (`@RequireSystemRole('member')`),
 * а не правом проекта: у участника проекта без членства в организации ручка
 * ответит 403. Поэтому ошибка здесь — НЕ ошибка экрана: справочник деградирует в
 * пустой список + флаг `unavailable`, чтобы форма показала честное «справочник
 * недоступен» вместо пустого селекта, который выглядит как «отделов нет».
 */
export default function useDepartmentOptions(enabled = true) {
    const { data, error, isLoading } = useSWR(
        enabled ? ['org/departments'] : null,
        () => apiGetDepartments(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const departments = useMemo(() => normalizeList<OrgDepartment>(data), [data])

    const options = useMemo<DepartmentOption[]>(
        () =>
            departments
                .filter((d) => d && d.id)
                .map((d) => ({ value: String(d.id), label: d.name || 'Отдел без названия' })),
        [departments],
    )

    const byId = useMemo(() => {
        const map = new Map<string, string>()
        for (const d of departments) {
            if (d?.id) map.set(String(d.id), d.name || 'Отдел без названия')
        }
        return map
    }, [departments])

    /** Название отдела по id; для неизвестного id — сам id (не прячем «чужой» отдел). */
    const departmentName = useCallback(
        (id?: string | null): string | undefined => (id ? (byId.get(id) ?? id) : undefined),
        [byId],
    )

    return { options, departmentName, isLoading, unavailable: Boolean(error) }
}
