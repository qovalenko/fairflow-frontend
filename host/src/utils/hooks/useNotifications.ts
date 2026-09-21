import { useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import type { AxiosError } from 'axios'
import {
    apiGetNotificationCount,
    apiGetNotificationList,
    apiMarkAllNotificationsRead,
    apiMarkNotificationRead,
    notificationStreamUrl,
    type NotificationItem,
} from '@/services/NotificationService'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'

/**
 * Единый источник данных центра уведомлений (FR-MNOT-1/8/9/27).
 *
 * Один хук на host (мемоизируется через SWR-ключи) — переиспользуется
 * SCR-NOTIFY-BELL, SCR-NOTIFY-LIST и SCR-NOTIFY-TOAST. Покрывает состояния
 * каталога: ST-1 loading, ST-3 empty, ST-6 error, ST-7/29 optimistic+откат,
 * ST-12/17 гейтинг (модуль/право), ST-27 offline (SSE→polling fallback).
 *
 * Истина доступа — backend-guard; FE-гейт здесь только UX (BR-SHELL-4).
 */

/** Извлекает код ошибки из axios-ответа (контракт error.code, §3.1). */
export function notificationErrorCode(err: unknown): string | undefined {
    const ax = err as AxiosError<{ error?: { code?: string } }> | undefined
    return ax?.response?.data?.error?.code
}

/** 403 MODULE_DISABLED — это не ошибка ленты, а ST-17 (раздел недоступен). */
export function isModuleDisabledError(err: unknown): boolean {
    return notificationErrorCode(err) === 'MODULE_DISABLED'
}

export interface UseNotificationsResult {
    /** Видим ли модуль (UX-гейт): включён в проекте + есть право чтения. */
    enabled: boolean
    /** Гейт по праву (usePermission('notifications','read')). */
    canRead: boolean
    /** Гейт по enabledModules проекта (Contextual UI). */
    moduleEnabled: boolean

    /** Лента (FE-форма). */
    list: NotificationItem[]
    total: number
    /** Счётчик непрочитанных (ST-3 → 0 → бейдж скрыт). */
    unreadCount: number

    isLoading: boolean
    /** Ошибка загрузки (ST-6), кроме MODULE_DISABLED. */
    error: unknown
    /** ST-17: модуль выключен на бэке. */
    moduleDisabled: boolean
    /** ST-27: SSE недоступен → деградация на polling. */
    offline: boolean

    /** Ручной refetch (ST-6 «Повторить» / ST-27 refresh). */
    refresh: () => void
    /** Отметить одно прочитанным (optimistic, ST-29; откат при ошибке ST-7). */
    markRead: (id: string) => Promise<void>
    /** Отметить все (FR-MNOT-8; optimistic). */
    markAllRead: () => Promise<void>
}

export interface UseNotificationsOptions {
    /** Лимит ленты (колокольчик — последние N; страница — page_size). */
    pageSize?: number
    /** Только непрочитанные (фильтр SCR-NOTIFY-LIST). */
    unreadOnly?: boolean
    /** scope=all агрегирует проекты (FR-MNOT-22, Should). */
    scope?: 'current' | 'all'
    /** Подписаться на SSE-поток (колокольчик/toast); страница — polling. */
    subscribe?: boolean
}

export default function useNotifications(
    options: UseNotificationsOptions = {},
): UseNotificationsResult {
    const { pageSize = 25, unreadOnly = false, scope, subscribe = false } = options

    const projectId = useResolvedProjectId()
    const currentProject = useProjectStore((s) => s.currentProject)
    const canRead = usePermission('notifications', 'read')
    const moduleEnabled = useMemo(
        () => getEnabledModules(currentProject).includes('notifications'),
        [currentProject],
    )
    const enabled = canRead && moduleEnabled && Boolean(projectId)

    // ── Count (бейдж колокольчика + сайдбар-проекция EL-BELL-11) ──────────────
    const countKey = enabled ? ['notification/count', projectId, scope] : null
    const {
        data: countData,
        error: countError,
        mutate: mutateCount,
    } = useSWR(
        countKey,
        () => apiGetNotificationCount({ projectId: projectId!, unreadOnly: true, scope }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // ── List (лента) ──────────────────────────────────────────────────────────
    const listKey = enabled
        ? ['notification/list', projectId, pageSize, unreadOnly, scope]
        : null
    const {
        data: listData,
        error: listError,
        isLoading: listLoading,
        mutate: mutateList,
    } = useSWR(
        listKey,
        () =>
            apiGetNotificationList({
                projectId: projectId!,
                pageSize,
                unreadOnly,
                scope,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const list = listData?.list ?? []
    const total = listData?.total ?? list.length
    const unreadCount =
        countData?.count ?? list.filter((n) => !n.readed).length

    // MODULE_DISABLED → ST-17, не ST-6.
    const rawError = listError ?? countError
    const moduleDisabled = isModuleDisabledError(rawError)
    const error = moduleDisabled ? null : rawError

    const refresh = useCallback(() => {
        mutateList()
        mutateCount()
    }, [mutateList, mutateCount])

    // ── markRead (ST-29 optimistic + откат ST-7) ────────────────────────────
    const markRead = useCallback(
        async (id: string) => {
            if (!projectId) return
            const prev = listData
            // optimistic
            await mutateList(
                prev
                    ? {
                          ...prev,
                          list: prev.list.map((n) =>
                              n.id === id ? { ...n, readed: true, status: 'read' as const } : n,
                          ),
                      }
                    : prev,
                false,
            )
            await mutateCount(
                countData ? { count: Math.max(0, (countData.count ?? 1) - 1) } : countData,
                false,
            )
            try {
                await apiMarkNotificationRead({ id, projectId })
                refresh()
            } catch (e) {
                // откат
                await mutateList(prev, false)
                await mutateCount(countData, false)
                throw e
            }
        },
        [projectId, listData, countData, mutateList, mutateCount, refresh],
    )

    // ── markAllRead (FR-MNOT-8; optimistic) ─────────────────────────────────
    const markAllRead = useCallback(async () => {
        if (!projectId) return
        const prev = listData
        const prevCount = countData
        await mutateList(
            prev
                ? { ...prev, list: prev.list.map((n) => ({ ...n, readed: true, status: 'read' as const })) }
                : prev,
            false,
        )
        await mutateCount({ count: 0 }, false)
        try {
            await apiMarkAllNotificationsRead({ projectId, scope })
            refresh()
        } catch (e) {
            await mutateList(prev, false)
            await mutateCount(prevCount, false)
            throw e
        }
    }, [projectId, scope, listData, countData, mutateList, mutateCount, refresh])

    // ── SSE (FR-MNOT-9) + ST-27 polling fallback ────────────────────────────
    const offlineRef = useRef(false)
    useEffect(() => {
        if (!enabled || !subscribe) return
        let es: EventSource | null = null
        let pollTimer: ReturnType<typeof setInterval> | null = null

        const startPolling = () => {
            offlineRef.current = true
            // ST-27: деградация — поллинг count ≤ 30с (NFR-MNOT-2).
            pollTimer = setInterval(() => {
                mutateCount()
            }, 30000)
        }

        try {
            es = new EventSource(notificationStreamUrl({ projectId: projectId!, scope }), { withCredentials: true })
            es.addEventListener('badge', () => {
                offlineRef.current = false
                // ST-2: фоновое обновление поверх показанных данных.
                refresh()
            })
            es.onerror = () => {
                // Разрыв SSE → polling-деградация (но EventSource сам ретраит).
                if (!pollTimer) startPolling()
            }
        } catch {
            startPolling()
        }

        return () => {
            es?.close()
            if (pollTimer) clearInterval(pollTimer)
        }
    }, [enabled, subscribe, projectId, scope, refresh, mutateCount])

    return {
        enabled,
        canRead,
        moduleEnabled,
        list,
        total,
        unreadCount,
        isLoading: enabled ? listLoading && !listData : false,
        error,
        moduleDisabled,
        offline: offlineRef.current,
        refresh,
        markRead,
        markAllRead,
    }
}
