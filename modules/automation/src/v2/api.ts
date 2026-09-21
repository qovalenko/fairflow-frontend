/**
 * Сетевой слой канвы v2 — тонкая обёртка над host AutomationService.
 *
 * ВСЕ вызовы graceful: если backend-ручек v2 ещё нет на стенде (404/500),
 * node-registry падает на fallback-константу, save/validate возвращают понятную
 * ошибку. Канва обязана рендериться и работать против v1-API.
 */

import {
    apiGetNodeRegistry,
    apiGetRegistry,
    apiValidateGraph,
    apiCreateRule,
    apiUpdateRule,
    type GraphSpecDTO,
    type SaveRuleInput,
    type ValidateGraphResponse,
} from '@/services/AutomationService'
import type {
    GraphSpec,
    NodeRegistry,
    NodeTypeDef,
    GraphValidationIssue,
} from './types'
import { FALLBACK_REGISTRY, registryFromLegacy } from './registry'

export type RegistrySource = 'v2' | 'legacy' | 'fallback'

export type NodeRegistryLoadResult = {
    registry: NodeRegistry
    source: RegistrySource
}

/** GraphSpec (v2 типы) → DTO для тела запроса. Совпадающий shape. */
function toDTO(spec: GraphSpec): GraphSpecDTO {
    return {
        version: 2,
        nodes: spec.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            config: n.config,
        })),
        edges: spec.edges.map((e) => ({
            id: e.id,
            source: e.source,
            sourceHandle: e.sourceHandle,
            target: e.target,
        })),
    }
}

/**
 * Загрузка реестра нод с тройным graceful-fallback:
 *  1) node-registry-ручка v2 (предпочтительно);
 *  2) legacy /automation/registry (triggers/actions) → маппится в NodeRegistry;
 *  3) встроенный FALLBACK_REGISTRY.
 */
export async function loadNodeRegistry(
    projectId: string,
): Promise<NodeRegistryLoadResult> {
    try {
        const r = await apiGetNodeRegistry({ projectId })
        type DTOItem = {
            id?: string
            // backend node-registry отдаёт `subtype` как id типа (не `id`)
            subtype?: string
            // структурные ноды (condition/branch) приходят с пустым subtype —
            // их id это сам type
            type?: string
            label?: string
            externalEffect?: boolean
            requiredModule?: string
            configSchema?: Record<string, unknown>
        }
        // backend NodeTypeDef НЕ несёт человекочитаемый label (подписи живут в
        // FALLBACK_REGISTRY по id). Сводим: id ← subtype|id, label ← label|
        // fallback-по-id|humanize(id) — иначе кнопки палитры пустые.
        const labelById = new Map<string, string>(
            [
                ...FALLBACK_REGISTRY.triggers,
                ...FALLBACK_REGISTRY.conditions,
                ...FALLBACK_REGISTRY.branches,
                ...FALLBACK_REGISTRY.actions,
            ].map((t) => [t.id, t.label]),
        )
        const humanize = (id: string) =>
            id
                .replace(/^crm\./, '')
                .replace(/[._]/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())
        const adapt = (
            arr: DTOItem[] | undefined,
            kind: NodeTypeDef['kind'],
        ): NodeTypeDef[] =>
            (arr ?? []).map((d) => {
                const id = (d.subtype ?? d.id ?? d.type ?? '') as string
                return {
                    id,
                    kind,
                    label: d.label ?? labelById.get(id) ?? humanize(id),
                    requiredModule: d.requiredModule,
                    externalEffect: d.externalEffect,
                    configSchema: d.configSchema,
                }
            })
        const reg: NodeRegistry = {
            triggers: adapt(r.triggers, 'trigger'),
            conditions: adapt(r.conditions, 'condition'),
            branches: adapt(r.branches, 'branch'),
            actions: adapt(r.actions, 'action'),
        }
        // Если v2-ручка пустая — добираем control-flow примитивы из fallback.
        if (reg.conditions.length === 0) reg.conditions = FALLBACK_REGISTRY.conditions
        if (reg.branches.length === 0) reg.branches = FALLBACK_REGISTRY.branches
        if (reg.triggers.length === 0 && reg.actions.length === 0) {
            return await loadLegacyRegistry(projectId)
        }
        return { registry: reg, source: 'v2' }
    } catch {
        return await loadLegacyRegistry(projectId)
    }
}

async function loadLegacyRegistry(
    projectId: string,
): Promise<NodeRegistryLoadResult> {
    try {
        const legacy = await apiGetRegistry({ projectId })
        return { registry: registryFromLegacy(legacy), source: 'legacy' }
    } catch {
        return { registry: FALLBACK_REGISTRY, source: 'fallback' }
    }
}

export type GraphSaveResult =
    | { ok: true; ruleId: string }
    | { ok: false; message: string }

/** Сохранение правила v2 (engine_version=2 + graph). flat-поля денормализует BFF. */
export async function saveWorkflow(
    args: {
        ruleId?: string
        name: string
        enabled: boolean
        priority: number
        notifyOnFailure: string | null
        triggerType: string
        graph: GraphSpec
    },
    projectId: string,
): Promise<GraphSaveResult> {
    const body: SaveRuleInput = {
        name: args.name,
        enabled: args.enabled,
        priority: args.priority,
        notifyOnFailure: args.notifyOnFailure,
        triggerType: args.triggerType,
        engineVersion: 2,
        graph: toDTO(args.graph),
    }
    try {
        const rule = args.ruleId
            ? await apiUpdateRule(args.ruleId, body, { projectId })
            : await apiCreateRule(body, { projectId })
        return { ok: true, ruleId: rule.id }
    } catch (e) {
        const err = e as {
            response?: { data?: { error?: { message?: string } }; status?: number }
        }
        const status = err?.response?.status
        const msg = err?.response?.data?.error?.message
        if (status === 404 || status === 400) {
            return {
                ok: false,
                message:
                    msg ??
                    'Сохранение графа недоступно: backend automation-v2 ещё не развёрнут на этом стенде.',
            }
        }
        return { ok: false, message: msg ?? 'Не удалось сохранить сценарий.' }
    }
}

export type GraphValidateResult =
    | { ok: true; issues: GraphValidationIssue[] }
    | { ok: false; message: string }

/** Серверная валидация графа (graceful: при отсутствии ручки — клиентская). */
export async function validateWorkflowGraph(
    graph: GraphSpec,
    projectId: string,
): Promise<GraphValidateResult> {
    try {
        const res: ValidateGraphResponse = await apiValidateGraph(
            { graph: toDTO(graph) },
            { projectId },
        )
        return {
            ok: true,
            issues: (res.issues ?? []).map((i) => ({
                nodeId: i.nodeId,
                code: i.code,
                message: i.message,
                severity: i.severity,
            })),
        }
    } catch (e) {
        const err = e as { response?: { status?: number } }
        if (err?.response?.status === 404) {
            return {
                ok: false,
                message:
                    'Серверная валидация недоступна (backend automation-v2 не развёрнут). Показана клиентская проверка.',
            }
        }
        return { ok: false, message: 'Серверная валидация недоступна.' }
    }
}
