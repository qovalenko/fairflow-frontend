import { useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import {
    PiArrowLeftDuotone,
    PiPlusDuotone,
    PiPencilDuotone,
    PiTrashDuotone,
    PiArrowsClockwiseDuotone,
    PiPlugsConnectedDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiListConnections,
    apiUpdateConnection,
    apiDeleteConnection,
    BREAKER_LABEL,
    BREAKER_COLOR,
    type Connection,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    FreshnessLabel,
    errMessage,
} from './shared'
import { qa } from './qa'

/** SCR-AUTOMATION-CONNECTIONS — каталог webhook-endpoint'ов (anti-SSRF). */
const Connections = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const canManage = can('automation', 'manage')

    const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)

    const swrKey = pid && canManage ? ['/automation/connections', pid] : null
    const { data, isLoading, error, isValidating } = useSWR(
        swrKey,
        () => apiListConnections({ projectId: pid! }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const list = data?.list ?? []
    const refresh = () =>
        mutate((key) => Array.isArray(key) && key[0] === '/automation/connections')

    const toggleEnabled = async (c: Connection) => {
        if (!pid) return
        setBusyId(c.id)
        try {
            await apiUpdateConnection(c.id, { enabled: !c.enabled }, { projectId: pid })
            refresh()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось обновить connection'))
        } finally {
            setBusyId(null)
        }
    }

    const resetBreaker = async (c: Connection) => {
        if (!pid) return
        setBusyId(c.id)
        try {
            await apiUpdateConnection(c.id, { resetBreaker: true }, { projectId: pid })
            toast.push('Breaker сброшен')
            refresh()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось сбросить breaker'))
        } finally {
            setBusyId(null)
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget || !pid) return
        setDeleting(true)
        try {
            await apiDeleteConnection(deleteTarget.id, { projectId: pid })
            toast.push('Connection удалён')
            setDeleteTarget(null)
            refresh()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить connection'))
        } finally {
            setDeleting(false)
        }
    }

    if (!pid) {
        return (
            <Container>
                <NoProjectState />
            </Container>
        )
    }
    // ST-10/11: connections — только manage (Admin+)
    if (!canManage) {
        return (
            <Container>
                <NoPermissionState message="Каталог connections доступен только с правом automation:manage." />
            </Container>
        )
    }

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} height={64} className="rounded-lg" />
                    ))}
                </div>
            )
        }
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить connections')}
                    onRetry={() => mutate(swrKey)}
                />
            )
        }
        if (list.length === 0) {
            return (
                <AdaptiveCard>
                    <div className="text-center py-12" {...qa('automation.connections.empty')}>
                        <PiPlugsConnectedDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 mb-4">
                            Нет одобренных connections.
                        </p>
                        <Button
                            variant="solid"
                            color="primary"
                            icon={<PiPlusDuotone />}
                            onClick={() => navigate('/automation/connections/new')}
                            {...qa('automation.connections.createFirst')}
                        >
                            Добавить connection
                        </Button>
                    </div>
                </AdaptiveCard>
            )
        }
        return (
            <div className="relative space-y-3">
                {isValidating && !isLoading && (
                    <div className="absolute right-2 -top-6 text-xs text-gray-400">
                        Обновление…
                    </div>
                )}
                {list.map((c) => (
                    <Card key={c.id} {...qa('automation.connections.card', { connection: c.id })}>
                        <div className="flex items-center gap-4 flex-wrap">
                            <Switcher
                                checked={c.enabled}
                                disabled={busyId === c.id}
                                onChange={() => toggleEnabled(c)}
                                {...qa('automation.connections.toggle', { connection: c.id })}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold">{c.name}</span>
                                    <Tag
                                        className={BREAKER_COLOR[c.breakerState]}
                                        {...qa('automation.connections.breakerTag', { connection: c.id })}
                                    >
                                        {BREAKER_LABEL[c.breakerState]}
                                    </Tag>
                                    {c.secretSet && (
                                        <Tag
                                            className="bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                            {...qa('automation.connections.secretSet', { connection: c.id })}
                                        >
                                            секрет задан
                                        </Tag>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 truncate mt-0.5">
                                    {c.url}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {/* EL-CONN-7: сброс breaker при open/half_open */}
                                {c.breakerState !== 'closed' && (
                                    <Tooltip title="Сбросить breaker">
                                        <button
                                            type="button"
                                            aria-label="Сбросить breaker"
                                            title="Сбросить breaker"
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            onClick={() => resetBreaker(c)}
                                            {...qa('automation.connections.resetBreaker', { connection: c.id })}
                                        >
                                            <PiArrowsClockwiseDuotone className="w-4 h-4" />
                                        </button>
                                    </Tooltip>
                                )}
                                <button
                                    type="button"
                                    aria-label="Редактировать connection"
                                    title="Редактировать"
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                    onClick={() =>
                                        navigate(
                                            `/automation/connections/${c.id}/edit`,
                                        )
                                    }
                                    {...qa('automation.connections.edit', { connection: c.id })}
                                >
                                    <PiPencilDuotone className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Удалить connection"
                                    title="Удалить"
                                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500"
                                    onClick={() => setDeleteTarget(c)}
                                    {...qa('automation.connections.delete', { connection: c.id })}
                                >
                                    <PiTrashDuotone className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="Назад"
                            title="Назад"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            onClick={() => navigate('/automation')}
                        >
                            <PiArrowLeftDuotone className="w-5 h-5" />
                        </button>
                        <h3 className="text-2xl font-bold" {...qa('automation.connections.title')}>
                            Подключения
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <FreshnessLabel />
                        <Button
                            variant="solid"
                            color="primary"
                            icon={<PiPlusDuotone />}
                            onClick={() => navigate('/automation/connections/new')}
                            {...qa('automation.connections.create')}
                        >
                            Добавить connection
                        </Button>
                    </div>
                </div>
                {renderBody()}
            </div>

            <Dialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
            >
                <div {...qa('automation.connections.deleteDialog')}>
                    <h5 className="mb-2">Удалить connection?</h5>
                    <p className="text-sm text-gray-500 mb-6">
                        «{deleteTarget?.name}» будет удалён. Если он используется
                        правилами, удаление будет отклонено.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="plain" onClick={() => setDeleteTarget(null)} {...qa('automation.connections.deleteCancel')}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="red"
                            loading={deleting}
                            onClick={confirmDelete}
                            {...qa('automation.connections.deleteConfirm')}
                        >
                            Удалить
                        </Button>
                    </div>
                </div>
            </Dialog>
        </Container>
    )
}

export default Connections
