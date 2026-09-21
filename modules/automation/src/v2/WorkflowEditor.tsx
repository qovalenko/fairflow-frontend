import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Spinner from '@/components/ui/Spinner'
import {
    apiGetRule,
    type AutomationRule,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    NotFoundState,
    errMessage,
    httpStatus,
} from '../shared'
import type { GraphSpec, NodeRegistry } from './types'
import { FALLBACK_REGISTRY } from './registry'
import { graphFromFlatRule } from './graphSpec'
import { loadNodeRegistry, type RegistrySource } from './api'
import { layoutGraph } from './layout'
import { useWorkflowStore } from './workflowStore'
import { RegistryProvider } from './registryContext'
import NodePalette from './NodePalette'
import WorkflowCanvas from './WorkflowCanvas'
import NodePropertiesPanel from './NodePropertiesPanel'
import WorkflowToolbar from './WorkflowToolbar'
import DryRunOverlay from '../DryRunOverlay'
import { qa } from '../qa'

/**
 * WorkflowEditor — корневой экран канвы v2 (PLAN.md §2.2).
 * Оркестратор: гейтинг → load графа → ReactFlowProvider → палитра/тулбар/канва/панель.
 */
export default function WorkflowEditor() {
    const params = useParams<{ id: string; pid: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const pid = useCurrentProjectId()

    const rawId = params.id
    const isEdit = !!rawId && rawId !== 'new'
    const ruleId = isEdit ? rawId : undefined

    const can = usePermission()
    const canRead = can('automation', 'read')
    const canWrite = can('automation', 'write')
    const canManage = can('automation', 'manage')
    const canExecute = can('automation', 'execute')

    const reset = useWorkflowStore((s) => s.reset)
    const setGraph = useWorkflowStore((s) => s.setGraph)
    const setRuleMeta = useWorkflowStore((s) => s.setRuleMeta)
    const setExecutedPath = useWorkflowStore((s) => s.setExecutedPath)
    const loadFromGraphSpec = useWorkflowStore((s) => s.loadFromGraphSpec)

    const [dryRunOpen, setDryRunOpen] = useState(false)
    const [registry, setRegistry] = useState<NodeRegistry>(FALLBACK_REGISTRY)
    const [registrySource, setRegistrySource] = useState<RegistrySource | null>(
        null,
    )
    const [isFlatProjection, setIsFlatProjection] = useState(false)

    // hasExternalEffect для dry-run — читаем здесь (до условных return), чтобы
    // порядок хуков был стабилен (rules-of-hooks).
    const hasExternalEffect = useWorkflowStore((s) =>
        s.nodes.some(
            (n) =>
                n.type === 'action' &&
                Boolean((n.data as { externalEffect?: boolean }).externalEffect),
        ),
    )

    // Чистый стор на каждый вход в редактор (PLAN.md §3.1).
    useEffect(() => {
        reset()
        return () => reset()
    }, [reset, ruleId])

    // FR-AUTOM-530: journal deep-link `?highlightPath=n1,n2,n3` overlays execution trace.
    useEffect(() => {
        const raw = searchParams.get('highlightPath')
        if (!raw?.trim()) {
            setExecutedPath([])
            return
        }
        setExecutedPath(
            raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        )
    }, [searchParams, setExecutedPath])

    // node-registry (graceful fallback внутри loadNodeRegistry).
    useEffect(() => {
        if (!pid || !canRead) return
        let alive = true
        loadNodeRegistry(pid).then(({ registry: r, source }) => {
            if (alive) {
                setRegistry(r)
                setRegistrySource(source)
            }
        })
        return () => {
            alive = false
        }
    }, [pid, canRead])

    // Загрузка правила (edit).
    const {
        data: rule,
        isLoading,
        error,
        mutate: refetch,
    } = useSWR<AutomationRule>(
        isEdit && pid && canRead ? ['/automation/rules/v2', pid, ruleId] : null,
        () => apiGetRule(ruleId!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    // Заполняем стор из правила: graphJson (v2) или upgrade из flat (v1).
    useEffect(() => {
        if (!rule) {
            setIsFlatProjection(false)
            return
        }
        setRuleMeta({
            id: rule.id,
            name: rule.name,
            priority: rule.priority ?? 100,
            notifyOnFailure: rule.notifyOnFailure ?? null,
            enabled: rule.enabled,
            state: rule.state,
        })
        // BFF отдаёт распарсенный `graph` (object); `graphJson` (string) —
        // на случай сырой формы. Принимаем оба.
        const rawGraph =
            (rule as { graph?: unknown }).graph ?? rule.graphJson
        if (rawGraph) {
            try {
                const spec: GraphSpec =
                    typeof rawGraph === 'string'
                        ? JSON.parse(rawGraph)
                        : (rawGraph as unknown as GraphSpec)
                loadFromGraphSpec(spec)
                setIsFlatProjection(false)
                return
            } catch {
                /* битый graphJson — деградируем в upgrade из flat */
            }
        }
        // Upgrade из flat-правила v1 (линейный граф) + авто-раскладка.
        const { nodes, edges } = graphFromFlatRule({
            triggerType: rule.triggerType,
            conditionsJson: rule.conditionsJson,
            actionsJson: rule.actionsJson,
        })
        setGraph(layoutGraph(nodes, edges, 'TB'), edges)
        setIsFlatProjection(true)
    }, [rule, setRuleMeta, setGraph, loadFromGraphSpec])

    // ── Гейтинг / состояния ──
    if (!pid) return <NoProjectState />
    if (!canRead)
        return <NoPermissionState message="Нет права automation:read." />
    if (!isEdit && !canWrite)
        return (
            <NoPermissionState message="Нет права automation:write для создания сценария." />
        )

    if (isEdit && isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-180px)] text-gray-500 gap-2">
                <Spinner /> Загрузка сценария…
            </div>
        )
    }
    if (isEdit && error) {
        if (httpStatus(error) === 404) {
            return (
                <NotFoundState
                    message="Сценарий не найден или удалён."
                    onBack={() => navigate('/automation/v2')}
                />
            )
        }
        return (
            <ErrorState
                message={errMessage(error, 'Не удалось загрузить сценарий')}
                onRetry={() => refetch()}
            />
        )
    }

    const frozen = rule?.state === 'frozen'
    const readOnly = frozen || (isEdit && !canWrite && !canManage)

    return (
        <ReactFlowProvider>
            <RegistryProvider value={registry}>
                <div className="flex flex-col h-[calc(100vh-130px)] min-h-[480px] border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
                    <WorkflowToolbar
                        readOnly={readOnly}
                        isEdit={isEdit}
                        canWrite={canWrite}
                        canManage={canManage}
                        canExecute={canExecute}
                        projectId={pid}
                        rule={rule}
                        onBack={() => navigate('/automation/v2')}
                        onSaved={(id) => navigate(`/automation/v2/${id}`)}
                        onDryRun={() => setDryRunOpen(true)}
                    />
                    {(isFlatProjection || registrySource === 'fallback') && (
                        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-sky-50 dark:bg-sky-900/20 text-xs text-sky-800 dark:text-sky-200 space-y-1">
                            {isFlatProjection && (
                                <p {...qa('automation.v2editor.v1FlatProjection')}>
                                    Классическое правило открыто как линейный граф
                                    v2 — сохранение создаст граф v2.
                                </p>
                            )}
                            {registrySource === 'fallback' && (
                                <p {...qa('automation.v2editor.registryFallback')}>
                                    Реестр нод недоступен — используются встроенные
                                    типы (частичная деградация).
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex flex-1 min-h-0">
                        <NodePalette
                            readOnly={readOnly}
                            registry={registry}
                            loading={false}
                            canWrite={canWrite}
                            canManage={canManage}
                        />
                        <WorkflowCanvas readOnly={readOnly} />
                        <NodePropertiesPanel
                            readOnly={readOnly}
                            registry={registry}
                            projectId={pid}
                            canManage={canManage}
                        />
                    </div>
                </div>
            </RegistryProvider>

            {isEdit && ruleId && (
                <DryRunOverlay
                    isOpen={dryRunOpen}
                    onClose={() => setDryRunOpen(false)}
                    ruleId={ruleId}
                    projectId={pid}
                    hasExternalEffect={hasExternalEffect}
                />
            )}
        </ReactFlowProvider>
    )
}
