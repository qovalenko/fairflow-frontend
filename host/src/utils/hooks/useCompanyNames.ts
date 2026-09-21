import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { apiGetCompanies } from '@/services/CrmService'
import type { Company } from '@/@types/crm'

/**
 * T-010 — резолв companyId → название компании (переиспользуемый).
 *
 * Многие ответы бэкенда по связанным сущностям отдают только `companyId`
 * (карточка контакта) или `companyName: ""` (список продаж), поэтому в UI
 * вместо названия компании — прочерк. Хук один раз тянет справочник компаний
 * проекта (SWR-кэш по projectId) и отдаёт map id → name.
 *
 * NB: тянем единым запросом (pageSize 1000) как остальные CRM-виджеты
 * (deals/activities). Для орг с >1000 компаний нужен точечный batch-резолв —
 * зафиксировано как BE-пробел (нет endpoint `companies:resolve`).
 */
export default function useCompanyNames(projectId?: string) {
    const { data, isLoading } = useSWR(
        projectId ? ['company-name-map', projectId] : null,
        () =>
            apiGetCompanies<{ list: Company[]; total: number }, { projectId: string; pageSize: number }>(
                { projectId: projectId!, pageSize: 1000 },
            ),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const byId = useMemo(() => {
        const map = new Map<string, string>()
        for (const c of data?.list ?? []) {
            if (c?.id && c?.name) map.set(c.id, c.name)
        }
        return map
    }, [data])

    const companyName = useCallback(
        (id?: string | null): string | undefined => (id ? byId.get(id) : undefined),
        [byId],
    )

    return { isLoading, companyName }
}
