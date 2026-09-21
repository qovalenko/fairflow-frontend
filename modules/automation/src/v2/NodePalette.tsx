import { useReactFlow } from '@xyflow/react'
import {
    PiLightningDuotone,
    PiFunnelDuotone,
    PiTreeStructureDuotone,
    PiGearSixDuotone,
} from 'react-icons/pi'
import Skeleton from '@/components/ui/Skeleton'
import type { NodeKind, NodeRegistry, NodeTypeDef } from './types'
import { useWorkflowStore } from './workflowStore'
import { qa } from '../qa'

/** MIME-тип для нативного DnD из палитры на канву. */
export const DND_MIME = 'application/ff-node'

const kindMeta: Record<
    NodeKind,
    { title: string; icon: React.ReactNode; accent: string }
> = {
    trigger: {
        title: 'Триггеры',
        icon: <PiLightningDuotone className="w-4 h-4 text-amber-500" />,
        accent: 'hover:border-amber-300',
    },
    condition: {
        title: 'Условия',
        icon: <PiFunnelDuotone className="w-4 h-4 text-sky-500" />,
        accent: 'hover:border-sky-300',
    },
    branch: {
        title: 'Ветвления',
        icon: <PiTreeStructureDuotone className="w-4 h-4 text-violet-500" />,
        accent: 'hover:border-violet-300',
    },
    action: {
        title: 'Действия',
        icon: <PiGearSixDuotone className="w-4 h-4 text-emerald-500" />,
        accent: 'hover:border-emerald-300',
    },
}

/**
 * NodePalette — drag-from-palette (нативный HTML DnD) + клик-добавление в центр.
 * Триггер доступен только если в графе ещё нет триггера (один вход).
 */
export default function NodePalette({
    readOnly,
    registry,
    loading,
    canWrite,
    canManage,
}: {
    readOnly: boolean
    registry: NodeRegistry
    loading: boolean
    canWrite: boolean
    canManage: boolean
}) {
    const { screenToFlowPosition } = useReactFlow()
    const addNode = useWorkflowStore((s) => s.addNode)
    const hasTrigger = useWorkflowStore((s) => s.nodes.some((n) => n.type === 'trigger'))

    if (readOnly) {
        return (
            <aside className="w-56 border-r border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-400 shrink-0">
                Палитра недоступна в режиме просмотра.
            </aside>
        )
    }

    const sections: { kind: NodeKind; defs: NodeTypeDef[] }[] = [
        { kind: 'trigger', defs: registry.triggers },
        { kind: 'condition', defs: registry.conditions },
        { kind: 'branch', defs: registry.branches },
        // external-действия скрыты без manage (FR-MAUT, AutomationForm parity).
        {
            kind: 'action',
            defs: registry.actions.filter((a) => !a.externalEffect || canManage),
        },
    ]

    const onDragStart = (
        e: React.DragEvent,
        kind: NodeKind,
        typeId: string,
    ) => {
        e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind, typeId }))
        e.dataTransfer.effectAllowed = 'move'
    }

    // Клик-добавление (доступность) — в центр текущего вьюпорта канвы.
    const addToCenter = (kind: NodeKind, typeId: string) => {
        const pos = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        })
        addNode(kind, typeId, pos)
    }

    return (
        <aside className="w-56 border-r border-gray-200 dark:border-gray-700 p-3 overflow-y-auto shrink-0" {...qa('automation.v2editor.palette')}>
            <p className="text-xs font-semibold text-gray-500 mb-2">
                Перетащите на холст
            </p>
            {!canWrite && (
                <p className="text-[11px] text-amber-600 mb-2">
                    Нет права automation:write — добавление недоступно.
                </p>
            )}
            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} height={32} className="rounded" />
                    ))}
                </div>
            ) : (
                sections.map(({ kind, defs }) => {
                    const meta = kindMeta[kind]
                    return (
                        <div key={kind} className="mb-4">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                                {meta.icon}
                                {meta.title}
                            </div>
                            <div className="space-y-1">
                                {defs.map((def) => {
                                    const disabled =
                                        !canWrite ||
                                        (kind === 'trigger' && hasTrigger)
                                    return (
                                        <button
                                            key={def.id}
                                            type="button"
                                            draggable={!disabled}
                                            disabled={disabled}
                                            onDragStart={(e) =>
                                                onDragStart(e, kind, def.id)
                                            }
                                            onClick={() =>
                                                !disabled &&
                                                addToCenter(kind, def.id)
                                            }
                                            title={
                                                kind === 'trigger' && hasTrigger
                                                    ? 'Триггер уже добавлен'
                                                    : def.label
                                            }
                                            className={`w-full text-left text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${meta.accent} ${
                                                disabled
                                                    ? 'opacity-40 cursor-not-allowed'
                                                    : 'cursor-grab active:cursor-grabbing'
                                            }`}
                                            {...qa('automation.v2editor.paletteItem', {
                                                kind,
                                                type: def.id,
                                            })}
                                        >
                                            {def.label}
                                        </button>
                                    )
                                })}
                                {defs.length === 0 && (
                                    <p className="text-[11px] text-gray-400">
                                        Нет доступных типов.
                                    </p>
                                )}
                            </div>
                        </div>
                    )
                })
            )}
        </aside>
    )
}
