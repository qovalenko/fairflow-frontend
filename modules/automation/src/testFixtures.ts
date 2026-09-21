import type {
    AutomationRule,
    Connection,
    DlqEntry,
    DryRunResult,
    RuleExecution,
} from '@/services/AutomationService'

export const automationRule = (
    over: Partial<AutomationRule> = {},
): AutomationRule => ({
    id: 'rule-1',
    projectId: 'p1',
    name: 'Уведомление о сделке',
    enabled: true,
    triggerType: 'crm.deal.created',
    triggerDescription: 'Сделка создана',
    actionDescription: 'Создать активность',
    priority: 100,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    stats: { executed30d: 3, matched30d: 5, lastError: null },
    ...over,
})

export const connection = (over: Partial<Connection> = {}): Connection => ({
    id: 'conn-1',
    projectId: 'p1',
    name: 'Webhook CRM',
    url: 'https://example.test/hook',
    enabled: true,
    secretSet: true,
    breakerState: 'closed',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

export const dlqEntry = (over: Partial<DlqEntry> = {}): DlqEntry => ({
    id: 'dlq-1',
    ruleId: 'rule-1',
    ruleName: 'Уведомление о сделке',
    actionType: 'send_webhook',
    status: 'failed',
    attempts: 2,
    lastError: 'timeout',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
})

export const ruleExecution = (
    over: Partial<RuleExecution> = {},
): RuleExecution => ({
    executionId: 'exec-1',
    ruleId: 'rule-1',
    projectId: 'p1',
    status: 'success',
    source: 'event',
    entityType: 'deal',
    entityId: 'deal-9',
    actionResults: [],
    createdAt: 1_700_000_000_000,
    ...over,
})

export const dryRunResult = (over: Partial<DryRunResult> = {}): DryRunResult => ({
    eventName: 'crm.deal.created',
    matched: true,
    conditionsPassed: true,
    actions: [{ type: 'create_activity', wouldRun: true }],
    dryRun: true,
    ...over,
})
