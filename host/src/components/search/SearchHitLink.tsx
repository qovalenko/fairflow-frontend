import { useState, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    probeSearchHitAvailability,
    SEARCH_HIT_UNAVAILABLE_MSG,
    type SearchEntityType,
} from '@/services/SearchService'
import { qa } from '@/shared/qa'

type SearchHitRef = {
    entity_type: SearchEntityType | string
    entity_id: string
}

/**
 * FR-SEARCH-110: клик по хиту из поиска не уводит на пустую карточку — сначала
 * лёгкий GET домена; 403/404 → toast и пользователь остаётся в поиске.
 */
export function SearchHitLink({
    projectId,
    hit,
    to,
    className,
    children,
    onNavigate,
    qaId = 'host.search.hitLink',
}: {
    projectId: string | undefined
    hit: SearchHitRef
    to: string
    className?: string
    children: ReactNode
    /** Закрыть overlay / сбросить диалог после успешного перехода. */
    onNavigate?: () => void
    /** Override qa-id prefix (default host.search.hitLink). */
    qaId?: string
}) {
    const navigate = useNavigate()
    const [probing, setProbing] = useState(false)

    const openHit = async (e?: MouseEvent) => {
        e?.preventDefault()
        if (!projectId || probing) return
        setProbing(true)
        try {
            const ok = await probeSearchHitAvailability(projectId, {
                entity_type: hit.entity_type as SearchEntityType,
                entity_id: hit.entity_id,
            })
            if (ok) {
                onNavigate?.()
                navigate(to)
                return
            }
            toast.push(
                <Notification
                    type="warning"
                    title={SEARCH_HIT_UNAVAILABLE_MSG}
                    {...qa('host.search.toast.hitUnavailable')}
                />,
            )
        } catch {
            toast.push(
                <Notification
                    type="danger"
                    title="Не удалось открыть запись"
                    {...qa('host.search.toast.probeFailed')}
                >
                    Проверьте соединение и попробуйте снова.
                </Notification>,
            )
        } finally {
            setProbing(false)
        }
    }

    return (
        <Link
            to={to}
            className={className}
            onClick={(e) => void openHit(e)}
            aria-busy={probing}
            {...qa(qaId, {
                entityType: hit.entity_type,
                entityId: hit.entity_id,
            })}
        >
            {children}
        </Link>
    )
}

/** Тот же probe для Enter/клавиатурной навигации без обёртки Link. */
export async function navigateSearchHit(
    projectId: string | undefined,
    hit: SearchHitRef,
    to: string,
    navigate: (path: string) => void,
    onNavigate?: () => void,
): Promise<boolean> {
    if (!projectId) return false
    try {
        const ok = await probeSearchHitAvailability(projectId, {
            entity_type: hit.entity_type as SearchEntityType,
            entity_id: hit.entity_id,
        })
        if (ok) {
            onNavigate?.()
            navigate(to)
            return true
        }
        toast.push(
            <Notification
                type="warning"
                title={SEARCH_HIT_UNAVAILABLE_MSG}
                {...qa('host.search.toast.hitUnavailable')}
            />,
        )
        return false
    } catch {
        toast.push(
            <Notification
                type="danger"
                title="Не удалось открыть запись"
                {...qa('host.search.toast.probeFailed')}
            >
                Проверьте соединение и попробуйте снова.
            </Notification>,
        )
        return false
    }
}
