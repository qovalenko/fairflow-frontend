import useSWR from 'swr'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import {
    apiBatchRecordCan,
    type RecordCanCheck,
    type RecordCanResult,
} from '@/services/PermissionService'

/**
 * API-3 reserve path: batch record-dependent permission checks when `can.*`
 * flags are not embedded in the cached record (FR-SHELL-130).
 */
export default function useRecordCan(checks: RecordCanCheck[]) {
    const projectId = useResolvedProjectId()
    const key =
        projectId && checks.length > 0
            ? ['record-can', projectId, JSON.stringify(checks)]
            : null

    const { data, error, isLoading } = useSWR(
        key,
        () => apiBatchRecordCan(projectId!, checks),
        { revalidateOnFocus: false },
    )

    const results: RecordCanResult[] = data?.results ?? []

    const allow = (subject: string, action: string, recordId?: string) => {
        const hit = results.find(
            (r) =>
                r.subject === subject &&
                r.action === action &&
                (recordId
                    ? r.recordRef?.recordId === recordId
                    : !r.recordRef?.recordId),
        )
        return hit?.allow ?? false
    }

    return { results, allow, isLoading, error }
}
