import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import classNames from 'classnames'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import Dropdown from '@/components/ui/Dropdown'
import ScrollBar from '@/components/ui/ScrollBar'
import Badge from '@/components/ui/Badge'
import Avatar from '@/components/ui/Avatar'
import Segment from '@/components/ui/Segment'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import useResponsive from '@/utils/hooks/useResponsive'
import useChatHeader from '@/utils/hooks/useChatHeader'
import { useProjectStore } from '@/store/projectStore'
import { useSessionUser } from '@/store/authStore'
import type { ConversationVM } from '@/services/ChatService'
import {
    PiChatCircleDuotone,
    PiArrowRightDuotone,
    PiChatCircleDotsDuotone,
    PiUserCircleDuotone,
    PiUsersDuotone,
    PiCaretDownDuotone,
    PiCaretRightDuotone,
} from 'react-icons/pi'
import dayjs from 'dayjs'
import { qa } from '@/shared/qa'

/**
 * Дропдаун «Чаты» в шапке host-shell (БП-13/FR-CHAT-42).
 *
 * Подключён к реальным данным gateway-BFF (`/api/v1/chat/...`) через
 * `useChatHeader` (06-frontend-contract §2.1/§4.1). Демо-данные Ecme
 * (статические беседы/сообщения) удалены полностью (FR-CHAT-46).
 *
 * Внешний enablement-гейт (`enabledModules.includes('chat')`) остаётся в
 * layout-файлах; внутренний гейт по праву `chat:read` — здесь (через хук).
 * Длинная переписка ведётся в полноэкранном чате (remote, route `/chat`):
 * клик по беседе → `/chat/{id}`.
 */

/** Сегмент дропдауна: личные/группы (DM/group) vs каналы проекта. */
type ChatSegment = 'dm_group' | 'project_channel'

/** Высота под 4 беседы (~72px), макс 288px. */
const CHAT_ITEM_HEIGHT = 72
const MAX_VISIBLE_CHATS = 4
const chatListMaxHeight = CHAT_ITEM_HEIGHT * MAX_VISIBLE_CHATS

function initials(title: string): string {
    return title
        .split(' ')
        .map((n) => n[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase()
}

function segmentOf(c: ConversationVM): ChatSegment {
    return c.type === 'project_channel' ? 'project_channel' : 'dm_group'
}

const _ChatDropdown = ({ className }: { className?: string }) => {
    const navigate = useNavigate()
    const { larger } = useResponsive()
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
    const userProjects = useSessionUser((s) => s.user.projects) ?? []

    const {
        enabled,
        conversations,
        unreadCount,
        otherProjects,
        isLoading,
        error,
        markAllRead,
        refresh,
    } = useChatHeader({ subscribe: true })

    const [segment, setSegment] = useState<ChatSegment>('dm_group')
    const [othersOpen, setOthersOpen] = useState(false)

    const filtered = useMemo(
        () => conversations.filter((c) => segmentOf(c) === segment),
        [conversations, segment],
    )

    const otherProjectsTotal = useMemo(
        () => otherProjects.reduce((acc, p) => acc + p.unread, 0),
        [otherProjects],
    )

    // Внутренний гейт по праву (chat:read) — если нет доступа, контент не рендерим
    // (внешний enablement-гейт остаётся в layout). Бейдж тогда тоже скрыт.
    if (!enabled) {
        return (
            <div className={classNames('text-2xl', className)} {...qa('host.chat.trigger')}>
                <PiChatCircleDuotone />
            </div>
        )
    }

    const openConversation = (c: ConversationVM) => {
        navigate(`/chat/${c.id}`)
    }

    const openOtherProject = (projectId: string) => {
        const p = userProjects.find((x) => x.id === projectId)
        if (p) {
            setCurrentProject({
                id: p.id,
                name: p.name,
                enabledModules: p.enabledModules ?? [],
                moduleConfigs: p.moduleConfigs ?? [],
                modulePolicies: p.modulePolicies ?? [],
                effectiveModules: p.effectiveModules,
            })
        }
        navigate('/chat')
    }

    const handleMarkAllAsRead = () => {
        void markAllRead().catch(() => refresh())
    }

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="flex items-center justify-center py-10">
                    <Spinner size={28} />
                </div>
            )
        }
        if (error) {
            return (
                <div className="py-8 px-4 text-center">
                    <div className="text-sm text-gray-500 mb-3">
                        Не удалось загрузить чаты
                    </div>
                    <Button size="sm" variant="default" onClick={refresh}>
                        Повторить
                    </Button>
                </div>
            )
        }
        if (filtered.length === 0) {
            return (
                <div className="py-8 text-center text-gray-500 text-sm">
                    {segment === 'project_channel'
                        ? 'Нет каналов'
                        : 'Нет бесед'}
                </div>
            )
        }
        return filtered.map((c) => (
            <div
                key={c.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                role="button"
                tabIndex={0}
                onClick={() => openConversation(c)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openConversation(c)
                    }
                }}
            >
                <div className="flex-shrink-0">
                    <Avatar
                        size="md"
                        src={c.avatarUrl}
                        className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                    >
                        {c.avatarUrl ? undefined : initials(c.title)}
                    </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold heading-text truncate">
                            {c.title}
                        </span>
                        {c.lastMessageAt > 0 && (
                            <span className="text-xs text-gray-500 flex-shrink-0">
                                {dayjs.unix(c.lastMessageAt).format('HH:mm')}
                            </span>
                        )}
                    </div>
                    <div className="truncate text-sm text-gray-500">
                        {c.lastMessage?.text ?? 'Нет сообщений'}
                    </div>
                </div>
                {c.unreadCount > 0 && (
                    <Badge
                        content={c.unreadCount}
                        className="flex-shrink-0 flex items-center justify-center"
                        innerClass="bg-primary text-white text-[10px] min-w-5 h-5 flex items-center justify-center"
                    />
                )}
            </div>
        ))
    }

    const renderOtherProjects = () => {
        if (otherProjects.length === 0) return null
        return (
            <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-2">
                <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setOthersOpen((v) => !v)}
                >
                    <span className="flex items-center gap-2">
                        {othersOpen ? (
                            <PiCaretDownDuotone />
                        ) : (
                            <PiCaretRightDuotone />
                        )}
                        Другие проекты
                    </span>
                    {otherProjectsTotal > 0 && (
                        <Badge
                            content={otherProjectsTotal}
                            innerClass="bg-primary text-white text-[10px] min-w-5 h-5 flex items-center justify-center"
                        />
                    )}
                </button>
                {othersOpen &&
                    otherProjects.map((p) => (
                        <button
                            key={p.projectId}
                            type="button"
                            className="w-full flex items-center justify-between px-5 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            onClick={() => openOtherProject(p.projectId)}
                        >
                            <span className="truncate">{p.projectName}</span>
                            {p.unread > 0 && (
                                <Badge
                                    content={p.unread}
                                    innerClass="bg-primary text-white text-[10px] min-w-5 h-5 flex items-center justify-center"
                                />
                            )}
                        </button>
                    ))}
            </div>
        )
    }

    return (
        <Dropdown
            renderTitle={
                <div className={classNames('text-2xl', className)} {...qa('host.chat.trigger')}>
                    {unreadCount > 0 ? (
                        <Badge
                            badgeStyle={{ top: '2px', right: '4px' }}
                            content={unreadCount}
                            innerClass="bg-primary text-white text-[10px] min-w-4 h-4 px-1 py-0 flex items-center justify-center"
                        >
                            <PiChatCircleDuotone />
                        </Badge>
                    ) : (
                        <PiChatCircleDuotone />
                    )}
                </div>
            }
            menuClass="min-w-[300px] md:min-w-[360px] p-0"
            placement={larger.md ? 'bottom-end' : 'bottom'}
        >
            <Dropdown.Item variant="header">
                <div className="dark:border-gray-700 px-4 pt-4 flex items-center justify-between mb-2">
                    <h6>Чаты</h6>
                    <Button
                        variant="plain"
                        shape="circle"
                        size="sm"
                        icon={<PiChatCircleDotsDuotone className="text-xl" />}
                        title="Прочитать все сообщения"
                        onClick={handleMarkAllAsRead}
                    />
                </div>
                <div className="px-4 pb-2">
                    <Segment
                        className="w-full"
                        value={segment}
                        size="sm"
                        onChange={(val) => setSegment(val as ChatSegment)}
                    >
                        <Segment.Item className="flex-1" value="dm_group">
                            <div className="flex items-center justify-center gap-2">
                                <PiUserCircleDuotone className="text-lg" />
                                <span>Личные</span>
                            </div>
                        </Segment.Item>
                        <Segment.Item className="flex-1" value="project_channel">
                            <div className="flex items-center justify-center gap-2">
                                <PiUsersDuotone className="text-lg" />
                                <span>Каналы</span>
                            </div>
                        </Segment.Item>
                    </Segment>
                </div>
            </Dropdown.Item>
            <ScrollBar
                className="overflow-y-auto min-h-0"
                style={{ maxHeight: `${chatListMaxHeight}px` }}
            >
                <div className="flex flex-col gap-0 px-2 pb-2">{renderBody()}</div>
            </ScrollBar>
            {renderOtherProjects()}
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                <button
                    type="button"
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-primary hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => navigate('/chat')}
                >
                    Открыть чат
                    <PiArrowRightDuotone className="w-4 h-4" />
                </button>
            </div>
        </Dropdown>
    )
}

const ChatDropdown = withHeaderItem(_ChatDropdown)

export default ChatDropdown
