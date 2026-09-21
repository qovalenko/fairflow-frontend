/**
 * Node-registry для канвы v2: типы триггеров / условий / ветвлений / действий.
 *
 * Источник: backend `GET /api/automation/node-registry` (через AutomationService).
 * Если ручки v2 ещё нет на стенде — graceful-fallback на встроенные словари
 * (синхронны с AutomationForm.tsx + apiGetRegistry). Канва остаётся рабочей.
 */

import type { NodeRegistry, NodeTypeDef } from './types'
import type { RegistryResponse } from '@/services/AutomationService'

// ─── Fallback-словари (пока node-registry/registry-ручка недоступна) ──────────

export const FALLBACK_TRIGGERS: NodeTypeDef[] = [
    { id: 'crm.contact.created', kind: 'trigger', label: 'Контакт создан' },
    { id: 'crm.deal.created', kind: 'trigger', label: 'Сделка создана' },
    { id: 'crm.deal.stage_changed', kind: 'trigger', label: 'Стадия сделки изменена' },
    { id: 'crm.deal.won', kind: 'trigger', label: 'Сделка выиграна' },
    { id: 'crm.order.stage_changed', kind: 'trigger', label: 'Этап продажи изменён' },
    { id: 'crm.task.overdue', kind: 'trigger', label: 'Задача просрочена' },
    { id: 'crm.activity.completed', kind: 'trigger', label: 'Активность завершена' },
    { id: 'crm.field.changed', kind: 'trigger', label: 'Поле изменено' },
]

export const FALLBACK_ACTIONS: NodeTypeDef[] = [
    { id: 'assign_user', kind: 'action', label: 'Назначить ответственного', externalEffect: false },
    { id: 'send_email', kind: 'action', label: 'Отправить email', externalEffect: true },
    { id: 'create_task', kind: 'action', label: 'Создать задачу', externalEffect: false },
    { id: 'update_field', kind: 'action', label: 'Обновить поле', externalEffect: false },
    { id: 'move_stage', kind: 'action', label: 'Переместить стадию', externalEffect: false },
    { id: 'send_webhook', kind: 'action', label: 'Отправить webhook', externalEffect: true },
    { id: 'create_notification', kind: 'action', label: 'Создать уведомление', externalEffect: false },
    { id: 'generate_document', kind: 'action', label: 'Сгенерировать документ', externalEffect: false },
]

// Условие и ветвление — control-flow примитивы, не зависят от backend-словаря.
export const CONDITION_DEFS: NodeTypeDef[] = [
    { id: 'condition', kind: 'condition', label: 'Условие (если)' },
]

export const BRANCH_DEFS: NodeTypeDef[] = [
    { id: 'branch', kind: 'branch', label: 'Ветвление' },
]

export const FALLBACK_REGISTRY: NodeRegistry = {
    triggers: FALLBACK_TRIGGERS,
    conditions: CONDITION_DEFS,
    branches: BRANCH_DEFS,
    actions: FALLBACK_ACTIONS,
}

/**
 * Маппит старый RegistryResponse (apiGetRegistry: { triggers, actions }) в
 * NodeRegistry. Используется как fallback, если node-registry-ручка v2 пуста,
 * но legacy-реестр доступен.
 */
export function registryFromLegacy(r: RegistryResponse): NodeRegistry {
    return {
        triggers:
            r.triggers?.map<NodeTypeDef>((t) => ({
                id: t.id,
                kind: 'trigger',
                label: t.eventName || t.id,
                requiredModule: t.requiredModule,
                configSchema: t.configSchema,
            })) ?? FALLBACK_TRIGGERS,
        conditions: CONDITION_DEFS,
        branches: BRANCH_DEFS,
        actions:
            r.actions?.map<NodeTypeDef>((a) => ({
                id: a.id,
                kind: 'action',
                label: a.id,
                requiredModule: a.requiredModule,
                externalEffect: a.externalEffect,
                configSchema: a.configSchema,
            })) ?? FALLBACK_ACTIONS,
    }
}

/** Поиск дефиниции по id+kind (для меток/externalEffect). */
export function findNodeDef(
    registry: NodeRegistry,
    kind: NodeTypeDef['kind'],
    id: string,
): NodeTypeDef | undefined {
    const bucket =
        kind === 'trigger'
            ? registry.triggers
            : kind === 'condition'
              ? registry.conditions
              : kind === 'branch'
                ? registry.branches
                : registry.actions
    return bucket.find((d) => d.id === id)
}

/** Человекочитаемая метка триггера. */
export function triggerLabel(registry: NodeRegistry, id: string): string {
    return registry.triggers.find((t) => t.id === id)?.label ?? id
}

/** Человекочитаемая метка действия. */
export function actionLabel(registry: NodeRegistry, id: string): string {
    return registry.actions.find((a) => a.id === id)?.label ?? id
}

/** Внешний эффект действия (по реестру, fallback false). */
export function actionIsExternal(registry: NodeRegistry, id: string): boolean {
    return registry.actions.find((a) => a.id === id)?.externalEffect ?? false
}

export const OPERATOR_OPTIONS = [
    { value: 'eq', label: 'Равно' },
    { value: 'ne', label: 'Не равно' },
    { value: 'contains', label: 'Содержит' },
    { value: 'gt', label: 'Больше' },
    { value: 'lt', label: 'Меньше' },
    { value: 'is_empty', label: 'Пусто' },
    { value: 'is_not_empty', label: 'Не пусто' },
]
