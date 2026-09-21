import { useEffect, useMemo, useRef, useState } from 'react'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { apiSearchEntities } from './chatService'
import {
    ENTITY_TYPES,
    ENTITY_TYPE_ICONS,
    ENTITY_TYPE_LABELS,
} from './chatEntityRefs'
import { qa } from './qa'
import type { EntityRef, EntityRefType } from './chatTypes'

/**
 * Пикер CRM-сущности для вставки inline-ссылки в сообщение (P2.c). Выбор типа
 * (deal/contact/company/order) + поиск по названию через apiSearchEntities
 * (существующие gateway-ручки списков). Выбранная сущность → onPick(ref), композер
 * сериализует её токеном в text. Все состояния честные: загрузка/пусто/ошибка.
 */
export interface EntityPickerProps {
    onPick: (ref: EntityRef) => void
    onClose: () => void
}

type SearchState = 'idle' | 'loading' | 'ready' | 'error'

const EntityPicker = ({ onPick, onClose }: EntityPickerProps) => {
    const projectId = useResolvedProjectId()
    const [type, setType] = useState<EntityRefType>('deal')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<EntityRef[]>([])
    const [state, setState] = useState<SearchState>('idle')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Дебаунс + отмена гонки: показываем результат только последнего запроса.
    useEffect(() => {
        let cancelled = false
        setState('loading')
        const t = setTimeout(() => {
            apiSearchEntities(type, query, projectId)
                .then((list) => {
                    if (cancelled) return
                    setResults(list)
                    setState('ready')
                })
                .catch(() => {
                    if (cancelled) return
                    setResults([])
                    setState('error')
                })
        }, 250)
        return () => {
            cancelled = true
            clearTimeout(t)
        }
    }, [type, query, projectId])

    const noProject = !projectId

    const body = useMemo(() => {
        if (noProject) {
            return <Hint text="Поиск сущностей доступен только в проекте" />
        }
        if (state === 'loading') return <Hint text="Поиск…" />
        if (state === 'error') {
            return <Hint text="Ошибка поиска. Измените запрос или повторите." error />
        }
        if (results.length === 0) {
            return (
                <Hint
                    text={
                        query.trim()
                            ? 'Ничего не найдено'
                            : `Начните вводить название (${ENTITY_TYPE_LABELS[type].toLowerCase()})`
                    }
                />
            )
        }
        return (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {results.map((r) => (
                    <button
                        key={`${r.type}_${r.id}`}
                        type="button"
                        onClick={() => onPick(r)}
                        {...qa('chat.entityPicker.option', { entity: `${r.type}_${r.id}` })}
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 12px',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 13,
                        }}
                    >
                        <span>{ENTITY_TYPE_ICONS[r.type]}</span>
                        <span
                            style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {r.label}
                        </span>
                    </button>
                ))}
            </div>
        )
    }, [noProject, state, results, query, type, onPick])

    return (
        <div
            role="dialog"
            aria-label="Прикрепить CRM-сущность"
            {...qa('chat.entityPicker.panel')}
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 6,
                width: 320,
                maxWidth: '90vw',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                zIndex: 40,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderBottom: '1px solid #f3f4f6',
                }}
            >
                <strong style={{ fontSize: 13 }}>CRM-сущность</strong>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрыть"
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }}
                >
                    ×
                </button>
            </div>

            <div style={{ display: 'flex', gap: 4, padding: 8, flexWrap: 'wrap' }}>
                {ENTITY_TYPES.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        {...qa('chat.entityPicker.type', { type: t })}
                        style={{
                            display: 'flex',
                            gap: 4,
                            alignItems: 'center',
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid ' + (t === type ? '#4f46e5' : '#e5e7eb'),
                            background: t === type ? '#eef2ff' : '#fff',
                            color: t === type ? '#4f46e5' : '#374151',
                            cursor: 'pointer',
                            fontSize: 12,
                        }}
                    >
                        <span>{ENTITY_TYPE_ICONS[t]}</span>
                        {ENTITY_TYPE_LABELS[t]}
                    </button>
                ))}
            </div>

            <div style={{ padding: '0 8px 8px' }}>
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            onClose()
                        }
                    }}
                    placeholder={`Поиск: ${ENTITY_TYPE_LABELS[type].toLowerCase()}…`}
                    {...qa('chat.entityPicker.search')}
                    style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        padding: '6px 10px',
                        fontSize: 13,
                    }}
                />
            </div>

            {body}
        </div>
    )
}

const Hint = ({ text, error }: { text: string; error?: boolean }) => (
    <div
        style={{
            padding: '14px 12px',
            textAlign: 'center',
            fontSize: 12,
            color: error ? '#b91c1c' : '#9ca3af',
        }}
    >
        {text}
    </div>
)

export default EntityPicker
