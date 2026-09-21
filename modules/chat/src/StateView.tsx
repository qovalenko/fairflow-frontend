import type { ReactNode } from 'react'
import { Button } from '@fairflow/shared-ui'

/** Универсальный плейсхолдер состояний экрана (06-frontend-contract §3.5). */
export interface StateViewProps {
    kind: 'loading' | 'empty' | 'error' | 'no-permission' | 'not-member' | 'disabled-module' | 'billing-readonly'
    title?: string
    description?: string
    onRetry?: () => void
    cta?: ReactNode
}

const DEFAULTS: Record<StateViewProps['kind'], { title: string; description?: string }> = {
    loading: { title: 'Загрузка…' },
    empty: { title: 'Пусто' },
    error: { title: 'Ошибка', description: 'Не удалось загрузить данные' },
    'no-permission': { title: 'Нет доступа', description: 'У вас нет права на просмотр чата' },
    'not-member': { title: 'Нет доступа к беседе', description: 'Вы не участник этой беседы' },
    'disabled-module': { title: 'Модуль выключен', description: 'Модуль «Чат» выключен в проекте' },
    'billing-readonly': { title: 'Только просмотр', description: 'Режим только для чтения (биллинг)' },
}

const Skeleton = () => (
    <div style={{ padding: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
            <div
                key={i}
                style={{
                    height: 48,
                    marginBottom: 8,
                    borderRadius: 8,
                    background: 'linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6)',
                    opacity: 0.8,
                }}
            />
        ))}
    </div>
)

const StateView = ({ kind, title, description, onRetry, cta }: StateViewProps) => {
    if (kind === 'loading') return <Skeleton />
    const d = DEFAULTS[kind]
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 32,
                textAlign: 'center',
                color: '#6b7280',
            }}
        >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>{title ?? d.title}</div>
            {(description ?? d.description) && (
                <div style={{ fontSize: 13 }}>{description ?? d.description}</div>
            )}
            {onRetry && (
                <Button variant="plain" onClick={onRetry}>
                    Повторить
                </Button>
            )}
            {cta}
        </div>
    )
}

export default StateView
