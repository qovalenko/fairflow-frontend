import { useNavigate } from 'react-router'
import { ENTITY_TYPE_ICONS, ENTITY_TYPE_LABELS, entityRoutePath } from './chatEntityRefs'
import { qa } from './qa'
import type { EntityRef } from './chatTypes'

/**
 * Инлайн-чип CRM-сущности в сообщении (P2.c): иконка по типу + метка. Клик ведёт
 * на карточку сущности хост-роутом (`/deals/:id`, `/contacts/:id`, `/companies/:id`,
 * `/orders/:id` — сверено по host routes.config). Навигация через useNavigate
 * (react-router доступен и в federated, и в standalone-обёртке модуля).
 * `onOwn` подбирает контрастную палитру под тёмный пузырь своих сообщений.
 */
export interface EntityChipProps {
    entity: EntityRef
    onOwn?: boolean
}

const EntityChip = ({ entity, onOwn }: EntityChipProps) => {
    const navigate = useNavigate()
    const title = `${ENTITY_TYPE_LABELS[entity.type]}: ${entity.label}`

    return (
        <button
            type="button"
            title={title}
            onClick={(e) => {
                e.stopPropagation()
                navigate(entityRoutePath(entity))
            }}
            {...qa('chat.message.entityChip', { entity: `${entity.type}_${entity.id}` })}
            style={{
                display: 'inline-flex',
                gap: 4,
                alignItems: 'baseline',
                maxWidth: '100%',
                padding: '0 6px',
                margin: '0 1px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 'inherit',
                lineHeight: 1.5,
                verticalAlign: 'baseline',
                background: onOwn ? 'rgba(255,255,255,0.22)' : '#e0e7ff',
                color: onOwn ? '#fff' : '#4338ca',
                fontWeight: 500,
            }}
        >
            <span aria-hidden style={{ fontSize: '0.9em' }}>
                {ENTITY_TYPE_ICONS[entity.type]}
            </span>
            <span
                style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                }}
            >
                {entity.label}
            </span>
        </button>
    )
}

export default EntityChip
