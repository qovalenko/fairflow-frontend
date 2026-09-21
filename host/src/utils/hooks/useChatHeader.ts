import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import {
    apiChatMarkAllRead,
    apiGetChatConversations,
    apiGetChatUnreadCount,
    chatStreamUrl,
    isChatModuleDisabledError,
    type ConversationVM,
} from '@/services/ChatService'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import { useSessionUser } from '@/store/authStore'
import type { ProjectInfo } from '@/@types/auth'

/**
 * Источник данных дропдауна «Чаты» в шапке host (06-frontend-contract §2.1/§4.1).
 *
 * Зеркало `useNotifications`: один SWR-хук на host-shell, server-state +
 * realtime-инвалидация. Покрывает состояния: loading / empty / error /
 * no-permission / disabled-module + мультипроектную врезку (FR-CHAT-47/US-15).
 *
 * Истина доступа — backend-guard; FE-гейт здесь только UX (BR-SHELL-4).
 */

/** Непрочитанное по одному «другому» проекту (FR-CHAT-47, раздел дропдауна). */
export interface OtherProjectUnread {
    projectId: string
    projectName: string
    unread: number
}

export interface UseChatHeaderResult {
    /** Видим ли модуль (UX-гейт): включён в проекте + есть право чтения. */
    enabled: boolean
    /** Гейт по праву (usePermission('chat','read')). */
    canRead: boolean
    /** Гейт по enabledModules текущего проекта (Contextual UI). */
    moduleEnabled: boolean

    /** Беседы текущего проекта (DM/группы/каналы), сорт. lastMessageAt desc. */
    conversations: ConversationVM[]
    /** Счётчик непрочитанных текущего проекта (бейдж шапки). */
    unreadCount: number
    /** Непрочитанное по другим проектам (разворачиваемый раздел, FR-CHAT-47). */
    otherProjects: OtherProjectUnread[]

    isLoading: boolean
    /** Ошибка загрузки (кроме CHAT_MODULE_DISABLED). */
    error: unknown
    /** Модуль выключен на бэке (409 CHAT_MODULE_DISABLED). */
    moduleDisabled: boolean

    /** Ручной refetch (ошибка «Повторить» / realtime badge). */
    refresh: () => void
    /** Отметить всё прочитанным в текущем проекте (optimistic, FR-CHAT-19). */
    markAllRead: () => Promise<void>
}

export interface UseChatHeaderOptions {
    /** Включить агрегацию непрочитанного по другим проектам (FR-CHAT-47). */
    includeOtherProjects?: boolean
    /**
     * Подписаться на realtime-поток (WS `/ws/chat`, SSE `/api/v1/chat/stream`
     * fallback) для инвалидации бейджа (FR-CHAT-22/25/40). Дропдаун шапки — да.
     */
    subscribe?: boolean
}

export default function useChatHeader(
    options: UseChatHeaderOptions = {},
): UseChatHeaderResult {
    const { includeOtherProjects = true, subscribe = false } = options

    const projectId = useResolvedProjectId()
    const currentProject = useProjectStore((s) => s.currentProject)
    const userProjectsRaw = useSessionUser((s) => s.user.projects)
    const userProjects = useMemo(() => userProjectsRaw ?? [], [userProjectsRaw])
    const canRead = usePermission('chat', 'read')
    const moduleEnabled = useMemo(
        () => getEnabledModules(currentProject).includes('chat'),
        [currentProject],
    )
    const enabled = canRead && moduleEnabled && Boolean(projectId)

    // ── Беседы текущего проекта (FR-CHAT-1) ──────────────────────────────────
    const listKey = enabled ? ['chat/conversations', projectId] : null
    const {
        data: listData,
        error: listError,
        isLoading: listLoading,
        mutate: mutateList,
    } = useSWR(
        listKey,
        () => apiGetChatConversations({ projectId: projectId! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const otherProjectIds = useMemo(() => {
        if (!includeOtherProjects || !canRead) return [] as ProjectInfo[]
        return userProjects.filter(
            (p) =>
                p.id !== projectId &&
                getEnabledModules({
                    id: p.id,
                    name: p.name,
                    enabledModules: p.enabledModules ?? [],
                    moduleConfigs: p.moduleConfigs,
                    modulePolicies: p.modulePolicies,
                    effectiveModules: p.effectiveModules,
                }).includes('chat'),
        )
    }, [includeOtherProjects, canRead, userProjects, projectId])

    // ── Счётчик непрочитанных (FR-CHAT-20 / FR-CHAT-47) ───────────────────────
    // Один запрос scopeFilter=all + byProject вместо N+1 по другим проектам.
    const needsCrossProject = includeOtherProjects && otherProjectIds.length > 0
    const countKey = enabled
        ? ['chat/unread-count', projectId, needsCrossProject ? 'all' : 'current']
        : null
    const {
        data: countData,
        error: countError,
        mutate: mutateCount,
    } = useSWR(
        countKey,
        () =>
            apiGetChatUnreadCount({
                projectId: projectId!,
                scopeFilter: needsCrossProject ? 'all' : 'current',
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const conversations = useMemo(() => {
        const list = listData?.conversations ?? []
        return [...list].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    }, [listData])

    const unreadCount = useMemo(() => {
        if (needsCrossProject && countData) {
            // scopeFilter=all: `count` — сумма по ВСЕМ проектам. Бейдж текущего
            // проекта берём только из byProject; нет строки → 0 (не глобальный итог).
            const row = countData.byProject?.find((p) => p.projectId === projectId)
            return row?.count ?? 0
        }
        return (
            countData?.count ??
            conversations.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0)
        )
    }, [needsCrossProject, countData, projectId, conversations])

    const otherProjects = useMemo((): OtherProjectUnread[] => {
        if (!needsCrossProject || !countData?.byProject?.length) return []
        const nameById = new Map(otherProjectIds.map((p) => [p.id, p.name]))
        return countData.byProject
            .filter(
                (p) =>
                    p.projectId !== projectId &&
                    (p.count ?? 0) > 0 &&
                    nameById.has(p.projectId),
            )
            .map((p) => ({
                projectId: p.projectId,
                projectName: nameById.get(p.projectId) ?? p.projectId,
                unread: p.count ?? 0,
            }))
    }, [needsCrossProject, countData, projectId, otherProjectIds])

    // CHAT_MODULE_DISABLED → раздел недоступен, не ошибка.
    const rawError = listError ?? countError
    const moduleDisabled = isChatModuleDisabledError(rawError)
    const error = moduleDisabled ? null : rawError

    const refresh = useCallback(() => {
        mutateList()
        mutateCount()
    }, [mutateList, mutateCount])

    // ── markAllRead (FR-CHAT-19; optimistic) ─────────────────────────────────
    const markAllRead = useCallback(async () => {
        if (!projectId) return
        const prevList = listData
        const prevCount = countData
        // read-all действует только на текущий проект — в optimistic-состоянии
        // зануляем его строку byProject, не стирая счётчики других проектов.
        await mutateCount(
            prevCount
                ? {
                      ...prevCount,
                      count: 0,
                      ...(prevCount.byProject
                          ? {
                                byProject: prevCount.byProject.map((p) =>
                                    p.projectId === projectId
                                        ? { ...p, count: 0 }
                                        : p,
                                ),
                            }
                          : {}),
                  }
                : { count: 0 },
            false,
        )
        await mutateList(
            prevList
                ? {
                      ...prevList,
                      conversations: prevList.conversations.map((c) => ({
                          ...c,
                          unreadCount: 0,
                      })),
                  }
                : prevList,
            false,
        )
        try {
            await apiChatMarkAllRead({ projectId })
            refresh()
        } catch (e) {
            await mutateList(prevList, false)
            await mutateCount(prevCount, false)
            throw e
        }
    }, [projectId, listData, countData, mutateList, mutateCount, refresh])

    // ── Realtime badge (FR-CHAT-22/25/40) ────────────────────────────────────
    // WS — основной транспорт полноэкранного клиента (chatRealtimeClient в
    // remote); шапке достаточно SSE-fallback на badge-кадры для инвалидации.
    useEffect(() => {
        if (!enabled || !subscribe || !projectId) return
        let es: EventSource | null = null
        try {
            es = new EventSource(chatStreamUrl({ projectId }))
            const onBadge = () => refresh()
            es.addEventListener('badge', onBadge)
            es.addEventListener('message', onBadge)
        } catch {
            /* нет SSE — бейдж обновится при следующем revalidate */
        }
        return () => es?.close()
    }, [enabled, subscribe, projectId, refresh])

    return {
        enabled,
        canRead,
        moduleEnabled,
        conversations,
        unreadCount,
        otherProjects,
        isLoading: enabled ? listLoading && !listData : false,
        error,
        moduleDisabled,
        refresh,
        markAllRead,
    }
}
