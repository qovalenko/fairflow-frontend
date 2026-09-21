import type { ProjectInfo } from '@/@types/auth'

type ControlProjectWire = {
    id: string
    name: string
    color?: string
    owner_type?: string
    owner_id?: string
    status?: string
    provisioning_status?: string
    provisioningStatus?: string
    template_id?: string
    templateId?: string
    modules?: string[]
    effective_modules?: string[]
    module_configs?: Array<{
        module_id?: string
        enabled?: boolean
        personal_settings?: Record<string, unknown>
        integration_settings?: Record<string, unknown>
        integration_methods_enabled?: string[]
    }>
    module_policies?: Array<{
        id?: string
        module_id?: string
        effect?: string
        subject?: string
        action?: string
        resource?: string
        condition?: Record<string, unknown>
    }>
}

function normalizeProjectStatus(
    status?: string,
): ProjectInfo['status'] | undefined {
    if (status === 'archived' || status === 'pending_deletion' || status === 'active') {
        return status
    }
    return undefined
}

function normalizeProvisioningStatus(
    status?: string,
): ProjectInfo['provisioningStatus'] | undefined {
    if (status === 'pending' || status === 'complete' || status === 'failed') {
        return status
    }
    return undefined
}

/** Map control API project list to ProjectInfo[] (FR-PROJ-405). */
export function mapControlProjectsToUser(list: ControlProjectWire[]): ProjectInfo[] {
    return (list ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color ?? '#6366f1',
        ownerType: 'ORGANIZATION' as const,
        ownerId: p.owner_id ?? '',
        status: normalizeProjectStatus(p.status),
        provisioningStatus: normalizeProvisioningStatus(
            p.provisioning_status ?? p.provisioningStatus,
        ),
        templateId: (p.template_id ?? p.templateId ?? '').trim() || undefined,
        role: 'member',
        enabledModules: p.modules ?? [],
        effectiveModules: p.effective_modules ?? p.modules ?? [],
        moduleConfigs:
            p.module_configs?.map((cfg) => ({
                moduleId: cfg.module_id ?? '',
                enabled: cfg.enabled ?? false,
                personalSettings: cfg.personal_settings ?? {},
                integrationSettings: cfg.integration_settings ?? {},
                integrationMethodsEnabled: cfg.integration_methods_enabled ?? [],
            })) ?? [],
        modulePolicies:
            p.module_policies?.map((rule) => ({
                id: rule.id ?? '',
                moduleId: rule.module_id ?? '',
                effect: rule.effect === 'deny' ? 'deny' : 'allow',
                subject: rule.subject ?? '',
                action: rule.action ?? '',
                resource: rule.resource ?? '*',
                condition: rule.condition ?? {},
            })) ?? [],
    }))
}
