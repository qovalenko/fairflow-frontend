import { useCallback, useMemo } from 'react'
import { matchPath, useLocation, useNavigate, useSearchParams } from 'react-router'
import useSWR from 'swr'
import { useSessionUser } from '@/store/authStore'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { apiListProjectMembers } from './chatService'
import ChatLayout from './ChatLayout'

/**
 * Главный expose модуля «Чат» (remoteChat/ChatModule).
 * Внутренний роутинг: /chat и /chat/:conversationId (+ ?seq= deep-link FR-CHAT-44/US-17).
 * Один host-route с дочерним сегментом — разбор здесь (06-frontend-contract §2.2).
 */
const CONV_PATTERNS = ['/chat/:conversationId', '/p/:pid/chat/:conversationId']

function extractConversationId(pathname: string): string | undefined {
    for (const pattern of CONV_PATTERNS) {
        const matched = matchPath({ path: pattern, end: true }, pathname)
        if (matched?.params?.conversationId) return matched.params.conversationId
    }
    return undefined
}

function basePathFor(pathname: string): string {
    const m = matchPath({ path: '/p/:pid/chat/*', end: false }, pathname)
    if (m?.params?.pid) return `/p/${m.params.pid}/chat`
    return '/chat'
}

const ChatModule = () => {
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const user = useSessionUser((s) => s.user)

    const conversationId = useMemo(() => extractConversationId(pathname), [pathname])
    const basePath = useMemo(() => basePathFor(pathname), [pathname])
    const anchorSeq = useMemo(() => {
        const raw = searchParams.get('seq')
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) ? n : undefined
    }, [searchParams])

    const currentUserId = user.userId ?? ''
    const projectId = useResolvedProjectId()

    // Резолв userId→имя через участников проекта (control /projects/:id/members,
    // доступно любому участнику). Без него подписи отправителей и заголовки DM
    // показывали сырой userId. Кэшируем на проект.
    const { data: members } = useSWR(
        projectId ? (['chat/project-members', projectId] as const) : null,
        () => apiListProjectMembers(projectId),
        { revalidateOnFocus: false },
    )
    const nameById = useMemo(() => {
        const m = new Map<string, string>()
        for (const x of members ?? []) if (x.id) m.set(x.id, x.name)
        return m
    }, [members])
    const resolveName = useCallback(
        (userId: string): string => {
            if (userId === currentUserId)
                return user.userName || user.name || nameById.get(userId) || userId
            return nameById.get(userId) || userId
        },
        [currentUserId, user.userName, user.name, nameById],
    )

    const selectConversation = useCallback(
        (id: string) => {
            navigate(`${basePath}/${id}`)
        },
        [navigate, basePath],
    )

    // Выход из беседы (FR-CHAT-6): сброс активной беседы → возврат к списку.
    const leaveConversation = useCallback(() => {
        navigate(basePath)
    }, [navigate, basePath])

    return (
        <ChatLayout
            currentUserId={currentUserId}
            activeConversationId={conversationId}
            anchorSeq={anchorSeq}
            onSelectConversation={selectConversation}
            onLeaveConversation={leaveConversation}
            resolveName={resolveName}
        />
    )
}

export default ChatModule
