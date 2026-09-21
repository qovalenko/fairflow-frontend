import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router'
import { useProjectStore } from '@/store/projectStore'
import { useSessionUser } from '@/store/authStore'
import {
    apiGetModulesRegistry,
    apiUpdateProjectSettings,
    apiGetProject,
    apiApplyProjectTemplate,
    apiGetProjectTemplates,
    apiListProjectModuleStates,
    apiInstallProjectModule,
    apiUninstallProjectModule,
    apiEnableProjectModule,
    apiDisableProjectModule,
    apiPreviewUpgradeProjectModule,
    apiUpgradeProjectModule,
    apiResumeModuleDelivery,
    newIdempotencyKey,
    type ModuleUpgradePreview,
    type ProjectModuleState,
    apiGetProjectMembers,
    apiAddProjectMember,
    apiGetEmployees,
    apiUpdateProjectMemberRole,
    apiPreviewRemoveProjectMember,
    apiRemoveProjectMember,
    apiArchiveProject,
    apiUnarchiveProject,
    apiDeleteProject,
    apiGetPipelines,
    apiUpdatePipeline,
    apiDeletePipeline,
    apiGetDealSources,
    apiCreateDealSource,
    apiUpdateDealSource,
    apiDeleteDealSource,
    apiGetModuleDisableImpact,
    apiGetModuleEnableImpact,
    apiGetDealsDisableCascadePreview,
    apiGetOrderTypes,
    apiCreateOrderType,
    apiUpdateOrderType,
    apiDeleteOrderType,
    apiGetIntegrations,
    apiCreateIntegration,
    apiUpdateIntegration,
    apiDeleteIntegration,
    apiGetApiKeys,
    apiIssueApiKey,
    apiRevokeApiKey,
    apiGetIntegrationDeliveries,
    apiGetProjectAudit,
    type ProjectAuditEntry,
    type IntegrationType,
    type IntegrationConfig,
    type ProjectIntegration,
    type CreateIntegrationPayload,
    type ProjectApiKey,
    type IssuedApiKey,
    type WebhookDelivery,
    VISIBILITY_LEVELS,
    VISIBILITY_LEVEL_LABELS,
    DEFAULT_VISIBILITY_BY_ROLE,
    PROJECT_ROLES,
    type ModuleRegistryItem,
    type VisibilityLevel,
    type VisibilityConfig,
    type ProjectRole,
    type ProjectMember,
    type OrgEmployee,
    apiMyVisibilitySummary,
    type VisibilitySummaryModule,
} from '@/services/CrmService'
import usePermission from '@/utils/hooks/usePermission'
import useProjectMemberNames from '@/utils/hooks/useProjectMemberNames'
import useRefreshModules from '@/utils/hooks/useRefreshModules'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import useRegisterProjectSwitchDirty from '@/utils/hooks/useRegisterProjectSwitchDirty'
import PermissionCheck from '@/components/shared/PermissionCheck'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import useSlotContributions from '@/utils/hooks/useSlotContributions'
import ModuleSettingsPanel from './ModuleSettingsPanel'
import ModuleDisableImpactDialog from './ModuleDisableImpactDialog'
import ModuleEnablePreviewDialog from './ModuleEnablePreviewDialog'
import { computeAutoEnabledModules } from './moduleEnablePreview'
import ModuleEnableCascadeDialog from './ModuleEnableCascadeDialog'
import DealsDisableCascadeDialog from './DealsDisableCascadeDialog'
import TeamStatus from '@/views/onboarding/TeamStatus'
import SystemRolesReference from './rights/SystemRolesReference'
import usePublicConfig from '@/utils/hooks/usePublicConfig'
import {
    isModuleSettingsPanelReachable,
    moduleSettingsPanelTabs,
} from './moduleSettingsTabs'
import Alert from '@/components/ui/Alert'
import RolesEditor from './rights/RolesEditor'
import SettingsSlotTabs, {
    isModuleTab,
    isSlotTab,
    moduleTabValue,
} from './SettingsSlotTabs'
import AbacEditor from './rights/AbacEditor'
import AccessSimulator from './rights/AccessSimulator'
import AssignmentsTab from './rights/AssignmentsTab'
import AccessUnitsEditor from '@/views/account/System/AccessUnitsEditor'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import ModuleSettingsForm from './modules/ModuleSettingsForm'
import { moduleSaveErrorMessage, accessSaveErrorMessage } from './settingsErrors'
import { memberErrorMessage } from '../Members/memberHelpers'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import type { ProjectModuleConfig, ProjectModulePolicyRule } from '@/@types/auth'
import type { Pipeline, DealSource, OrderType } from '@/@types/crm'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    PiPencilDuotone,
    PiPlusDuotone,
    PiTrashDuotone,
    PiGearSixDuotone,
    PiArchiveDuotone,
    PiLockDuotone,
    PiPlugDuotone,
    PiKeyDuotone,
    PiCopyDuotone,
    PiWarningDuotone,
    PiCheckCircleDuotone,
    PiQuestion,
    PiListChecksDuotone,
    PiUserDuotone,
    PiUsersDuotone,
    PiUsersThreeDuotone,
    PiGlobeHemisphereWestDuotone,
    PiEyeDuotone,
    PiEyeSlashDuotone,
    PiShareNetworkDuotone,
    PiProhibitDuotone,
    PiMagnifyingGlassDuotone,
} from 'react-icons/pi'
import type { IconType } from 'react-icons'
import Tooltip from '@/components/ui/Tooltip'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Tabs from '@/components/ui/Tabs'
import Switcher from '@/components/ui/Switcher'
import Checkbox from '@/components/ui/Checkbox'
import { qa, qaWithAlias } from '@/shared/qa'
import Select from '@/components/ui/Select'
import DataTable, { ColumnDef } from '@/components/shared/DataTable'
import Drawer from '@/components/ui/Drawer'
import Dialog from '@/components/ui/Dialog'
import UnassignedTab from './UnassignedTab'

const { TabNav, TabList, TabContent } = Tabs

/** Valid project-settings tab keys (used for the `?tab=` deep-link guard). */
const SETTINGS_TABS = [
    'general',
    'modules',
    'access',
    'unassigned',
    'teamStatus',
    'audit',
    'pipelines',
    'orderTypes',
    'sources',
    'integrations',
]

/**
 * BX-MODEL-1: доступ собран в один раздел «Доступ». Старые ссылки на разрозненные
 * вкладки (роли / участники / политики) ведут в него же — под-раздел выбирается
 * внутри раздела «Доступ».
 */
const LEGACY_TAB_MAP: Record<string, string> = {
    policies: 'access',
    members: 'access',
    roles: 'access',
}

/** Preset palette for lead/deal source color chips. */
const SOURCE_COLOR_PALETTE = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#F97316',
    '#EF4444',
    '#EC4899',
    '#14B8A6',
]

const integrationTypeCatalog: Array<{
    id: IntegrationType
    name: string
    description: string
}> = [
    { id: 'rest', name: 'REST API', description: 'Внешние вызовы по HTTP, webhook-уведомления' },
    { id: 'kafka', name: 'Kafka', description: 'Обмен сообщениями через топики' },
    { id: 'db', name: 'Подключение к БД', description: 'Прямое подключение к базе данных (read-only или синхронизация)' },
]

const integrationTypeLabel = (t: IntegrationType) =>
    integrationTypeCatalog.find((c) => c.id === t)?.name ?? t

/**
 * Human-readable catalog of project events a REST webhook can subscribe to
 * (BX-INTEG-6, design §2.4). Hardcoded for box — the delivery consumer matches
 * these routing-keys (`config.events`) against the `fairflow.events` bus.
 * `'*'` (below) means every project event.
 */
const WEBHOOK_EVENT_CATALOG: Array<{ key: string; label: string }> = [
    { key: 'crm.contact.created', label: 'Контакт создан' },
    { key: 'crm.contact.updated', label: 'Контакт изменён' },
    { key: 'crm.contact.deleted', label: 'Контакт удалён' },
    { key: 'crm.deal.created', label: 'Сделка создана' },
    { key: 'crm.deal.updated', label: 'Сделка изменена' },
    { key: 'crm.deal.deleted', label: 'Сделка удалена' },
    { key: 'crm.deal.stage_changed', label: 'Сделка сменила стадию' },
    { key: 'crm.deal.won', label: 'Сделка выиграна' },
]

const WEBHOOK_EVENT_ALL = '*'

const webhookEventLabel = (key: string): string =>
    key === WEBHOOK_EVENT_ALL
        ? 'Все события проекта'
        : (WEBHOOK_EVENT_CATALOG.find((e) => e.key === key)?.label ?? key)

/** Webhook-delivery status → RU label + Tag classes for the deliveries panel. */
const DELIVERY_STATUS_META: Record<
    WebhookDelivery['status'],
    { label: string; cls: string }
> = {
    success: {
        label: 'Доставлено',
        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
    dead_lettered: {
        label: 'Отброшено',
        cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    },
}

/** anti-SSRF verdict reason (shared/webhook-target) → why the URL is rejected. */
const WEBHOOK_REASON_RU: Record<string, string> = {
    scheme: 'требуется адрес по https://',
    private_ip: 'внутренний или частный IP-адрес запрещён',
    loopback: 'loopback-адрес (localhost) запрещён',
    link_local: 'link-local адрес запрещён',
    metadata: 'адрес сервиса метаданных запрещён',
    internal_host: 'внутренний хост запрещён',
    malformed: 'некорректный URL',
}

/**
 * Maps the anti-SSRF backend errors (BX-INTEG-3: WEBHOOK_TARGET_INVALID /
 * WEBHOOK_URL_DENIED) to a field-level message for the endpoint input. Returns
 * null for any other error so the caller falls back to the generic toast.
 * The reason (verdict.reason) rides in the envelope `details`.
 */
const webhookTargetError = (err: unknown): string | null => {
    const e = err as {
        response?: {
            data?: {
                message?: string
                code?: string
                details?: { reason?: string }
                error?: { message?: string; code?: string }
            }
        }
    }
    const data = e?.response?.data
    const token =
        data?.error?.code ??
        data?.error?.message ??
        data?.code ??
        data?.message ??
        ''
    if (token !== 'WEBHOOK_TARGET_INVALID' && token !== 'WEBHOOK_URL_DENIED') {
        return null
    }
    const reason = data?.details?.reason
    const why = reason ? WEBHOOK_REASON_RU[reason] : undefined
    return why
        ? `Адрес запрещён политикой безопасности: ${why}.`
        : 'Адрес запрещён политикой безопасности (только внешние https-адреса).'
}

/** Box «?»-tooltip: placeholder-driven forms carry the field name here. */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

/**
 * A labelled, copyable code block for the API developer documentation.
 * Copy state is per-instance so several snippets can be shown at once.
 */
const CodeSnippet = ({ label, code }: { label: string; code: string }) => {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            setCopied(false)
        }
    }
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {label}
                </span>
                <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    onClick={copy}
                >
                    <PiCopyDuotone className="w-4 h-4" />
                    {copied ? 'Скопировано' : 'Копировать'}
                </button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    )
}

/**
 * SCR-PROJECT-SETTINGS-INTEGRATIONS — static developer docs for the box
 * public REST API and webhook signatures (BX-INTEG-7). Box is single-origin,
 * so the base URL is derived from the current app origin; the auth scheme
 * (`Authorization: Bearer ffk_…`) and the `x-fairflow-signature` HMAC format
 * are hard-coded to match the gateway ProjectApiKeyGuard (BX-INTEG-2) and the
 * webhook-delivery signer (BX-INTEG-4).
 */
const ApiDocs = () => {
    const origin =
        typeof window !== 'undefined' ? window.location.origin : 'https://<хост>'
    const baseUrl = `${origin}/api/v1/public`
    const curlExample = `curl -H "Authorization: Bearer ffk_ВАШ_КЛЮЧ" \\
  "${baseUrl}/contacts?limit=50"`
    const verifySnippet = `import { createHmac, timingSafeEqual } from 'node:crypto'

// rawBody — необработанное тело POST-запроса (строка/Buffer, до JSON.parse)
// header — значение заголовка x-fairflow-signature
// secret — «Секрет» REST-интеграции проекта
function verifyWebhook(rawBody, header, secret) {
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(header || '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}`
    return (
        <AdaptiveCard>
            <div className="space-y-4">
                <div>
                    <h5 className="text-sm font-semibold heading-text mb-1">
                        Документация для разработчиков
                    </h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Публичный REST API проекта доступен только для чтения.
                        Передавайте ключ в заголовке{' '}
                        <code className="text-xs">Authorization</code>. Проект
                        определяется по ключу — указывать его в URL не нужно.
                    </p>
                </div>
                <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Базовый URL
                    </span>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs">
                        <code>{baseUrl}</code>
                    </pre>
                    <p className="mt-1 text-xs text-gray-400">
                        Доступные ресурсы:{' '}
                        <code className="text-xs">/contacts</code>,{' '}
                        <code className="text-xs">/deals</code> (GET, пагинация
                        через <code className="text-xs">limit</code>/
                        <code className="text-xs">offset</code>).
                    </p>
                </div>
                <div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Авторизация
                    </span>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-xs">
                        <code>Authorization: Bearer ffk_…</code>
                    </pre>
                    <p className="mt-1 text-xs text-gray-400">
                        Полное значение ключа показывается один раз при
                        генерации. Пустой, неверный или отозванный ключ → 401.
                    </p>
                </div>
                <CodeSnippet
                    label="Пример запроса (список контактов)"
                    code={curlExample}
                />
                <div>
                    <h5 className="text-sm font-semibold heading-text mb-1">
                        Проверка подписи вебхука
                    </h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Каждое событие доставляется POST-запросом с заголовком{' '}
                        <code className="text-xs">x-fairflow-signature</code> в
                        формате <code className="text-xs">sha256=&lt;hex&gt;</code>{' '}
                        — это HMAC-SHA256 сырого тела запроса на «Секрете»
                        REST-интеграции. Сверяйте подпись до обработки:
                    </p>
                    <div className="mt-3">
                        <CodeSnippet
                            label="Node.js"
                            code={verifySnippet}
                        />
                    </div>
                </div>
            </div>
        </AdaptiveCard>
    )
}

/**
 * Project audit event_name → human-readable label. Based on gateway
 * `HISTORY_EVENT_LABELS` and the `crm.*` routing keys (shared/routing-keys.ts).
 * Unknown actions fall back to the raw event name.
 */
const EVENT_LABELS: Record<string, string> = {
    'crm.contact.created': 'Контакт создан',
    'crm.contact.updated': 'Изменены данные контакта',
    'crm.contact.deleted': 'Контакт удалён',
    'crm.contact.restored': 'Контакт восстановлен',
    'crm.contact.merged': 'Контакты объединены',
    'crm.contact.transferred': 'Контакт передан',
    'crm.company.created': 'Компания создана',
    'crm.company.updated': 'Изменены данные компании',
    'crm.company.deleted': 'Компания удалена',
    'crm.company.restored': 'Компания восстановлена',
    'crm.company.merged': 'Компании объединены',
    'crm.company.transferred': 'Компания передана',
    'crm.deal.created': 'Сделка создана',
    'crm.deal.updated': 'Сделка изменена',
    'crm.deal.deleted': 'Сделка удалена',
    'crm.deal.stage_changed': 'Изменена стадия сделки',
    'crm.deal.won': 'Сделка выиграна',
    'crm.deal.lost': 'Сделка проиграна',
    'crm.deal.assigned': 'Сделка назначена',
    'crm.deal.reassigned': 'Сделка переназначена',
    'crm.order.created': 'Заказ создан',
    'crm.order.updated': 'Заказ изменён',
    'crm.order.deleted': 'Заказ удалён',
    'crm.order.status_changed': 'Изменён статус заказа',
    'crm.order.stage_changed': 'Изменён этап заказа',
    'crm.order.cancelled': 'Заказ отменён',
    'crm.order_type.created': 'Создан тип продажи',
    'crm.order_type.updated': 'Изменён тип продажи',
    'crm.order_type.deleted': 'Удалён тип продажи',
    'crm.order_type.archived': 'Тип продажи архивирован',
    'crm.product.created': 'Продукт создан',
    'crm.product.updated': 'Продукт изменён',
    'crm.product.deleted': 'Продукт удалён',
    'crm.product.price_changed': 'Изменена цена продукта',
    'crm.product.archived': 'Продукт архивирован',
    'crm.product.restored': 'Продукт восстановлен',
    'crm.activity.created': 'Создана активность',
    'crm.activity.updated': 'Активность изменена',
    'crm.activity.deleted': 'Активность удалена',
    'crm.activity.completed': 'Активность завершена',
    'crm.activity.reassigned': 'Активность переназначена',
    'crm.import.completed': 'Импорт завершён',
    'chat.message.edited': 'Сообщение изменено',
    'chat.message.deleted': 'Сообщение удалено',
    'module.installed': 'Модуль установлен',
    'module.enabled': 'Модуль включён',
    'module.disabled': 'Модуль выключен',
    'module.uninstalled': 'Модуль удалён из проекта',
    'module.upgraded': 'Модуль обновлён',
    'module.runtime_resumed': 'Доставка модуля возобновлена',
}

/**
 * Журнал проекта отдаёт `event_name` = routing-key (`control.module.enabled`),
 * а RoleAuditLog пишет короткий `action` (`module.enabled`). Оба ключа
 * должны давать человекочитаемый лейбл — иначе пользователь видит сырую строку.
 */
const eventLabel = (action: string) =>
    EVENT_LABELS[action] ?? EVENT_LABELS[action.replace(/^control\./, '')] ?? action

/**
 * BE audit `createdAt` — Unix time в СЕКУНДАХ (напр. 1783424953 = 2026-07-05),
 * а `new Date()` ждёт миллисекунды. Без нормализации все записи журнала
 * показывали 1970 год и ломали фильтр по дате. Строки/ISO пропускаем как есть,
 * числовые эпохи < 1e12 трактуем как секунды (общая конвенция FE: activities/statistics).
 */
const auditDateMs = (value?: string | number): number | null => {
    if (value === undefined || value === null || value === '') return null
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null
        return value > 1e12 ? value : value * 1000
    }
    const asNum = Number(value)
    if (!Number.isNaN(asNum) && value.trim() !== '') {
        return asNum > 1e12 ? asNum : asNum * 1000
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
}

const formatAuditTime = (value?: string | number): string => {
    const ms = auditDateMs(value)
    if (ms === null) return '—'
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const auditActorName = (e: ProjectAuditEntry) => e.name || 'Система'

/** Short human summary from a project audit entry's metadata / entity. */
const describeAudit = (e: ProjectAuditEntry): string => {
    const m = e.metadata ?? {}
    const pick = (...keys: string[]): string => {
        for (const k of keys) {
            const v = m[k]
            if (typeof v === 'string' && v) return v
            if (typeof v === 'number') return String(v)
        }
        return ''
    }
    const name = pick('name', 'title', 'fullName', 'displayName', 'companyName')
    if (name) return name
    const email = pick('email')
    if (email) return email
    const originalText = pick('originalText')
    if (originalText) {
        const preview =
            originalText.length > 80 ? `${originalText.slice(0, 80)}…` : originalText
        return `оригинал: ${preview}`
    }
    if (Array.isArray(m.changedFields) || Array.isArray(m.changes)) {
        const raw = (
            Array.isArray(m.changedFields) ? m.changedFields : m.changes
        ) as Record<string, unknown>[]
        const fields = raw
            .map((c) => (typeof c?.field === 'string' ? c.field : ''))
            .filter(Boolean)
        if (fields.length > 0) return `поля: ${fields.join(', ')}`
    }
    return e.entityType || '—'
}

const roleLabels: Record<string, { label: string; className: string }> = {
    owner: {
        label: 'Владелец',
        className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    },
    admin: {
        label: 'Админ',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    manager: {
        label: 'Менеджер',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    member: {
        label: 'Участник',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    viewer: {
        label: 'Наблюдатель',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    },
}

/* ── SCR-PRJSET-GENERAL — Основное + Опасная зона (FR-MPRJ-21..24) ───────── */

type ProjectGeneral = {
    name: string
    owner: string
    status: 'active' | 'archived' | 'pending_deletion'
}

const GeneralTab = ({ projectId }: { projectId?: string }) => {
    const canManage = usePermission('project', 'manage')
    // T-010: owner приходит из BE как сырой owner_id (UUID). Резолвим в ФИО через
    // список участников проекта (owner всегда участник, members отдаёт имена).
    const { userName: memberName } = useProjectMemberNames(projectId)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [data, setData] = useState<ProjectGeneral | null>(null)
    const [name, setName] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [savedAt, setSavedAt] = useState<number | null>(null)
    const [dialog, setDialog] = useState<null | 'archive' | 'delete'>(null)
    const [confirmName, setConfirmName] = useState('')
    const [actionLoading, setActionLoading] = useState(false)
    const [reload, setReload] = useState(0)
    const [templateId, setTemplateId] = useState('')
    const [templateOptions, setTemplateOptions] = useState<
        Array<{ value: string; label: string }>
    >([])
    const [templateApplying, setTemplateApplying] = useState(false)
    const [templateMessage, setTemplateMessage] = useState<string | null>(null)

    const load = () => setReload((n) => n + 1)

    useEffect(() => {
        if (!projectId) return
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetProject<{
            name?: string
            owner_type?: string
            owner_id?: string
            is_archived?: boolean
            status?: string
            template_id?: string
            templateId?: string
        }>(projectId)
            .then((res) => {
                if (!mounted) return
                const status: ProjectGeneral['status'] =
                    res?.status === 'pending_deletion'
                        ? 'pending_deletion'
                        : res?.is_archived || res?.status === 'archived'
                          ? 'archived'
                          : 'active'
                const next: ProjectGeneral = {
                    name: res?.name ?? '',
                    owner: res?.owner_id ?? '—',
                    status,
                }
                setData(next)
                setName(next.name)
                setTemplateId((res?.template_id ?? res?.templateId ?? '').trim())
            })
            .catch(() => {
                if (mounted) setLoadError('Не удалось загрузить настройки проекта')
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [projectId, reload])

    useEffect(() => {
        let mounted = true
        apiGetProjectTemplates()
            .then((list) => {
                if (!mounted || !Array.isArray(list)) return
                setTemplateOptions(
                    list.map((t) => ({ value: t.id, label: t.name || t.id })),
                )
            })
            .catch(() => undefined)
        return () => {
            mounted = false
        }
    }, [])

    const isArchived = data?.status === 'archived'
    const isPendingDeletion = data?.status === 'pending_deletion'
    const readOnly = !canManage || isArchived || isPendingDeletion
    const dirty = data ? name !== data.name : false
    useUnsavedChangesGuard(dirty, `project-settings:${projectId ?? 'none'}`)
    useRegisterProjectSwitchDirty(`settings-general:${projectId ?? ''}`, dirty)

    const handleApplyTemplate = async () => {
        if (!projectId || !templateId.trim() || readOnly) return
        setTemplateApplying(true)
        setTemplateMessage(null)
        try {
            await apiApplyProjectTemplate(projectId, templateId.trim())
            setTemplateMessage('Шаблон применён: воронка и типы продаж переинициализированы.')
            load()
        } catch {
            setTemplateMessage('Не удалось применить шаблон.')
        } finally {
            setTemplateApplying(false)
        }
    }

    const handleSave = async () => {
        if (!projectId || !dirty) return
        setSaving(true)
        setSaveError(null)
        setSavedAt(null)
        try {
            await apiUpdateProjectSettings(projectId, { name })
            setSavedAt(Date.now())
            setData((prev) => (prev ? { ...prev, name } : prev))
        } catch {
            setSaveError('Не удалось сохранить изменения')
        } finally {
            setSaving(false)
        }
    }

    const runLifecycle = async (fn: () => Promise<unknown>, fail: string) => {
        if (!projectId) return
        setActionLoading(true)
        setSaveError(null)
        try {
            await fn()
            setDialog(null)
            setConfirmName('')
            load()
        } catch {
            setSaveError(fail)
        } finally {
            setActionLoading(false)
        }
    }

    // ST-1 Loading
    if (loading && !data) {
        return (
            <AdaptiveCard
                {...qa('host.projectSettings.general.loading')}
                {...qa('host.projectSettings.generalLoading')}
            >
                <p className="text-sm text-gray-400">Загрузка настроек проекта…</p>
            </AdaptiveCard>
        )
    }

    // ST-6 Error загрузки + retry
    if (loadError) {
        return (
            <AdaptiveCard
                {...qa('host.projectSettings.general.loadError')}
                {...qa('host.projectSettings.generalError')}
            >
                <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                    <Button
                        {...qa('host.projectSettings.general.retry')}
                        size="sm"
                        variant="solid"
                        {...qa('host.projectSettings.retry')}
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    // ST-19 проект не выбран
    if (!projectId) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.general.noProject')}>
                <p className="text-sm text-gray-500">
                    Проект не выбран. Выберите проект в шапке, чтобы открыть настройки.
                </p>
            </AdaptiveCard>
        )
    }

    return (
        <div className="space-y-6">
            {/* ST-22/23 status banner */}
            {(isArchived || isPendingDeletion) && (
                <Alert
                    {...qa('host.projectSettings.general.statusAlert')}
                    showIcon
                    type={isPendingDeletion ? 'danger' : 'warning'}
                    {...qa('host.projectSettings.statusBanner')}
                >
                    {isPendingDeletion
                        ? 'Проект помечен на удаление. Настройки доступны только для чтения; восстановить можно из списка проектов.'
                        : 'Проект в архиве. Настройки доступны только для чтения. Разархивируйте проект, чтобы редактировать.'}
                </Alert>
            )}

            <AdaptiveCard {...qa('host.projectSettings.general')}>
                <h3 className="text-lg font-semibold mb-4">Основная информация</h3>
                <div className="max-w-lg space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Название проекта</label>
                        <Input
                            {...qa('host.projectSettings.general.name')}
                            disabled={readOnly}
                            value={name}
                            {...qa('host.projectSettings.name')}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Владелец проекта</label>
                        <Input
                            {...qa('host.projectSettings.general.owner')}
                            disabled
                            value={
                                (data?.owner ? memberName(data.owner) : undefined) ??
                                data?.owner ??
                                '—'
                            }
                        />
                    </div>
                </div>
                <div className="mt-6 flex items-center justify-end gap-3">
                    {saveError && (
                        <span
                            {...qa('host.projectSettings.general.saveError')}
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {saveError}
                        </span>
                    )}
                    {savedAt && !saveError && (
                        <span
                            {...qa('host.projectSettings.general.savedAt')}
                            className="text-sm text-emerald-600 dark:text-emerald-400"
                            {...qa('host.projectSettings.saved')}
                        >
                            Сохранено
                        </span>
                    )}
                    {/* ST-12 element-gating: hidden without project:manage */}
                    {!readOnly && (
                        <Button
                            {...qa('host.projectSettings.general.save')}
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={!dirty}
                            {...qa('host.projectSettings.save')}
                            onClick={handleSave}
                        >
                            Сохранить
                        </Button>
                    )}
                </div>
            </AdaptiveCard>

            {!readOnly && (
                <AdaptiveCard>
                    <h3 className="text-lg font-semibold mb-2">Шаблон проекта</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Повторно применить шаблон онбординга: переинициализирует воронку и типы
                        продаж по текущему набору модулей (идемпотентно).
                    </p>
                    <div className="max-w-lg space-y-3">
                        <div {...qa('host.projectSettings.templateSelect')}>
                            <Select
                                {...qa('host.projectSettings.general.templateSelect')}
                                value={templateOptions.find((o) => o.value === templateId)}
                                placeholder="Выберите шаблон"
                                options={templateOptions}
                                onChange={(opt) => setTemplateId(opt?.value ?? '')}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                {...qa('host.projectSettings.general.applyTemplate')}
                                size="sm"
                                variant="solid"
                                loading={templateApplying}
                                disabled={!templateId.trim()}
                                {...qa('host.projectSettings.applyTemplate')}
                                onClick={() => void handleApplyTemplate()}
                            >
                                Применить шаблон
                            </Button>
                            {templateMessage && (
                                <span
                                    {...qa('host.projectSettings.general.templateMessage')}
                                    className="text-sm text-gray-600 dark:text-gray-400"
                                >
                                    {templateMessage}
                                </span>
                            )}
                        </div>
                    </div>
                </AdaptiveCard>
            )}

            {/* Опасная зона — owner-only (gated by project:manage skeleton). */}
            <PermissionCheck subject="project" action="manage">
                <Card {...qa('host.projectSettings.general.dangerZone')} className="border-red-200 dark:border-red-900">
                    <div className="p-6">
                        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                            Опасная зона
                        </h3>
                        <div className="space-y-3">
                            {isArchived ? (
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                        Разархивация вернёт проект в список активных.
                                    </p>
                                    <Button
                                        {...qa('host.projectSettings.general.unarchive')}
                                        variant="solid"
                                        color="primary"
                                        loading={actionLoading}
                                        {...qa('host.projectSettings.unarchive')}
                                        onClick={() =>
                                            runLifecycle(
                                                () => apiUnarchiveProject(projectId),
                                                'Не удалось разархивировать проект',
                                            )
                                        }
                                    >
                                        Разархивировать
                                    </Button>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                        Архивация проекта скроет его из списка активных проектов, но сохранит все данные.
                                    </p>
                                    <Button
                                        {...qa('host.projectSettings.general.archive')}
                                        variant="solid"
                                        color="warning"
                                        icon={<PiArchiveDuotone />}
                                        disabled={isPendingDeletion}
                                        {...qa('host.projectSettings.archive')}
                                        onClick={() => setDialog('archive')}
                                    >
                                        Архивировать
                                    </Button>
                                </div>
                            )}
                            <div className="pt-3 border-t">
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    Удаление проекта переводит его в корзину на период хранения, после чего данные удаляются безвозвратно.
                                </p>
                                <Button
                                    {...qa('host.projectSettings.general.delete')}
                                    variant="solid"
                                    color="danger"
                                    icon={<PiTrashDuotone />}
                                    disabled={isPendingDeletion}
                                    {...qa('host.projectSettings.delete')}
                                    onClick={() => setDialog('delete')}
                                >
                                    Удалить проект
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            </PermissionCheck>

            {/* SCR-PROJ-ARCHIVE-DIALOG */}
            <ConfirmDialog
                isOpen={dialog === 'archive'}
                type="warning"
                title="Архивировать проект?"
                {...qa('host.projectSettings.general.archiveDialog')}
                confirmButtonProps={{
                    ...qa('host.projectSettings.general.archiveConfirm'),
                    loading: actionLoading,
                    ...qa('host.projectSettings.archiveConfirm'),
                }}
                cancelButtonProps={qa('host.projectSettings.archiveCancel')}
                confirmText="Архивировать"
                cancelText="Отмена"
                {...qa('host.projectSettings.archiveDialog')}
                onClose={() => setDialog(null)}
                onRequestClose={() => setDialog(null)}
                onCancel={() => setDialog(null)}
                onConfirm={() =>
                    runLifecycle(
                        () => apiArchiveProject(projectId),
                        'Не удалось архивировать проект',
                    )
                }
            >
                <p>
                    Проект «{data?.name}» будет скрыт из списка активных. Данные
                    сохранятся, разархивировать можно в любой момент.
                </p>
                {saveError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                        {saveError}
                    </p>
                )}
            </ConfirmDialog>

            {/* SCR-PROJ-DELETE-DIALOG — требует ввод имени */}
            <ConfirmDialog
                isOpen={dialog === 'delete'}
                type="danger"
                title="Удалить проект?"
                {...qa('host.projectSettings.general.deleteDialog')}
                confirmButtonProps={{
                    ...qa('host.projectSettings.general.deleteConfirm'),
                    loading: actionLoading,
                    disabled: confirmName !== data?.name,
                    ...qa('host.projectSettings.deleteConfirm'),
                }}
                cancelButtonProps={qa('host.projectSettings.deleteCancel')}
                confirmText="Удалить"
                cancelText="Отмена"
                {...qa('host.projectSettings.deleteDialog')}
                onClose={() => {
                    setDialog(null)
                    setConfirmName('')
                }}
                onRequestClose={() => {
                    setDialog(null)
                    setConfirmName('')
                }}
                onCancel={() => {
                    setDialog(null)
                    setConfirmName('')
                }}
                onConfirm={() =>
                    runLifecycle(
                        () => apiDeleteProject(projectId, confirmName),
                        'Не удалось удалить проект',
                    )
                }
            >
                <p className="mb-3">
                    Проект «{data?.name}» будет перемещён в корзину. Для подтверждения
                    введите его название.
                </p>
                <Input
                    {...qa('host.projectSettings.general.confirmName')}
                    placeholder={data?.name}
                    value={confirmName}
                    {...qa('host.projectSettings.deleteConfirmName')}
                    onChange={(e) => setConfirmName(e.target.value)}
                />
                {saveError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                        {saveError}
                    </p>
                )}
            </ConfirmDialog>
        </div>
    )
}

type ModuleMeta = {
    id: string
    name: string
    description: string
    locked: boolean
    dependencies: string[]
    integrationMethods: Array<{ id: string; name: string; description?: string }>
    personalSettingsSchema: Record<string, unknown>
    integrationSettingsSchema: Record<string, unknown>
}

type ModulesTabState = {
    selectedModuleId: string
    moduleConfigs: ProjectModuleConfig[]
    modulePolicies: ProjectModulePolicyRule[]
}

const createDefaultModuleConfig = (moduleId: string, enabled: boolean): ProjectModuleConfig => ({
    moduleId,
    enabled,
    personalSettings: {},
    integrationSettings: {},
    integrationMethodsEnabled: [],
})

export const ModulesTab = ({ projectId, moduleRegistry }: { projectId?: string; moduleRegistry: ModuleMeta[] }) => {
    // TODO-447: состав модулей меняет `PATCH /v1/projects/:id`, закрытый на
    // gateway `@RequirePermission('project','manage')`. Гейтим тем же правом —
    // иначе рядовой участник щёлкает тумблер и получает 403.
    const canManage = usePermission('project', 'manage')
    const currentProject = useProjectStore((s) => s.currentProject)
    const currentProjectId = useProjectStore((s) => s.currentProjectId)
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
    const setUser = useSessionUser((s) => s.setUser)
    const userProjects = useSessionUser((s) => s.user.projects)
    const refreshModules = useRefreshModules()
    const enabledModuleIds = useChromeModuleKeys()
    const enabledModules = enabledModuleIds
    const [saving, setSaving] = useState(false)
    const [personalErrors, setPersonalErrors] = useState<Record<string, string>>({})
    const [integrationErrors, setIntegrationErrors] = useState<Record<string, string>>({})
    const [lifecycleStates, setLifecycleStates] = useState<Record<string, ProjectModuleState>>({})
    const [lifecycleBusy, setLifecycleBusy] = useState(false)
    const [upgradePreview, setUpgradePreview] = useState<ModuleUpgradePreview | null>(null)
    const [disableImpactPreview, setDisableImpactPreview] = useState<{
        moduleId: string
        moduleName: string
        loading?: boolean
        error?: boolean
        dependentEnabledModules: Array<{ id: string; name: string }>
        unfinishedRecords: number
        stoppedAutomations: Array<{ id: string; name: string }>
        webhookDlqSuspended?: boolean
    } | null>(null)
    const [resumeDeliveryFate, setResumeDeliveryFate] = useState<'discard' | 'deliver' | null>(null)
    const [dealsDisablePreview, setDealsDisablePreview] = useState<{
        loading?: boolean
        error?: boolean
        cascadeModules: Array<{ id: string; name: string }>
        openDealCount: number | null
    } | null>(null)
    const [enablePreview, setEnablePreview] = useState<{
        moduleId: string
        moduleName: string
        autoEnabled: Array<{ id: string; name: string; dependencies: string[] }>
    } | null>(null)
    const [enableImpactPreview, setEnableImpactPreview] = useState<{
        moduleId: string
        moduleName: string
        loading?: boolean
        error?: boolean
        cascadeModules: Array<{ id: string; name: string }>
    } | null>(null)
    const [state, setState] = useState<ModulesTabState>({
        selectedModuleId: moduleRegistry[0]?.id ?? 'deals',
        moduleConfigs: [],
        modulePolicies: [],
    })

    useEffect(() => {
        if (moduleRegistry.length === 0) return
        const moduleConfigsFromProject = currentProject?.moduleConfigs
        const normalizedConfigs: ProjectModuleConfig[] = moduleRegistry.map((m) => {
            const existing = moduleConfigsFromProject?.find((cfg) => cfg.moduleId === m.id)
            if (existing) return existing
            return createDefaultModuleConfig(m.id, enabledModules.includes(m.id))
        })
        setState((prev) => ({
            selectedModuleId:
                moduleRegistry.find((m) => m.id === prev.selectedModuleId)?.id ??
                moduleRegistry[0]?.id ??
                'deals',
            moduleConfigs: normalizedConfigs,
            modulePolicies: currentProject?.modulePolicies ?? [],
        }))
    }, [currentProject, enabledModules, moduleRegistry])

    const loadLifecycleStates = useCallback(async () => {
        // FR-PLATFORM-250 / FR-LIFE-36: matrix is membership-scoped read.
        // Mutations stay manage-gated; observers must still see states.
        if (!projectId) return
        try {
            const rows = await apiListProjectModuleStates(projectId)
            const map: Record<string, ProjectModuleState> = {}
            for (const row of Array.isArray(rows) ? rows : []) {
                if (row?.module_id) map[row.module_id] = row
            }
            setLifecycleStates(map)
        } catch {
            // Failed load leaves toggles/settings usable from the project snapshot.
        }
    }, [projectId])

    useEffect(() => {
        loadLifecycleStates()
    }, [loadLifecycleStates])

    if (moduleRegistry.length === 0) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.modules.registryStub')}>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Реестр модулей недоступен. Проверьте доступность API `/api/v1/modules/registry`.
                </p>
            </AdaptiveCard>
        )
    }

    const syncAuthStore = (
        pid: string,
        modules: string[],
        moduleConfigs: ProjectModuleConfig[],
        modulePolicies: ProjectModulePolicyRule[],
    ) => {
        if (!userProjects) return
        const updated = userProjects.map((p) =>
            p.id === pid
                ? {
                      ...p,
                      enabledModules: modules,
                      effectiveModules: modules,
                      moduleConfigs,
                      modulePolicies,
                  }
                : p,
        )
        setUser({ projects: updated })
    }

    /**
     * Сохранить состав/настройки модулей.
     *
     * TODO-241: `nextPolicies` НЕОБЯЗАТЕЛЕН и по умолчанию НЕ отправляется.
     * control при `data.modulePolicies != null` перезаписывает весь набор правил
     * проекта (projects.service.ts), поэтому ре-сабмит клиентского снимка при
     * каждом щелчке тумблера затирал политики, добавленные кем-то другим между
     * загрузкой страницы и сохранением. Состав модулей и политики — разные
     * операции PATCH; gateway принимает частичное тело (toGrpcModulePolicies
     * возвращает undefined для отсутствующего поля).
     *
     * TODO-242: ошибка больше не проглатывается — оптимистичный локальный стейт
     * откатывается на снимок «до», и пользователь видит причину.
     */
    const persistState = async (
        nextConfigs: ProjectModuleConfig[],
        nextPolicies?: ProjectModulePolicyRule[],
        opts?: { cascade?: boolean },
    ): Promise<boolean> => {
        if (!projectId) return false
        // Снимок «до» для отката: тумблер переключается оптимистично ДО await,
        // и при 403/5xx он обязан вернуться в положение, которое реально на сервере.
        const prevConfigs = state.moduleConfigs
        const prevPolicies = state.modulePolicies
        setSaving(true)
        try {
            const modulesFromConfigs = nextConfigs
                .filter((cfg) => cfg.enabled)
                .map((cfg) => cfg.moduleId)
            const res = await apiUpdateProjectSettings(projectId, {
                modules: modulesFromConfigs,
                moduleConfigs: nextConfigs,
                ...(nextPolicies ? { modulePolicies: nextPolicies } : {}),
                ...(opts?.cascade ? { cascade: true } : {}),
            })
            const proj = useProjectStore.getState().currentProject
            const updatedModules = res?.effective_modules ?? res?.modules ?? modulesFromConfigs
            const responseConfigs: ProjectModuleConfig[] =
                res?.module_configs?.map((cfg) => ({
                    moduleId: cfg.module_id ?? '',
                    enabled: cfg.enabled ?? false,
                    personalSettings: cfg.personal_settings ?? {},
                    integrationSettings: cfg.integration_settings ?? {},
                    integrationMethodsEnabled: cfg.integration_methods_enabled ?? [],
                })) ?? nextConfigs
            const responsePolicies: ProjectModulePolicyRule[] =
                res?.module_policies?.map((rule) => ({
                    id: rule.id ?? '',
                    moduleId: rule.module_id ?? '',
                    effect: rule.effect === 'deny' ? 'deny' : 'allow',
                    subject: rule.subject ?? '',
                    action: rule.action ?? '',
                    resource: rule.resource ?? '*',
                    condition: rule.condition ?? {},
                })) ??
                nextPolicies ??
                state.modulePolicies

            if (proj) {
                setCurrentProject({
                    ...proj,
                    enabledModules: updatedModules,
                    moduleConfigs: responseConfigs,
                    modulePolicies: responsePolicies,
                    effectiveModules: updatedModules,
                })
            } else {
                setCurrentProject({
                    id: projectId,
                    name: '',
                    enabledModules: updatedModules,
                    moduleConfigs: responseConfigs,
                    modulePolicies: responsePolicies,
                    effectiveModules: updatedModules,
                })
            }
            syncAuthStore(projectId, updatedModules, responseConfigs, responsePolicies)
            setState((prev) => ({
                ...prev,
                moduleConfigs: responseConfigs,
                modulePolicies: responsePolicies,
            }))
            // E1-12 / FR-SHELL-12/13 (T-004): rebuild navigation, routes,
            // mount-point slots and Contextual UI LIVE — no page reload. Nav
            // (useNavigationConfig) and slots (useSlotContributions) both derive
            // from the platform-modules cache. Pass the new enablement as an
            // OPTIMISTIC patch so that cache flips in the same render pass and the
            // sidebar rebuilds immediately, then revalidate to reconcile with be
            // (a bare revalidate would leave the menu stale until the endpoint
            // reflects the just-persisted change).
            void refreshModules(projectId, { enabledModuleIds: updatedModules })
            return true
        } catch (e) {
            // TODO-242: откат оптимистичного стейта + человекочитаемая причина.
            setState((prev) => ({
                ...prev,
                moduleConfigs: prevConfigs,
                modulePolicies: prevPolicies,
            }))
            notify(moduleSaveErrorMessage(e), 'danger')
            return false
        } finally {
            setSaving(false)
        }
    }

    const selectedModule = moduleRegistry.find((m) => m.id === state.selectedModuleId) ?? moduleRegistry[0]
    const selectedConfig =
        state.moduleConfigs.find((cfg) => cfg.moduleId === state.selectedModuleId) ??
        createDefaultModuleConfig(state.selectedModuleId, enabledModules.includes(state.selectedModuleId))
    const updateSelectedConfig = (
        updater: (config: ProjectModuleConfig) => ProjectModuleConfig,
    ) => {
        const nextConfigs = state.moduleConfigs.map((cfg) =>
            cfg.moduleId === state.selectedModuleId ? updater(cfg) : cfg,
        )
        setState((prev) => ({ ...prev, moduleConfigs: nextConfigs }))
    }

    const applyModuleEnable = async (moduleId: string) => {
        if (!projectId) return
        const prevConfigs = state.moduleConfigs
        const nextConfigs = prevConfigs.map((cfg) =>
            cfg.moduleId === moduleId ? { ...cfg, enabled: true } : cfg,
        )
        setState((prev) => ({ ...prev, moduleConfigs: nextConfigs }))
        const ok = await runLifecycleAction(
            'Модуль включён',
            () => apiEnableProjectModule(projectId, moduleId),
        )
        if (!ok) {
            setState((prev) => ({ ...prev, moduleConfigs: prevConfigs }))
        }
    }

    const requestEnableImpactPreview = async (moduleId: string, moduleName: string) => {
        if (!projectId) return
        setEnableImpactPreview({
            moduleId,
            moduleName,
            loading: true,
            cascadeModules: [],
        })
        try {
            const preview = await apiGetModuleEnableImpact(projectId, moduleId)
            const cascadeModules = preview.cascadeModules ?? []
            if (cascadeModules.length === 0) {
                await applyModuleEnable(moduleId)
                setEnableImpactPreview(null)
                return
            }
            setEnableImpactPreview({
                moduleId,
                moduleName,
                cascadeModules,
            })
        } catch {
            setEnableImpactPreview({
                moduleId,
                moduleName,
                error: true,
                cascadeModules: [],
            })
        }
    }

    const beginModuleEnable = async (moduleId: string, moduleName: string) => {
        // FR-PROJ-300: client-side transitive dependency preview.
        const enabledSet = new Set(
            state.moduleConfigs.filter((c) => c.enabled).map((c) => c.moduleId),
        )
        const autoEnabled = computeAutoEnabledModules(moduleId, enabledSet, moduleRegistry)
        if (autoEnabled.length > 0) {
            setEnablePreview({ moduleId, moduleName, autoEnabled })
            return
        }
        // FR-PSET-050: server-side hard-dependency cascade preview.
        await requestEnableImpactPreview(moduleId, moduleName)
    }

    const toggleModule = async (moduleId: string) => {
        if (!canManage) return
        const cfg = state.moduleConfigs.find((c) => c.moduleId === moduleId)
        const turningOff = cfg?.enabled
        const mod = moduleRegistry.find((m) => m.id === moduleId)

        // SCR-DEALS-DISABLE-CASCADE-DIALOG: deals-specific cascade + open-deal count.
        if (turningOff && moduleId === 'deals' && !mod?.locked && projectId) {
            setDealsDisablePreview({
                loading: true,
                cascadeModules: [],
                openDealCount: null,
            })
            try {
                const preview = await apiGetDealsDisableCascadePreview(projectId)
                setDealsDisablePreview({
                    cascadeModules: preview.cascadeModules ?? [],
                    openDealCount: preview.openDealCount,
                })
            } catch {
                setDealsDisablePreview({
                    error: true,
                    cascadeModules: [],
                    openDealCount: null,
                })
            }
            return
        }

        if (turningOff && !mod?.locked && projectId) {
            setDisableImpactPreview({
                moduleId,
                moduleName: mod?.name ?? moduleId,
                loading: true,
                dependentEnabledModules: [],
                unfinishedRecords: -1,
                stoppedAutomations: [],
            })
            try {
                const preview = await apiGetModuleDisableImpact(projectId, moduleId)
                setDisableImpactPreview({
                    moduleId,
                    moduleName: mod?.name ?? moduleId,
                    dependentEnabledModules: preview.dependentEnabledModules ?? [],
                    unfinishedRecords: preview.unfinishedRecords ?? -1,
                    stoppedAutomations: preview.stoppedAutomations ?? [],
                    webhookDlqSuspended: preview.webhookDlqSuspended === true,
                })
            } catch {
                setDisableImpactPreview({
                    moduleId,
                    moduleName: mod?.name ?? moduleId,
                    error: true,
                    dependentEnabledModules: [],
                    unfinishedRecords: -1,
                    stoppedAutomations: [],
                })
            }
            return
        }

        // FR-PROJ-300 + FR-PSET-050: preview dependencies before enabling.
        if (!turningOff && !mod?.locked && projectId) {
            await beginModuleEnable(moduleId, mod?.name ?? moduleId)
            return
        }

        const prevConfigs = state.moduleConfigs
        const nextConfigs = prevConfigs.map((cfg) =>
            cfg.moduleId === moduleId ? { ...cfg, enabled: !cfg.enabled } : cfg,
        )
        setState((prev) => ({ ...prev, moduleConfigs: nextConfigs }))
        if (!projectId || turningOff) return
        const ok = await runLifecycleAction(
            'Модуль включён',
            () => apiEnableProjectModule(projectId, moduleId),
        )
        if (!ok) {
            setState((prev) => ({ ...prev, moduleConfigs: prevConfigs }))
        }
    }

    const confirmModuleDisable = async () => {
        if (!disableImpactPreview || !projectId) return
        const { moduleId } = disableImpactPreview
        setDisableImpactPreview(null)
        const nextConfigs = state.moduleConfigs.map((cfg) =>
            cfg.moduleId === moduleId ? { ...cfg, enabled: false } : cfg,
        )
        setState((prev) => ({ ...prev, moduleConfigs: nextConfigs }))
        const ok = await runLifecycleAction(
            'Модуль выключен',
            () => apiDisableProjectModule(projectId, moduleId, { cascade: true }),
        )
        if (!ok) {
            setState((prev) => ({ ...prev, moduleConfigs: state.moduleConfigs }))
        }
    }

    const confirmModuleEnablePreview = async () => {
        if (!enablePreview) return
        const { moduleId, moduleName } = enablePreview
        setEnablePreview(null)
        await requestEnableImpactPreview(moduleId, moduleName)
    }

    const confirmDealsDisable = async () => {
        if (!projectId) return
        setDealsDisablePreview(null)
        const nextConfigs = state.moduleConfigs.map((cfg) =>
            cfg.moduleId === 'deals' ? { ...cfg, enabled: false } : cfg,
        )
        setState((prev) => ({ ...prev, moduleConfigs: nextConfigs }))
        const ok = await runLifecycleAction(
            'Модуль выключен',
            () => apiDisableProjectModule(projectId, 'deals', { cascade: true }),
        )
        if (!ok) {
            setState((prev) => ({ ...prev, moduleConfigs: state.moduleConfigs }))
        }
    }

    const confirmModuleEnableCascade = async () => {
        if (!enableImpactPreview) return
        const { moduleId } = enableImpactPreview
        setEnableImpactPreview(null)
        await applyModuleEnable(moduleId)
    }

    const runLifecycleAction = async (
        label: string,
        action: () => Promise<unknown>,
    ): Promise<boolean> => {
        if (!projectId || !canManage) return false
        setLifecycleBusy(true)
        try {
            await action()
            await loadLifecycleStates()
            const proj = await apiGetProject<{
                modules?: string[]
                effective_modules?: string[]
                module_configs?: Array<{
                    module_id?: string
                    enabled?: boolean
                    personal_settings?: Record<string, unknown>
                    integration_settings?: Record<string, unknown>
                    integration_methods_enabled?: string[]
                    runtime_status?: 'active' | 'suspended'
                    ever_suspended?: boolean
                    config_state?: 'ready' | 'needs_config'
                }>
            }>(projectId)
            const mappedConfigs: ProjectModuleConfig[] =
                proj?.module_configs?.map((cfg) => ({
                    moduleId: cfg.module_id ?? '',
                    enabled: cfg.enabled ?? false,
                    personalSettings: cfg.personal_settings ?? {},
                    integrationSettings: cfg.integration_settings ?? {},
                    integrationMethodsEnabled: cfg.integration_methods_enabled ?? [],
                    ...(cfg.runtime_status === 'active' ||
                    cfg.runtime_status === 'suspended'
                        ? { runtimeStatus: cfg.runtime_status }
                        : {}),
                    ...(cfg.ever_suspended ? { everSuspended: true } : {}),
                    ...(cfg.config_state === 'ready' ||
                    cfg.config_state === 'needs_config'
                        ? { configState: cfg.config_state }
                        : {}),
                })) ?? []
            const fromProj = proj?.effective_modules ?? proj?.modules
            const fromConfigs = mappedConfigs
                .filter((c) => c.enabled)
                .map((c) => c.moduleId)
            const updatedModules =
                fromProj && fromProj.length > 0
                    ? fromProj
                    : fromConfigs.length > 0
                      ? fromConfigs
                      : null
            const live = useProjectStore.getState().currentProject
            const nextConfigs = mappedConfigs.length
                ? mappedConfigs
                : (live?.moduleConfigs ?? state.moduleConfigs)
            const nextPolicies = live?.modulePolicies ?? state.modulePolicies
            if (live) {
                setCurrentProject({
                    ...live,
                    ...(updatedModules
                        ? {
                              enabledModules: updatedModules,
                              effectiveModules: updatedModules,
                          }
                        : {}),
                    moduleConfigs: nextConfigs,
                    modulePolicies: nextPolicies,
                })
            }
            if (updatedModules) {
                syncAuthStore(projectId, updatedModules, nextConfigs, nextPolicies)
                void refreshModules(projectId, { enabledModuleIds: updatedModules })
            } else {
                void refreshModules(projectId)
            }
            notify(label, 'success')
            return true
        } catch (e) {
            notify(moduleSaveErrorMessage(e), 'danger')
            return false
        } finally {
            setLifecycleBusy(false)
        }
    }

    const selectedLifecycle = lifecycleStates[state.selectedModuleId]
    const selectedRuntimeSuspended =
        selectedLifecycle?.enabled &&
        (selectedLifecycle.runtime_status === 'suspended' ||
            state.moduleConfigs.find((c) => c.moduleId === state.selectedModuleId)
                ?.runtimeStatus === 'suspended')
    const selectedNeedsConfig =
        selectedLifecycle?.config_state === 'needs_config' ||
        state.moduleConfigs.find((c) => c.moduleId === state.selectedModuleId)?.configState ===
            'needs_config'

    const confirmResumeDelivery = async () => {
        if (!projectId || !selectedModule || !resumeDeliveryFate) return
        const fate = resumeDeliveryFate
        setResumeDeliveryFate(null)
        const key = newIdempotencyKey()
        await runLifecycleAction('Доставка возобновлена', () =>
            apiResumeModuleDelivery(projectId, selectedModule.id, fate, key),
        )
    }

    const executeUpgrade = async (confirmMajor = false) => {
        if (!projectId || !selectedModule || !selectedLifecycle) return false
        return runLifecycleAction('Модуль обновлён', () =>
            apiUpgradeProjectModule(projectId, selectedModule.id, {
                toVersion: selectedLifecycle.latest_version,
                confirmMajor,
            }),
        )
    }

    const requestUpgrade = async () => {
        if (!projectId || !selectedModule || !selectedLifecycle) return
        setLifecycleBusy(true)
        try {
            const preview = await apiPreviewUpgradeProjectModule(
                projectId,
                selectedModule.id,
                { toVersion: selectedLifecycle.latest_version },
            )
            if (preview.requires_confirmation) {
                setUpgradePreview(preview)
                return
            }
            await executeUpgrade(false)
        } catch (e) {
            notify(moduleSaveErrorMessage(e), 'danger')
        } finally {
            setLifecycleBusy(false)
        }
    }

    const confirmUpgrade = async () => {
        setUpgradePreview(null)
        await executeUpgrade(true)
    }

    const hasSettingsErrors =
        Object.keys(personalErrors).length > 0 || Object.keys(integrationErrors).length > 0

    const handleSaveSelected = async () => {
        if (hasSettingsErrors) {
            notify('Исправьте ошибки в настройках модуля перед сохранением', 'danger')
            return
        }
        // TODO-241: сохраняются настройки модуля, а не набор политик проекта.
        await persistState(state.moduleConfigs)
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* TODO-447 — ST-10: без project:manage вкладка read-only, а не «щёлкает и молчит». */}
            {!canManage && (
                <div className="xl:col-span-3">
                    <Alert {...qa('host.projectSettings.modules.readOnlyAlert')} showIcon type="info">
                        Просмотр состава модулей. Изменять его может только участник
                        с правом «Управление проектом» (project:manage).
                    </Alert>
                </div>
            )}
            <div className="space-y-4 xl:col-span-1">
                {moduleRegistry.map((module) => (
                    <Card
                        key={module.id}
                        {...qa('host.projectSettings.module', { module: module.id })}
                        className={
                            state.selectedModuleId === module.id
                                ? 'ring-1 ring-blue-300 dark:ring-blue-700'
                                : undefined
                        }
                    >
                        <div className="flex items-start justify-between gap-3">
                            <button
                                type="button"
                                className="text-left flex-1"
                                onClick={() =>
                                    setState((prev) => ({ ...prev, selectedModuleId: module.id }))
                                }
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold">{module.name}</h4>
                                    {module.locked && (
                                        <PiLockDuotone className="w-4 h-4 text-gray-400" />
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {module.description}
                                </p>
                            </button>
                            <Switcher
                                {...qa('host.projectSettings.moduleToggle', {
                                    module: module.id,
                                })}
                                checked={
                                    state.moduleConfigs.find((cfg) => cfg.moduleId === module.id)
                                        ?.enabled ?? enabledModules.includes(module.id)
                                }
                                disabled={module.locked || saving || !canManage}
                                onChange={() =>
                                    !module.locked && canManage && toggleModule(module.id)
                                }
                            />
                        </div>
                    </Card>
                ))}
            </div>

            <ConfirmDialog
                isOpen={upgradePreview !== null}
                type="warning"
                title="Подтвердите major-обновление модуля"
                {...qa('host.projectSettings.modules.upgradeDialog')}
                confirmText="Обновить"
                cancelText="Отмена"
                onClose={() => setUpgradePreview(null)}
                onRequestClose={() => setUpgradePreview(null)}
                onCancel={() => setUpgradePreview(null)}
                onConfirm={() => void confirmUpgrade()}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {upgradePreview
                        ? `Модуль «${selectedModule?.name ?? upgradePreview.module_id}» будет обновлён с ${upgradePreview.from_version} до ${upgradePreview.to_version} (класс: ${upgradePreview.upgrade_class}).`
                        : ''}
                    {upgradePreview?.migration_required
                        ? ' Могут потребоваться миграции данных.'
                        : ''}
                </p>
            </ConfirmDialog>

            <ModuleDisableImpactDialog
                preview={disableImpactPreview}
                onClose={() => setDisableImpactPreview(null)}
                onConfirm={() => void confirmModuleDisable()}
            />

            <ModuleEnablePreviewDialog
                preview={enablePreview}
                onClose={() => setEnablePreview(null)}
                onConfirm={() => void confirmModuleEnablePreview()}
            />

            <ModuleEnableCascadeDialog
                preview={enableImpactPreview}
                onClose={() => setEnableImpactPreview(null)}
                onConfirm={() => void confirmModuleEnableCascade()}
            />

            <ConfirmDialog
                isOpen={resumeDeliveryFate !== null}
                type="warning"
                title="Возобновить доставку модуля"
                {...qa('host.projectSettings.modules.resumeDialog')}
                confirmText={resumeDeliveryFate === 'deliver' ? 'Доставить из DLQ' : 'Отбросить DLQ'}
                cancelText="Отмена"
                onClose={() => setResumeDeliveryFate(null)}
                onRequestClose={() => setResumeDeliveryFate(null)}
                onCancel={() => setResumeDeliveryFate(null)}
                onConfirm={() => void confirmResumeDelivery()}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {resumeDeliveryFate === 'deliver'
                        ? 'Накопленные в DLQ события будут поставлены в очередь на повторную доставку.'
                        : 'Накопленные в DLQ события будут отброшены без доставки.'}
                </p>
            </ConfirmDialog>

            <DealsDisableCascadeDialog
                preview={dealsDisablePreview}
                onClose={() => setDealsDisablePreview(null)}
                onConfirm={() => void confirmDealsDisable()}
            />

            <div className="space-y-4 xl:col-span-2">
                <AdaptiveCard>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="font-semibold">{selectedModule?.name}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedModule?.description}
                                </p>
                                {selectedLifecycle && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        Версия {selectedLifecycle.version}
                                        {selectedLifecycle.upgrade_available
                                            ? ` (доступна ${selectedLifecycle.latest_version})`
                                            : ''}
                                        {selectedLifecycle.installed ? ' · установлен' : ' · не установлен'}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {canManage && selectedModule && selectedLifecycle && (
                                    <>
                                        {!selectedLifecycle.installed && !selectedModule.locked && (
                                            <Button
                                                {...qa('host.projectSettings.modules.install', {
                                                    module: selectedModule.id,
                                                })}
                                                size="sm"
                                                variant="default"
                                                loading={lifecycleBusy}
                                                onClick={() =>
                                                    runLifecycleAction(
                                                        'Модуль установлен',
                                                        () =>
                                                            apiInstallProjectModule(
                                                                projectId!,
                                                                selectedModule.id,
                                                            ),
                                                    )
                                                }
                                            >
                                                Установить
                                            </Button>
                                        )}
                                        {selectedLifecycle.installed &&
                                            !selectedLifecycle.enabled &&
                                            !selectedModule.locked && (
                                                <Button
                                                    {...qa('host.projectSettings.modules.uninstall', {
                                                        module: selectedModule.id,
                                                    })}
                                                    size="sm"
                                                    variant="plain"
                                                    loading={lifecycleBusy}
                                                    onClick={() =>
                                                        runLifecycleAction(
                                                            'Модуль удалён из проекта',
                                                            () =>
                                                                apiUninstallProjectModule(
                                                                    projectId!,
                                                                    selectedModule.id,
                                                                ),
                                                        )
                                                    }
                                                >
                                                    Удалить установку
                                                </Button>
                                            )}
                                        {selectedLifecycle.upgrade_available &&
                                            selectedLifecycle.installed && (
                                                <Button
                                                    {...qa('host.projectSettings.modules.upgrade', {
                                                        module: selectedModule.id,
                                                    })}
                                                    size="sm"
                                                    variant="default"
                                                    loading={lifecycleBusy}
                                                    onClick={() => void requestUpgrade()}
                                                >
                                                    Обновить
                                                </Button>
                                            )}
                                        {selectedRuntimeSuspended && selectedNeedsConfig === false && (
                                            <>
                                                <Button
                                                    {...qa('host.projectSettings.modules.resumeDeliver', {
                                                        module: selectedModule.id,
                                                    })}
                                                    size="sm"
                                                    variant="default"
                                                    loading={lifecycleBusy}
                                                    onClick={() => setResumeDeliveryFate('deliver')}
                                                >
                                                    Возобновить доставку
                                                </Button>
                                                <Button
                                                    {...qa('host.projectSettings.modules.resumeDiscard', {
                                                        module: selectedModule.id,
                                                    })}
                                                    size="sm"
                                                    variant="plain"
                                                    loading={lifecycleBusy}
                                                    onClick={() => setResumeDeliveryFate('discard')}
                                                >
                                                    Возобновить без DLQ
                                                </Button>
                                            </>
                                        )}
                                    </>
                                )}
                                {canManage && (
                                    <Button
                                        {...qa('host.projectSettings.modules.saveSettings', {
                                            module: selectedModule?.id ?? state.selectedModuleId,
                                        })}
                                        variant="solid"
                                        color="primary"
                                        loading={saving}
                                        disabled={hasSettingsErrors}
                                        onClick={handleSaveSelected}
                                    >
                                        Сохранить настройки модуля
                                    </Button>
                                )}
                            </div>
                        </div>

                        {selectedNeedsConfig && (
                            <Alert showIcon type="warning">
                                Модуль включён, но требует обязательной настройки перед запуском
                                внешней доставки. Заполните интеграционные настройки и сохраните.
                            </Alert>
                        )}
                        {selectedRuntimeSuspended && !selectedNeedsConfig && (
                            <Alert showIcon type="info">
                                Внешняя доставка модуля приостановлена после предыдущего
                                отключения. Возобновите явно и выберите судьбу накопленного DLQ.
                            </Alert>
                        )}

                        <div>
                            <h6 className="mb-2">Зависимые модули</h6>
                            <div className="flex flex-wrap gap-2">
                                {(selectedModule?.dependencies.length ?? 0) > 0 ? (
                                    selectedModule?.dependencies.map((dep) => (
                                        <Tag key={dep}>{dep}</Tag>
                                    ))
                                ) : (
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        Нет зависимостей
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h6 className="mb-3">Персональные настройки</h6>
                                {selectedModule &&
                                isModuleSettingsPanelReachable({
                                    moduleId: selectedModule.id,
                                    projectId,
                                    currentProjectId,
                                }) ? (
                                    // У модуля есть собственный экран настроек
                                    // (отдельная вкладка настроек проекта). Второй
                                    // редактор тех же `personalSettings` здесь
                                    // только запутывал бы и затирал сохранённое
                                    // из своей вкладки (PUT настроек проекта
                                    // заменяет moduleConfigs целиком).
                                    <p
                                        {...qa('host.projectSettings.modules.panelTabStub', {
                                            module: selectedModule.id,
                                        })}
                                        className="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        Настройки модуля — на вкладке «
                                        {selectedModule.name}» в настройках проекта.
                                    </p>
                                ) : (
                                    <ModuleSettingsForm
                                        key={`personal-${selectedModule?.id}`}
                                        qaScope="host.projectSettings.modules.personalSettings"
                                        schema={selectedModule?.personalSettingsSchema}
                                        value={selectedConfig.personalSettings}
                                        emptyLabel="Модуль не предоставляет персональных настроек."
                                        onChange={(next) =>
                                            updateSelectedConfig((cfg) => ({
                                                ...cfg,
                                                personalSettings: next,
                                            }))
                                        }
                                        onValidityChange={setPersonalErrors}
                                    />
                                )}
                            </div>
                            <div>
                                <h6 className="mb-3">Интеграционные настройки</h6>
                                <ModuleSettingsForm
                                    key={`integration-${selectedModule?.id}`}
                                    qaScope="host.projectSettings.modules.integrationSettings"
                                    schema={selectedModule?.integrationSettingsSchema}
                                    value={selectedConfig.integrationSettings}
                                    emptyLabel="Модуль не предоставляет интеграционных настроек."
                                    onChange={(next) =>
                                        updateSelectedConfig((cfg) => ({
                                            ...cfg,
                                            integrationSettings: next,
                                        }))
                                    }
                                    onValidityChange={setIntegrationErrors}
                                />
                            </div>
                        </div>
                    </div>
                </AdaptiveCard>
            </div>
        </div>
    )
}

const ROLE_LABELS_RU: Record<ProjectRole, string> = {
    owner: 'Владелец',
    admin: 'Админ',
    manager: 'Менеджер',
    member: 'Участник',
    viewer: 'Наблюдатель',
}

const levelOptions = VISIBILITY_LEVELS.map((value) => ({
    value,
    label: VISIBILITY_LEVEL_LABELS[value],
}))

/**
 * BX-MODEL-2 — готовые сценарии доступа («пресеты», §3 BOX-MODEL-FINAL). Каждый —
 * это уже поддержанная движком конфигурация, поданная как одна карточка «в 1 клик».
 * «Применить» открывает НЕ чёрный ящик, а предзаполненную простую форму:
 *   • `visibility` — прямо задаёт охват записей по ролям (пишет `visibilityConfig`,
 *     та же поверхность, что и грид ниже);
 *   • `route` — ведёт в нужный под-раздел «Доступа» (правила по условию / люди),
 *     где настройка живёт per-запись/per-человек;
 *   • `info` — объясняет, где сделать (шара живёт на карточке записи).
 * Безопасность (§7.2): охват `all` для рядовых ролей (member/viewer) НЕ применяется
 * молча — форма требует явного подтверждения раскрытия данных (data-exposure ack).
 * Запись в аудит (`preset.applied`/`visibility.updated`) добавляет BX-MODEL-6 на
 * стороне control при самой мутации visibilityConfig.
 */
type AccessPresetBase = {
    id: string
    title: string
    outcome: string
    engine: string
    icon: IconType
}
type VisibilityPreset = AccessPresetBase & {
    kind: 'visibility'
    apply: Partial<Record<ProjectRole, VisibilityLevel>>
    note?: string
}
type RoutePreset = AccessPresetBase & {
    kind: 'route'
    target: 'people' | 'advanced' | 'teams'
    hint: string
}
type InfoPreset = AccessPresetBase & { kind: 'info'; hint: string }
type AccessPreset = VisibilityPreset | RoutePreset | InfoPreset

const ACCESS_PRESETS: AccessPreset[] = [
    {
        id: 'own_deals',
        kind: 'visibility',
        icon: PiUserDuotone,
        title: 'Каждый ведёт свои сделки',
        outcome: 'Менеджеры и участники видят только свои записи (и расшаренные им).',
        engine: 'Охват записей',
        apply: {
            manager: 'own_and_shared',
            member: 'own_and_shared',
            viewer: 'own_and_shared',
        },
    },
    {
        id: 'head_department',
        kind: 'visibility',
        icon: PiUsersDuotone,
        title: 'Руководитель видит свой отдел',
        outcome: 'Менеджер видит записи своего отдела, а не только свои.',
        engine: 'Охват записей + отделы',
        apply: { manager: 'own_and_department' },
        note: 'Опирается на отдел сотрудника. Отделы и команды настраиваются в под-разделе «Команды».',
    },
    {
        id: 'head_subtree',
        kind: 'visibility',
        icon: PiUsersThreeDuotone,
        title: 'Руководитель видит отдел и под-отделы',
        outcome: 'Менеджер видит записи своих подчинённых вниз по иерархии.',
        engine: 'Охват записей + иерархия',
        apply: { manager: 'own_and_subordinates' },
        note: 'Опирается на руководителей отделов. Иерархия настраивается в под-разделе «Команды».',
    },
    {
        id: 'all_see_edit_own',
        kind: 'visibility',
        icon: PiGlobeHemisphereWestDuotone,
        title: 'Все видят всё, редактируют своё',
        outcome: 'Общий обзор проекта для всех ролей; правка остаётся у ответственного.',
        engine: 'Охват записей «все»',
        apply: { manager: 'all', member: 'all' },
        note: 'Раскрывает все записи проекта рядовым ролям — потребует подтверждения. Ограничение правки чужих записей задаётся правилом по условию в под-разделе «Продвинутое».',
    },
    {
        id: 'hide_big_deals',
        kind: 'route',
        icon: PiEyeSlashDuotone,
        title: 'Скрыть крупные сделки от рядовых',
        outcome: 'Участники не видят сделки дороже заданной суммы.',
        engine: 'Правило по условию',
        target: 'advanced',
        hint: 'В под-разделе «Продвинутое» добавьте правило по условию: скрыть чтение сделок, у которых сумма больше порога.',
    },
    {
        id: 'viewer_only',
        kind: 'route',
        icon: PiEyeDuotone,
        title: 'Только просмотр (аудитор, стажёр)',
        outcome: 'Человек всё видит по своему охвату, но ничего не меняет.',
        engine: 'Роль «Наблюдатель»',
        target: 'people',
        hint: 'В под-разделе «Люди и роли» назначьте человеку роль «Наблюдатель».',
    },
    {
        id: 'share_temp',
        kind: 'info',
        icon: PiShareNetworkDuotone,
        title: 'Поделиться записью на время',
        outcome: 'Дать коллеге доступ к одной карточке до нужной даты.',
        engine: 'Доступ к записи',
        hint: 'Откройте нужную карточку (сделку, контакт, компанию) и нажмите «Поделиться»: выберите коллегу и срок доступа.',
    },
    {
        id: 'revoke_one',
        kind: 'route',
        icon: PiProhibitDuotone,
        title: 'Забрать одно право у человека',
        outcome: 'Точечно запретить одно действие (например, экспорт) конкретному человеку.',
        engine: 'Точечный запрет',
        target: 'people',
        hint: 'В под-разделе «Люди и роли» откройте права человека и снимите/запретите одну галочку. Запрет всегда важнее разрешения.',
    },
]

const EXPOSED_ROLES: ProjectRole[] = ['member', 'viewer']

/**
 * BX-MODEL-2 — карточка одного пресета. Компактно: иконка, название, что получится,
 * слой движка (человеческим языком) и «Применить».
 */
const AccessPresetCard = ({
    preset,
    onApply,
    disabled,
}: {
    preset: AccessPreset
    onApply: () => void
    disabled?: boolean
}) => {
    const Icon = preset.icon
    return (
        <Card {...qa('host.projectSettings.access.presetCard', { preset: preset.id })} className="h-full">
            <div className="flex flex-col h-full gap-3">
                <div className="flex items-start gap-3">
                    <span className="shrink-0 text-primary">
                        <Icon className="w-6 h-6" />
                    </span>
                    <div>
                        <div className="font-semibold leading-tight">{preset.title}</div>
                        <Tag className="mt-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                            {preset.engine}
                        </Tag>
                    </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                    {preset.outcome}
                </p>
                <div>
                    <Button
                        {...qa('host.projectSettings.access.presetApply', { preset: preset.id })}
                        size="sm"
                        variant="plain"
                        disabled={disabled}
                        onClick={onApply}
                    >
                        Применить
                    </Button>
                </div>
            </div>
        </Card>
    )
}

/**
 * BX-MODEL-1 «Обзор» — охват записей по ролям (visibility). Простая поверхность
 * из 5 уровней; жаргон (visibility policy / `visibilityConfig`) убран — в UI
 * «Охват записей» + «?»-тултип из глоссария §2.
 * Per-project record-visibility config (spec §13.4): role → visibility level.
 * Persists to control via PATCH /v1/projects/:id { visibilityConfig }; backend
 * gates this route to owner/admin.
 *
 * BX-MODEL-5 (§6-D5) — симулятор «Проверить доступ» + explain-трейс вынесен сюда
 * заметной кнопкой (раньше был спрятан в drawer AbacEditor). «Почему сотрудник не
 * видит сделку» — главный вопрос поддержки, поэтому он на дефолтном под-разделе, а
 * не под «Продвинутым». Трасса показывает слой + правило (+ключи, когда движок их
 * отдаёт), но НЕ значения полей записи (FR-ABAC-20). Draft-preview несохранённых
 * правил остаётся в AbacEditor («Продвинутое») — там он про редактирование.
 */
export const AccessOverviewSection = ({
    projectId,
    onNavigate,
}: {
    projectId?: string
    onNavigate?: (sub: 'people' | 'teams' | 'advanced') => void
}) => {
    const [config, setConfig] = useState<VisibilityConfig>({})
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savedAt, setSavedAt] = useState<number | null>(null)
    // TODO-452: сохранение и загрузка охвата больше не немые. `loadError`
    // отличает «настройки не удалось прочитать» от «охват пуст» — иначе при
    // недоступном API показывался дефолтный охват, как будто он сохранён.
    const [saveError, setSaveError] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    // BX-MODEL-2: активный пресет (открытая «предзаполненная форма»), черновик
    // охвата и подтверждение раскрытия данных для рядовых ролей.
    const [activePreset, setActivePreset] = useState<AccessPreset | null>(null)
    const [presetDraft, setPresetDraft] = useState<VisibilityConfig>({})
    const [exposureAck, setExposureAck] = useState(false)
    // BX-MODEL-5: симулятор «Проверить доступ» на «Обзоре». Ресурсы для симуляции =
    // включённые модули проекта (Contextual UI), как в AbacEditor.
    const simSubjects = useChromeModuleKeys()
    const [simOpen, setSimOpen] = useState(false)
    const [visibilitySummary, setVisibilitySummary] = useState<VisibilitySummaryModule[]>([])
    const [visibilitySummaryError, setVisibilitySummaryError] = useState<string | null>(null)

    useEffect(() => {
        if (!projectId) return
        let mounted = true
        setVisibilitySummaryError(null)
        apiMyVisibilitySummary(projectId)
            .then((res) => {
                if (mounted) setVisibilitySummary(res?.modules ?? [])
            })
            .catch(() => {
                if (mounted) {
                    setVisibilitySummary([])
                    setVisibilitySummaryError('Не удалось загрузить сводку видимости')
                }
            })
        return () => {
            mounted = false
        }
    }, [projectId])

    useEffect(() => {
        if (!projectId) return
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetProject<{ visibility_config?: Record<string, string> }>(projectId)
            .then((res) => {
                if (!mounted) return
                const raw = res?.visibility_config ?? {}
                const next: VisibilityConfig = {}
                for (const role of PROJECT_ROLES) {
                    const lvl = raw[role]
                    if (lvl && (VISIBILITY_LEVELS as readonly string[]).includes(lvl)) {
                        next[role] = lvl as VisibilityLevel
                    }
                }
                setConfig(next)
            })
            .catch(() => {
                if (mounted) setLoadError('Не удалось загрузить настройки охвата')
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [projectId])

    const effectiveLevel = (role: ProjectRole): VisibilityLevel =>
        config[role] ?? DEFAULT_VISIBILITY_BY_ROLE[role]

    /** Возвращает текст ошибки или `null` при успехе (TODO-452). */
    const persist = async (
        cfg: VisibilityConfig,
        appliedPreset?: string,
    ): Promise<string | null> => {
        if (!projectId) return 'Проект не выбран'
        setSaving(true)
        setSavedAt(null)
        setSaveError(null)
        try {
            await apiUpdateProjectSettings(
                projectId,
                appliedPreset
                    ? { visibilityConfig: cfg, appliedPreset }
                    : { visibilityConfig: cfg },
            )
            setSavedAt(Date.now())
            return null
        } catch (e) {
            // Правки сохраняем в форме, но молчать нельзя: без этого «Сохранить»
            // выглядело успешным, а сервер оставался со старым охватом (TODO-452).
            const message = accessSaveErrorMessage(e)
            setSaveError(message)
            return message
        } finally {
            setSaving(false)
        }
    }

    const handleSave = async () => {
        const error = await persist(config)
        if (error) notify(error, 'danger')
        else notify('Охват сохранён', 'success')
    }

    // BX-MODEL-2: открыть пресет. Охватные — предзаполняют форму значениями пресета
    // поверх текущего охвата; маршрутные/справочные — открывают ту же карточку-форму
    // с объяснением и переходом в нужный под-раздел.
    const openPreset = (preset: AccessPreset) => {
        setExposureAck(false)
        if (preset.kind === 'visibility') {
            setPresetDraft({ ...preset.apply })
        } else {
            setPresetDraft({})
        }
        setActivePreset(preset)
    }

    // Итоговый охват после применения черновика пресета (для превью и проверки
    // раскрытия данных рядовым ролям).
    const draftEffective = (role: ProjectRole): VisibilityLevel =>
        presetDraft[role] ?? config[role] ?? DEFAULT_VISIBILITY_BY_ROLE[role]
    const exposesRankAndFile = EXPOSED_ROLES.some(
        (role) => draftEffective(role) === 'all',
    )

    const applyVisibilityPreset = async () => {
        const merged: VisibilityConfig = { ...config, ...presetDraft }
        const error = await persist(merged, activePreset?.id)
        if (!error) {
            setConfig(merged)
            setActivePreset(null)
            notify('Пресет применён', 'success')
        } else {
            notify(error, 'danger')
        }
    }

    return (
        <div className="space-y-6">
        {/* BX-MODEL-5 — заметная кнопка «Проверить доступ» (симулятор + explain). */}
        <AdaptiveCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <PiMagnifyingGlassDuotone className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">Проверить доступ</h3>
                        <HelpIcon title="Пошаговый разбор, почему конкретный человек видит или не видит запись: роль → правила по условию → охват → шаринг. Показывает слой и правило, но не значения полей записи." />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        «Почему сотрудник не видит эту сделку?» — выберите человека, тип
                        записи и действие и получите разбор по слоям.
                    </p>
                </div>
                <Button
                    {...qa('host.projectSettings.access.simOpen')}
                    variant="solid"
                    color="primary"
                    icon={<PiMagnifyingGlassDuotone />}
                    disabled={!projectId}
                    onClick={() => setSimOpen(true)}
                >
                    Проверить доступ
                </Button>
            </div>
        </AdaptiveCard>

        <AdaptiveCard {...qa('host.projectSettings.access.visibilitySummary')}>
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Ваш охват по модулям</h3>
                    <HelpIcon title="Сводка эффективной видимости для вашей учётной записи в этом проекте. Обновляется при изменении ролей, охвата или правил доступа." />
                </div>
                {visibilitySummaryError && (
                    <Alert {...qa('host.projectSettings.access.visibilitySummaryError')} showIcon type="warning">
                        {visibilitySummaryError}
                    </Alert>
                )}
                {visibilitySummary.length === 0 && !visibilitySummaryError ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Нет данных по включённым модулям.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl">
                        {visibilitySummary.map((row) => (
                            <div
                                key={row.module}
                                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
                            >
                                <span className="font-medium capitalize">{row.module}</span>
                                <span className="text-gray-500">
                                    {VISIBILITY_LEVEL_LABELS[row.level as VisibilityLevel] ??
                                        row.level}{' '}
                                    ({row.mode})
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdaptiveCard>

        <AdaptiveCard>
            <div className="space-y-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold">Готовые сценарии</h3>
                        <HelpIcon title="Частые настройки доступа в один клик. «Применить» откроет предзаполненную форму — можно проверить и поправить перед сохранением. Ничего не применяется молча." />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Выберите сценарий, близкий к вашему, — он предзаполнит настройку.
                        Тонкие детали всегда можно поправить ниже или в «Продвинутом».
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {ACCESS_PRESETS.map((preset) => (
                        <AccessPresetCard
                            key={preset.id}
                            preset={preset}
                            disabled={!projectId || loading}
                            onApply={() => openPreset(preset)}
                        />
                    ))}
                </div>
            </div>
        </AdaptiveCard>

        <AdaptiveCard>
            <div className="space-y-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold">Охват записей по ролям</h3>
                        <HelpIcon title="Чьи записи видит человек в зависимости от роли: только свои / свои + отдела / свои + подчинённых / все. Сначала роль задаёт, что человек умеет, затем охват сужает, чьи записи он видит." />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Какие записи (сделки, контакты, компании, продажи, активности) видит
                        участник проекта в зависимости от роли. Владение записью определяется
                        ответственным; «свои + подчинённых» опирается на руководителей отделов,
                        «свои + отдела» — на отдел сотрудника. Расшаренные записи видны всегда
                        (кроме уровня «только свои»).
                    </p>
                    <div className="space-y-3 max-w-2xl">
                        {PROJECT_ROLES.map((role) => (
                            <div
                                key={role}
                                className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                            >
                                <div>
                                    <div className="font-medium">{ROLE_LABELS_RU[role]}</div>
                                    <div className="text-xs text-gray-500">
                                        по умолчанию:{' '}
                                        {VISIBILITY_LEVEL_LABELS[DEFAULT_VISIBILITY_BY_ROLE[role]]}
                                    </div>
                                </div>
                                <div className="w-64">
                                    <Select
                                        {...qa('host.projectSettings.access.visibilitySelect', { role })}
                                        isDisabled={loading || saving}
                                        value={levelOptions.find(
                                            (o) => o.value === effectiveLevel(role),
                                        )}
                                        options={levelOptions}
                                        onChange={(opt) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                [role]: (opt?.value ??
                                                    DEFAULT_VISIBILITY_BY_ROLE[
                                                        role
                                                    ]) as VisibilityLevel,
                                            }))
                                        }
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {loadError && (
                    <Alert {...qa('host.projectSettings.access.loadError')} showIcon className="mb-3" type="danger">
                        {loadError}
                    </Alert>
                )}
                {saveError && (
                    <Alert
                        {...qaWithAlias(
                            'host.projectSettings.access.saveError',
                            'host.projectSettings.policyError',
                        )}
                        showIcon
                        className="mb-3"
                        type="danger"
                    >
                        {saveError}
                    </Alert>
                )}

                <div className="flex items-center justify-end gap-3">
                    {savedAt && !saveError && (
                        <span
                            {...qa('host.projectSettings.access.savedAt')}
                            className="text-sm text-emerald-600 dark:text-emerald-400"
                        >
                            Сохранено
                        </span>
                    )}
                    <Button
                        {...qa('host.projectSettings.access.visibilitySave')}
                        variant="solid"
                        color="primary"
                        loading={saving}
                        disabled={!projectId || loading}
                        onClick={handleSave}
                    >
                        Сохранить
                    </Button>
                </div>
            </div>
        </AdaptiveCard>

        {/* BX-MODEL-2 — предзаполненная форма пресета (не чёрный ящик). */}
        <Dialog
            isOpen={Boolean(activePreset)}
            {...qa('host.projectSettings.access.presetDialog')}
            onClose={() => setActivePreset(null)}
            onRequestClose={() => setActivePreset(null)}
        >
            {activePreset && (
                <>
                    <div className="flex items-center gap-2 mb-1">
                        <activePreset.icon className="w-5 h-5 text-primary" />
                        <h5>{activePreset.title}</h5>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {activePreset.outcome}
                    </p>

                    {activePreset.kind === 'visibility' ? (
                        <div className="flex flex-col gap-4">
                            <div className="space-y-3">
                                {Object.keys(activePreset.apply).map((r) => {
                                    const role = r as ProjectRole
                                    return (
                                        <div
                                            key={role}
                                            className="flex items-center justify-between gap-4"
                                        >
                                            <div className="font-medium">
                                                {ROLE_LABELS_RU[role]}
                                            </div>
                                            <div className="w-64">
                                                <Select
                                                    value={levelOptions.find(
                                                        (o) => o.value === draftEffective(role),
                                                    )}
                                                    options={levelOptions}
                                                    onChange={(opt) =>
                                                        setPresetDraft((prev) => ({
                                                            ...prev,
                                                            [role]: (opt?.value ??
                                                                DEFAULT_VISIBILITY_BY_ROLE[
                                                                    role
                                                                ]) as VisibilityLevel,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            {activePreset.note && (
                                <p className="text-xs text-gray-400">{activePreset.note}</p>
                            )}
                            {exposesRankAndFile && (
                                <Alert showIcon type="warning">
                                    <div className="space-y-2">
                                        <p className="text-sm">
                                            Этот сценарий открывает <b>все записи проекта</b>{' '}
                                            рядовым ролям (участник / наблюдатель). Убедитесь,
                                            что это допустимо для ваших данных.
                                        </p>
                                        <Checkbox
                                            {...qa('host.projectSettings.access.presetAck')}
                                            checked={exposureAck}
                                            onChange={(val) => setExposureAck(val)}
                                        >
                                            <span className="text-sm">
                                                Понимаю, что участники увидят все записи проекта
                                            </span>
                                        </Checkbox>
                                    </div>
                                </Alert>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button size="sm" onClick={() => setActivePreset(null)}>
                                    Отмена
                                </Button>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    color="primary"
                                    loading={saving}
                                    disabled={
                                        !projectId || (exposesRankAndFile && !exposureAck)
                                    }
                                    onClick={applyVisibilityPreset}
                                >
                                    Применить
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <p className="text-sm">{activePreset.hint}</p>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button size="sm" onClick={() => setActivePreset(null)}>
                                    Закрыть
                                </Button>
                                {activePreset.kind === 'route' && (
                                    <Button
                                        {...qa('host.projectSettings.access.presetNavigate', {
                                            preset: activePreset.id,
                                        })}
                                        size="sm"
                                        variant="solid"
                                        color="primary"
                                        onClick={() => {
                                            const target =
                                                activePreset.kind === 'route'
                                                    ? activePreset.target
                                                    : undefined
                                            setActivePreset(null)
                                            if (target) onNavigate?.(target)
                                        }}
                                    >
                                        Перейти к настройке
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </Dialog>

        {/* BX-MODEL-5 — симулятор доступа + explain-трасса (перенесён из drawer
            AbacEditor на «Обзор»). Trace без значений полей записи (FR-ABAC-20). */}
        <Drawer
            isOpen={simOpen}
            {...qa('host.projectSettings.access.simDrawer')}
            title="Проверить доступ"
            width={640}
            onClose={() => setSimOpen(false)}
        >
            <AccessSimulator projectId={projectId} subjects={simSubjects} />
        </Drawer>
        </div>
    )
}

/**
 * BX-MODEL-1 «Продвинутое» — тонкие правила по условию (ABAC-конструктор) и
 * симулятор доступа. Свёрнуто/gated от `project:manage`; редкий сценарий, вынесен
 * из основного потока. Симулятор пока живёт в drawer AbacEditor (вынос на «Обзор»
 * — BX-MODEL-5). Единственная поверхность правил по условию (сырой JSON убирает
 * BX-MODEL-3). Охват записей — одна поверхность (простые 5 уровней) на «Обзоре»;
 * V2-редактор видимости в box не выводится (BX-MODEL-4): box-путь обновления
 * проекта персистит только 5 легаси-уровней, вторая пишущая поверхность молча
 * теряла бы `{rules}`-политики.
 */
const AccessAdvancedSection = ({ projectId }: { projectId?: string }) => {
    // Subjects available in the ABAC constructor = enabled-module ids
    // (Contextual UI / policyCapabilities, FR-MPRJ-16). A subject of a disabled
    // module is not offered; its existing rules render inactive (FR-ABAC-11).
    const abacSubjects = useChromeModuleKeys()
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Редкие настройки. Правила по условию срабатывают поверх ролей и охвата
                (например «скрыть сделки дороже суммы»); запрет всегда важнее разрешения.
                Чтобы разобрать, почему человек видит или не видит запись, есть кнопка
                «Проверить доступ» на «Обзоре»; кнопка «Симулятор» ниже проверяет ещё и
                несохранённые правила этого редактора.
            </p>
            {/* E2-15: ABAC policy constructor + access simulator. */}
            <AbacEditor projectId={projectId} subjects={abacSubjects} />
        </div>
    )
}

/* ── SCR-PRJSET-MEMBERS — Участники (FR-MPRJ-1..8) ──────────────────────── */

const inviteRoleOptions = [
    { value: 'viewer', label: 'Наблюдатель' },
    { value: 'member', label: 'Участник' },
    { value: 'manager', label: 'Менеджер' },
    { value: 'admin', label: 'Админ' },
]

const getInitials = (name: string) =>
    name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

const MembersTab = ({ projectId }: { projectId?: string }) => {
    const canManage = usePermission('project', 'manage')
    const [members, setMembers] = useState<ProjectMember[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reload, setReload] = useState(0)
    const triggerReload = () => setReload((n) => n + 1)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [inviteUserId, setInviteUserId] = useState('')
    const [inviteRole, setInviteRole] = useState('member')
    const [inviting, setInviting] = useState(false)
    const [inviteError, setInviteError] = useState<string | null>(null)
    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [employeesLoading, setEmployeesLoading] = useState(false)

    const [busyUserId, setBusyUserId] = useState<string | null>(null)
    const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null)
    const [removeOwnedCount, setRemoveOwnedCount] = useState(0)
    const [removePreviewFailed, setRemovePreviewFailed] = useState(false)
    const [reassignToUserId, setReassignToUserId] = useState('')
    const [removeError, setRemoveError] = useState<string | null>(null)
    const [inviteEmail, setInviteEmail] = useState('')

    useEffect(() => {
        if (!projectId) return
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetProjectMembers<ProjectMember[]>(projectId)
            .then((res) => {
                if (mounted) setMembers(Array.isArray(res) ? res : [])
            })
            .catch(() => {
                if (mounted) setLoadError('Не удалось загрузить список участников')
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [projectId, reload])

    useEffect(() => {
        if (!drawerOpen) return
        let mounted = true
        setEmployeesLoading(true)
        apiGetEmployees()
            .then((list) => {
                if (mounted) setEmployees(Array.isArray(list) ? list : [])
            })
            .catch(() => {
                if (mounted) setEmployees([])
            })
            .finally(() => mounted && setEmployeesLoading(false))
        return () => {
            mounted = false
        }
    }, [drawerOpen])

    const memberUserIds = useMemo(
        () => new Set(members.map((m) => m.id)),
        [members],
    )

    const inviteeOptions = useMemo(
        () =>
            employees
                .filter((e) => e.isActive !== false && e.userId && !memberUserIds.has(e.userId))
                .map((e) => ({
                    value: e.userId,
                    label: e.name?.trim() ? `${e.name} (${e.email})` : e.email || e.userId,
                })),
        [employees, memberUserIds],
    )

    const inviteValid = Boolean(inviteUserId) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())

    const handleInvite = async () => {
        if (!projectId || !inviteValid) return
        setInviting(true)
        setInviteError(null)
        try {
            const res = (await apiAddProjectMember(projectId, {
                ...(inviteUserId
                    ? { userId: inviteUserId }
                    : { email: inviteEmail.trim() }),
                role: inviteRole as ProjectRole,
            })) as { invitationId?: string; inviteUrl?: string; emailSent?: boolean }
            if (res?.inviteUrl && res.emailSent === false) {
                try {
                    await navigator.clipboard.writeText(res.inviteUrl)
                } catch {
                    /* ignore */
                }
            }
            setDrawerOpen(false)
            setInviteUserId('')
            setInviteEmail('')
            setInviteRole('member')
            triggerReload()
        } catch (err) {
            setInviteError(memberErrorMessage(err, 'Не удалось добавить участника'))
        } finally {
            setInviting(false)
        }
    }

    const handleChangeRole = async (member: ProjectMember, role: ProjectRole) => {
        if (!projectId || role === member.role) return
        setBusyUserId(member.id)
        try {
            await apiUpdateProjectMemberRole(projectId, member.id, role)
            setMembers((prev) =>
                prev.map((m) => (m.id === member.id ? { ...m, role } : m)),
            )
        } catch {
            triggerReload()
        } finally {
            setBusyUserId(null)
        }
    }

    const resetRemoveDialog = () => {
        setRemoveTarget(null)
        setRemoveOwnedCount(0)
        setRemovePreviewFailed(false)
        setReassignToUserId('')
        setRemoveError(null)
    }

    const openRemoveDialog = async (member: ProjectMember) => {
        setRemoveTarget(member)
        setReassignToUserId('')
        setRemoveError(null)
        setRemovePreviewFailed(false)
        if (!projectId) {
            setRemoveOwnedCount(0)
            return
        }
        try {
            const preview = await apiPreviewRemoveProjectMember(projectId, member.id)
            setRemoveOwnedCount(preview?.ownedCount ?? 0)
        } catch {
            setRemoveOwnedCount(0)
            setRemovePreviewFailed(true)
            setRemoveError(
                'Не удалось проверить записи участника. Удаление заблокировано, пока проверка недоступна.',
            )
        }
    }

    const handleRemove = async () => {
        if (!projectId || !removeTarget || removePreviewFailed) return
        setBusyUserId(removeTarget.id)
        setRemoveError(null)
        try {
            await apiRemoveProjectMember(projectId, removeTarget.id, {
                reassignToUserId: reassignToUserId || undefined,
            })
            setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id))
            resetRemoveDialog()
        } catch (err) {
            setRemoveError(memberErrorMessage(err, 'Не удалось удалить участника'))
        } finally {
            setBusyUserId(null)
        }
    }

    const columns: ColumnDef<ProjectMember>[] = [
        {
            header: 'Участник',
            cell: ({ row }) => {
                const member = row.original
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                {getInitials(member.name || member.email)}
                            </span>
                        </div>
                        <div>
                            <div className="font-medium">{member.name || '—'}</div>
                            <div className="text-sm text-gray-500">{member.email}</div>
                        </div>
                    </div>
                )
            },
        },
        {
            header: 'Роль',
            cell: ({ row }) => {
                const member = row.original
                // owner immutable; others editable only with project:manage.
                if (member.role === 'owner' || !canManage) {
                    const roleInfo = roleLabels[member.role]
                    return (
                        <Tag
                            {...(member.role === 'owner'
                                ? qa('host.projectSettings.members.ownerRole', { member: member.id })
                                : {})}
                            className={roleInfo?.className}
                        >
                            {roleInfo?.label ?? member.role}
                        </Tag>
                    )
                }
                return (
                    <div className="w-44">
                        <Select
                            {...qa('host.projectSettings.members.roleSelect', { member: member.id })}
                            size="sm"
                            isDisabled={busyUserId === member.id}
                            value={inviteRoleOptions.find((o) => o.value === member.role)}
                            options={inviteRoleOptions}
                            onChange={(opt) =>
                                opt && handleChangeRole(member, opt.value as ProjectRole)
                            }
                        />
                    </div>
                )
            },
        },
        {
            header: 'Действия',
            cell: ({ row }) => {
                const member = row.original
                if (member.role === 'owner' || !canManage) return null
                return (
                    <button
                        {...qa('host.projectSettings.members.remove', { member: member.id })}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500"
                        disabled={busyUserId === member.id}
                        title="Удалить из проекта"
                        onClick={() => void openRemoveDialog(member)}
                    >
                        <PiTrashDuotone className="w-4 h-4" />
                    </button>
                )
            },
        },
    ]

    // ST-19
    if (!projectId) {
        return (
            <AdaptiveCard>
                <p className="text-sm text-gray-500">Проект не выбран.</p>
            </AdaptiveCard>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                {/* ST-12: invite hidden without project:manage */}
                <PermissionCheck subject="project" action="manage">
                    <Button
                        {...qa('host.projectSettings.members.invite')}
                        variant="solid"
                        color="primary"
                        icon={<PiPlusDuotone />}
                        onClick={() => setDrawerOpen(true)}
                    >
                        Пригласить
                    </Button>
                </PermissionCheck>
            </div>

            <AdaptiveCard {...qa('host.projectSettings.members.root')}>
                {loadError ? (
                    <div className="flex flex-col items-start gap-3 py-6">
                        <p
                            {...qa('host.projectSettings.members.loadError')}
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {loadError}
                        </p>
                        <Button
                            {...qa('host.projectSettings.members.retry')}
                            size="sm"
                            variant="solid"
                            onClick={triggerReload}
                        >
                            Повторить
                        </Button>
                    </div>
                ) : loading ? (
                    <p {...qa('host.projectSettings.members.loading')} className="py-6 text-sm text-gray-400">
                        Загрузка участников…
                    </p>
                ) : members.length === 0 ? (
                    <div
                        {...qa('host.projectSettings.members.empty')}
                        className="py-10 text-center text-sm text-gray-500"
                    >
                        В проекте пока нет участников.
                        {canManage && ' Пригласите первого участника.'}
                    </div>
                ) : (
                    <div {...qa('host.projectSettings.membersTable')}>
                        <DataTable
                            {...qa('host.projectSettings.members.table')}
                            columns={columns}
                            data={members}
                            pagingData={{
                                total: members.length,
                                pageIndex: 1,
                                pageSize: 50,
                            }}
                        />
                    </div>
                )}
            </AdaptiveCard>

            {/* SCR-PRJSET-MEMBER-INVITE (Drawer) */}
            <Drawer
                isOpen={drawerOpen}
                {...qa('host.projectSettings.members.inviteDrawer')}
                title="Пригласить участника"
                onClose={() => setDrawerOpen(false)}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Сотрудник</label>
                        <Select
                            {...qa('host.projectSettings.members.inviteEmployee')}
                            placeholder={
                                employeesLoading
                                    ? 'Загрузка сотрудников…'
                                    : inviteeOptions.length
                                      ? 'Выберите сотрудника'
                                      : 'Нет доступных сотрудников'
                            }
                            isLoading={employeesLoading}
                            value={inviteeOptions.find((o) => o.value === inviteUserId) ?? null}
                            options={inviteeOptions}
                            onChange={(opt) => setInviteUserId(opt?.value ?? '')}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Сотрудник системы — или пригласите нового человека по email ниже.
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <Input
                            {...qa('host.projectSettings.members.inviteEmail')}
                            type="email"
                            placeholder="name@example.com"
                            value={inviteEmail}
                            disabled={Boolean(inviteUserId)}
                            onChange={(e) => setInviteEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Роль</label>
                        <Select
                            {...qa('host.projectSettings.members.inviteRole')}
                            value={inviteRoleOptions.find((o) => o.value === inviteRole)}
                            options={inviteRoleOptions}
                            onChange={(opt) => opt && setInviteRole(opt.value)}
                            {...qa('host.projectSettings.inviteRole')}
                        />
                    </div>
                    {inviteError && (
                        <p
                            {...qaWithAlias(
                                'host.projectSettings.members.inviteError',
                                'host.projectSettings.inviteError',
                            )}
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {inviteError}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="plain" onClick={() => setDrawerOpen(false)}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={inviting}
                            disabled={!inviteValid || employeesLoading}
                            onClick={handleInvite}
                        >
                            Добавить участника
                        </Button>
                    </div>
                </div>
            </Drawer>

            {/* Remove confirm */}
            <ConfirmDialog
                isOpen={Boolean(removeTarget)}
                type="danger"
                title="Удалить участника?"
                {...qa('host.projectSettings.members.removeDialog')}
                confirmText="Удалить"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qa('host.projectSettings.members.removeConfirm'),
                    loading: busyUserId === removeTarget?.id,
                    disabled:
                        removePreviewFailed ||
                        (removeOwnedCount > 0 && !reassignToUserId),
                }}
                onClose={resetRemoveDialog}
                onRequestClose={resetRemoveDialog}
                onCancel={resetRemoveDialog}
                onConfirm={handleRemove}
            >
                <p>
                    Участник «{removeTarget?.name || removeTarget?.email}» потеряет доступ
                    к проекту. Действие можно отменить, пригласив его снова.
                </p>
                {removeOwnedCount > 0 && (
                    <div className="mt-3 space-y-2">
                        <Alert showIcon type="warning">
                            У участника {removeOwnedCount} записей во владении. Выберите, кому
                            передать их перед удалением.
                        </Alert>
                        <Select
                            {...qa('host.projectSettings.members.reassignSelect')}
                            placeholder="Новый ответственный"
                            options={members
                                .filter((m) => m.id !== removeTarget?.id)
                                .map((m) => ({
                                    value: m.id,
                                    label: m.name?.trim()
                                        ? `${m.name} (${m.email})`
                                        : m.email || m.id,
                                }))}
                            value={
                                members
                                    .filter((m) => m.id === reassignToUserId)
                                    .map((m) => ({
                                        value: m.id,
                                        label: m.name || m.email || m.id,
                                    }))[0] ?? null
                            }
                            onChange={(opt) =>
                                setReassignToUserId(
                                    (opt as { value?: string } | null)?.value ?? '',
                                )
                            }
                        />
                    </div>
                )}
                {removeError && (
                    <p
                        {...qa('host.projectSettings.members.removeError')}
                        className="mt-2 text-sm text-red-600 dark:text-red-400"
                    >
                        {removeError}
                    </p>
                )}
            </ConfirmDialog>
        </div>
    )
}

/**
 * BX-MODEL-1 — единый раздел «Доступ» (§4 BOX-MODEL-FINAL). Свёл разрозненные
 * вкладки policies / members / roles + группы (жившие в отдельном org-разделе)
 * в один раздел с под-разделами, чтобы одна модель доступа не была размазана по
 * шести экранам в двух местах. Под-разделы:
 *   • Обзор       — охват записей по ролям (visibility). Дефолт.
 *   • Люди и роли  — участники + кому какая роль + кастомные роли.
 *   • Команды      — группы/отделы (AccessUnitsEditor). В single-tenant box одна
 *                    организация, поэтому группы показываем прямо в проекте, не
 *                    гоняя админа в отдельный org-раздел.
 *   • Продвинутое  — тонкие правила по условию + симулятор (gated project:manage).
 * Жаргон RBAC/ABAC/ACL/policy/grant/unit заменён человеческими надписями +
 * «?»-тултипами из глоссария §2. Пресеты (BX-MODEL-2) и заметная кнопка
 * «Проверить доступ» на «Обзоре» (BX-MODEL-5) — на месте.
 */
const AccessTab = ({ projectId }: { projectId?: string }) => {
    const { deploymentMode } = usePublicConfig()
    const { systemId } = useWorkspaceRole()
    const canManage = usePermission('project', 'manage')
    const [sub, setSub] = useState('overview')
    return (
        <Tabs value={sub} variant="pill" onChange={(v) => setSub(v)}>
            <TabList {...qa('host.projectSettings.access.subTabList')}>
                <TabNav value="overview" {...qa('host.projectSettings.access.subTab', { sub: 'overview' })}>
                    Обзор
                </TabNav>
                <TabNav value="people" {...qa('host.projectSettings.access.subTab', { sub: 'people' })}>
                    Люди и роли
                </TabNav>
                <TabNav value="teams" {...qa('host.projectSettings.access.subTab', { sub: 'teams' })}>
                    Команды
                </TabNav>
                {canManage && (
                    <TabNav
                        value="assignments"
                        {...qa('host.projectSettings.access.subTab', { sub: 'assignments' })}
                    >
                        Назначения
                    </TabNav>
                )}
                {canManage && (
                    <TabNav
                        value="advanced"
                        {...qa('host.projectSettings.access.subTab', { sub: 'advanced' })}
                    >
                        Продвинутое
                    </TabNav>
                )}
            </TabList>
            <div className="mt-4">
                <TabContent value="overview">
                    <AccessOverviewSection
                        projectId={projectId}
                        onNavigate={(target) => {
                            // «Продвинутое» доступно только с project:manage — иначе
                            // маршрутный пресет туда молча игнорируем.
                            if (target === 'advanced' && !canManage) return
                            setSub(target)
                        }}
                    />
                </TabContent>
                <TabContent value="people">
                    <div className="space-y-6">
                        <MembersTab projectId={projectId} />
                        {deploymentMode === 'box' ? (
                            <SystemRolesReference projectId={projectId} />
                        ) : (
                            <RolesEditor projectId={projectId} />
                        )}
                    </div>
                </TabContent>
                <TabContent value="teams">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">Команды и отделы</h3>
                            <HelpIcon title="Кто с кем в одной команде. Команды нужны, чтобы давать охват «свой отдел / свои подчинённые» и делиться записями с группой людей сразу." />
                        </div>
                        <AccessUnitsEditor
                            scopeType="ORGANIZATION"
                            scopeId={systemId}
                        />
                    </div>
                </TabContent>
                {canManage && (
                    <TabContent value="assignments">
                        <AssignmentsTab projectId={projectId} />
                    </TabContent>
                )}
                {canManage && (
                    <TabContent value="advanced">
                        <AccessAdvancedSection projectId={projectId} />
                    </TabContent>
                )}
            </div>
        </Tabs>
    )
}

/**
 * SCR-PROJECT-SETTINGS-AUDIT — project audit journal tab.
 * Real data from `GET /v1/projects/:id/audit/events`. Client-side filters
 * (date range / actor / action type) built from the loaded rows. Mirrors the
 * loading/error/empty/empty-filter states of account/System/SystemAudit.
 */
const AuditTab = ({ projectId }: { projectId?: string }) => {
    const [entries, setEntries] = useState<ProjectAuditEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [userFilter, setUserFilter] = useState('')
    const [actionTypes, setActionTypes] = useState<string[]>([])

    const load = useCallback(async () => {
        if (!projectId) return
        setIsLoading(true)
        setError(null)
        try {
            const rows = await apiGetProjectAudit(projectId, 200)
            setEntries(Array.isArray(rows) ? rows : [])
        } catch (e) {
            console.error('Load project audit failed:', e)
            setError('Не удалось загрузить журнал аудита.')
        } finally {
            setIsLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        load()
    }, [load])

    const users = useMemo(
        () => Array.from(new Set(entries.map((e) => auditActorName(e)))),
        [entries],
    )

    const actionTypeOptions = useMemo(() => {
        const present = Array.from(new Set(entries.map((e) => e.action)))
        return present.map((a) => ({ value: a, label: eventLabel(a) }))
    }, [entries])

    const filtered = useMemo(() => {
        return entries.filter((entry) => {
            if (userFilter && auditActorName(entry) !== userFilter) return false
            if (actionTypes.length > 0 && !actionTypes.includes(entry.action))
                return false
            if (dateFrom || dateTo) {
                const ms = auditDateMs(entry.createdAt)
                const d = ms === null ? null : new Date(ms)
                if (!d || Number.isNaN(d.getTime())) return false
                const iso = d.toISOString().slice(0, 10)
                if (dateFrom && iso < dateFrom) return false
                if (dateTo && iso > dateTo) return false
            }
            return true
        })
    }, [entries, userFilter, actionTypes, dateFrom, dateTo])

    const hasActiveFilters = Boolean(
        userFilter || actionTypes.length > 0 || dateFrom || dateTo,
    )
    const resetFilters = () => {
        setUserFilter('')
        setActionTypes([])
        setDateFrom('')
        setDateTo('')
    }

    const columns: ColumnDef<ProjectAuditEntry>[] = [
        {
            header: 'Время',
            cell: ({ row }) => formatAuditTime(row.original.createdAt),
        },
        {
            header: 'Пользователь',
            cell: ({ row }) => auditActorName(row.original),
        },
        {
            header: 'Действие',
            cell: ({ row }) => (
                <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {eventLabel(row.original.action)}
                </Tag>
            ),
        },
        {
            header: 'Детали',
            cell: ({ row }) => describeAudit(row.original),
        },
    ]

    return (
        <div className="space-y-4" {...qa('host.projectSettings.audit.root')}>
            <AdaptiveCard>
                <div {...qa('host.projectSettings.audit.filters')} className="flex flex-col md:flex-row gap-4 mb-4">
                    <div className="flex gap-2">
                        <Input
                            {...qa('host.projectSettings.audit.dateFrom')}
                            type="date"
                            value={dateFrom}
                            placeholder="От"
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                        <Input
                            {...qa('host.projectSettings.audit.dateTo')}
                            type="date"
                            value={dateTo}
                            placeholder="До"
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>
                    <Select
                        {...qa('host.projectSettings.audit.userFilter')}
                        value={[
                            { value: '', label: 'Все пользователи' },
                            ...users.map((u) => ({ value: u, label: u })),
                        ].find((opt) => opt.value === userFilter)}
                        options={[
                            { value: '', label: 'Все пользователи' },
                            ...users.map((u) => ({ value: u, label: u })),
                        ]}
                        placeholder="Пользователь"
                        onChange={(opt) => setUserFilter(opt?.value || '')}
                    />
                    <Select
                        {...qa('host.projectSettings.audit.actionFilter')}
                        isMulti
                        value={actionTypeOptions.filter((opt) =>
                            actionTypes.includes(opt.value),
                        )}
                        options={actionTypeOptions}
                        placeholder="Тип действия"
                        onChange={(opts) =>
                            setActionTypes(
                                Array.isArray(opts) ? opts.map((o) => o.value) : [],
                            )
                        }
                    />
                </div>

                {isLoading && (
                    <div {...qa('host.projectSettings.audit.loading')} className="flex justify-center py-12">
                        <Spinner size={40} />
                    </div>
                )}
                {error && !isLoading && (
                    <p
                        {...qa('host.projectSettings.audit.error')}
                        className="text-sm text-red-600 dark:text-red-400 py-4"
                    >
                        {error}
                    </p>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                    <div {...qa('host.projectSettings.audit.empty')} className="py-8 text-center">
                        {entries.length > 0 && hasActiveFilters ? (
                            <>
                                <p className="text-sm text-gray-500">
                                    По заданным фильтрам записей не найдено.
                                </p>
                                <Button
                                    {...qa('host.projectSettings.audit.filterReset')}
                                    className="mt-3"
                                    variant="plain"
                                    size="sm"
                                    onClick={resetFilters}
                                >
                                    Сбросить фильтры
                                </Button>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500">
                                Записей в журнале пока нет.
                            </p>
                        )}
                    </div>
                )}

                {!isLoading && !error && filtered.length > 0 && (
                    <DataTable
                        {...qa('host.projectSettings.audit.table')}
                        columns={columns}
                        data={filtered}
                        pagingData={{
                            total: filtered.length,
                            pageIndex: 1,
                            pageSize: 10,
                        }}
                    />
                )}
            </AdaptiveCard>
        </div>
    )
}

/** Best-effort message from an axios-style error (BFF returns `error.message`). */
const pipelineErrorMessage = (err: unknown, fallback: string): string => {
    const e = err as {
        response?: { status?: number; data?: { error?: { message?: string }; message?: string } }
    }
    const status = e?.response?.status
    if (status === 409) {
        return (
            e?.response?.data?.error?.message ??
            'Воронка содержит активные сделки и не может быть удалена'
        )
    }
    return e?.response?.data?.error?.message ?? e?.response?.data?.message ?? fallback
}

const notify = (title: string, type: 'success' | 'danger' | 'warning') =>
    toast.push(<Notification title={title} type={type} />)

/**
 * SCR-PROJECT-SETTINGS-PIPELINES — funnels tab (U7 fix).
 * Real CRUD over the pipe contract (§17-20). Create/edit open the deals-module
 * pipeline constructor route; delete / set-default act inline.
 * Manage gate: `deals:manage` (FR-MDEAL-20). Contextual: deals module enabled.
 */
const PipelinesTab = () => {
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('deals', 'manage')
    const enabledModules = useChromeModuleKeys()
    const dealsEnabled = enabledModules.includes('deals')

    const [pipelines, setPipelines] = useState<Pipeline[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reload, setReload] = useState(0)
    const [busyId, setBusyId] = useState<string | null>(null)

    const load = () => setReload((n) => n + 1)

    useEffect(() => {
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetPipelines<Pipeline[] | { list: Pipeline[] }>()
            .then((data) => {
                if (!mounted) return
                const list = Array.isArray(data)
                    ? data
                    : ((data as { list?: Pipeline[] })?.list ?? [])
                setPipelines(list)
            })
            .catch((err) => {
                if (mounted) setLoadError(pipelineErrorMessage(err, 'Не удалось загрузить воронки'))
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })
        return () => {
            mounted = false
        }
    }, [reload])

    const handleDelete = async (pipeline: Pipeline) => {
        if (!window.confirm(`Удалить воронку «${pipeline.name}»?`)) return
        setBusyId(pipeline.id)
        try {
            await apiDeletePipeline(pipeline.id)
            notify('Воронка удалена', 'success')
            load()
        } catch (err) {
            notify(pipelineErrorMessage(err, 'Не удалось удалить воронку'), 'danger')
        } finally {
            setBusyId(null)
        }
    }

    const handleSetDefault = async (pipeline: Pipeline) => {
        setBusyId(pipeline.id)
        try {
            await apiUpdatePipeline(pipeline.id, {
                name: pipeline.name,
                isDefault: true,
                stages: pipeline.stages.map((s, order) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    order,
                })),
            })
            notify('Воронка назначена по умолчанию', 'success')
            load()
        } catch (err) {
            notify(pipelineErrorMessage(err, 'Не удалось изменить воронку'), 'danger')
        } finally {
            setBusyId(null)
        }
    }

    // Contextual-disabled: deals module is off for this project.
    if (!dealsEnabled) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.pipelines.stub')}>
                <p className="text-sm text-gray-500">
                    Воронки доступны после включения модуля «Сделки» во вкладке «Модули».
                </p>
            </AdaptiveCard>
        )
    }

    if (loading) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.pipelines.loading')}>
                <p className="text-sm text-gray-400">Загрузка воронок…</p>
            </AdaptiveCard>
        )
    }

    if (loadError) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.pipelines.error')}>
                <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                    <Button
                        {...qa('host.projectSettings.pipelines.retry')}
                        size="sm"
                        variant="solid"
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    return (
        <div className="flex flex-col gap-4" {...qa('host.projectSettings.pipelines.root')}>
            <div className="flex justify-end">
                {canManage && (
                    <Button
                        {...qa('host.projectSettings.pipelines.create')}
                        variant="solid"
                        color="primary"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={() => navigate('/deals/pipelines/new')}
                    >
                        Воронка
                    </Button>
                )}
            </div>

            {pipelines.length === 0 ? (
                <AdaptiveCard {...qa('host.projectSettings.pipelines.empty')}>
                    <div className="flex flex-col items-center gap-3 py-6">
                        <p className="text-sm text-gray-500">В проекте пока нет воронок</p>
                        {canManage && (
                            <Button
                                {...qa('host.projectSettings.pipelines.emptyCreate')}
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusDuotone />}
                                onClick={() => navigate('/deals/pipelines/new')}
                            >
                                Создать первую воронку
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>
            ) : (
                pipelines.map((pipeline) => (
                    <AdaptiveCard
                        key={pipeline.id}
                        {...qa('host.projectSettings.pipelines.card', { pipeline: pipeline.id })}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <h5>{pipeline.name}</h5>
                                {pipeline.isDefault && (
                                    <Tag
                                        {...qa('host.projectSettings.pipelines.defaultTag', {
                                            pipeline: pipeline.id,
                                        })}
                                        className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                                    >
                                        По умолчанию
                                    </Tag>
                                )}
                            </div>
                            {canManage && (
                                <div className="flex gap-1 items-center">
                                    {!pipeline.isDefault && (
                                        <Button
                                            {...qa('host.projectSettings.pipelines.setDefault', {
                                                pipeline: pipeline.id,
                                            })}
                                            size="xs"
                                            variant="plain"
                                            loading={busyId === pipeline.id}
                                            onClick={() => handleSetDefault(pipeline)}
                                        >
                                            Сделать основной
                                        </Button>
                                    )}
                                    <button
                                        type="button"
                                        {...qa('host.projectSettings.pipelines.edit', {
                                            pipeline: pipeline.id,
                                        })}
                                        aria-label="Редактировать воронку"
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                        title="Редактировать"
                                        onClick={() =>
                                            navigate(`/deals/pipelines/${pipeline.id}/edit`)
                                        }
                                    >
                                        <PiPencilDuotone className="w-4 h-4" />
                                    </button>
                                    {!pipeline.isDefault && (
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.pipelines.delete', {
                                                pipeline: pipeline.id,
                                            })}
                                            aria-label="Удалить воронку"
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500 disabled:opacity-50"
                                            title="Удалить"
                                            disabled={busyId === pipeline.id}
                                            onClick={() => handleDelete(pipeline)}
                                        >
                                            <PiTrashDuotone className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {pipeline.stages.length === 0 ? (
                            <p className="text-sm text-gray-400">Стадии не настроены</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {pipeline.stages.map((stage, index) => (
                                    <div key={stage.id} className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                            <span
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: stage.color }}
                                            />
                                            <span className="text-sm font-medium">
                                                {stage.name}
                                            </span>
                                        </div>
                                        {index < pipeline.stages.length - 1 && (
                                            <span className="text-gray-300 dark:text-gray-600">
                                                →
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </AdaptiveCard>
                ))
            )}
        </div>
    )
}

/** Best-effort message from an axios-style BFF error (deals/orders CRUD). */
const crmErrorMessage = (err: unknown, fallback: string): string => {
    const e = err as {
        response?: { status?: number; data?: { error?: { message?: string }; message?: string } }
    }
    if (e?.response?.status === 409) {
        return (
            e?.response?.data?.error?.message ??
            'Элемент используется в записях и не может быть удалён'
        )
    }
    return e?.response?.data?.error?.message ?? e?.response?.data?.message ?? fallback
}

/** Detect the gateway MODULE_DISABLED / 403 response for graceful degradation. */
const isModuleDisabled = (err: unknown): boolean => {
    const e = err as {
        response?: { status?: number; data?: { error?: { code?: string }; code?: string } }
    }
    const code = e?.response?.data?.error?.code ?? e?.response?.data?.code
    return code === 'MODULE_DISABLED' || e?.response?.status === 403
}

/**
 * SCR-PROJECT-SETTINGS-ORDER-TYPES — «Типы продаж» tab (T-008 fix, Корень C).
 * Real CRUD over the orders contract (`/api/v1/order-types*`, orders:manage).
 * Create/rename open an inline dialog (name + comma-separated stages); delete is
 * soft (409-aware). Contextual-disabled when the `orders` module is off; the
 * gateway also 403s if the module is disabled — handled as graceful degradation.
 */
const OrderTypesTab = () => {
    const can = usePermission()
    const canManage = can('orders', 'manage')
    const enabledModules = useChromeModuleKeys()
    const ordersEnabled = enabledModules.includes('orders')

    const [types, setTypes] = useState<OrderType[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [moduleOff, setModuleOff] = useState(false)
    const [reload, setReload] = useState(0)
    const [busyId, setBusyId] = useState<string | null>(null)

    // Create / rename dialog state.
    const [editOpen, setEditOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<OrderType | null>(null)
    const [formName, setFormName] = useState('')
    const [formStages, setFormStages] = useState('')
    const [saving, setSaving] = useState(false)
    const [delTarget, setDelTarget] = useState<OrderType | null>(null)

    const load = () => setReload((n) => n + 1)

    useEffect(() => {
        if (!ordersEnabled) {
            setLoading(false)
            return
        }
        let mounted = true
        setLoading(true)
        setLoadError(null)
        setModuleOff(false)
        apiGetOrderTypes<OrderType[] | { list: OrderType[] }>()
            .then((data) => {
                if (!mounted) return
                const list = Array.isArray(data)
                    ? data
                    : ((data as { list?: OrderType[] })?.list ?? [])
                setTypes(list)
            })
            .catch((err) => {
                if (!mounted) return
                if (isModuleDisabled(err)) setModuleOff(true)
                else setLoadError(crmErrorMessage(err, 'Не удалось загрузить типы продаж'))
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })
        return () => {
            mounted = false
        }
    }, [reload, ordersEnabled])

    const openCreate = () => {
        setEditTarget(null)
        setFormName('')
        setFormStages('')
        setEditOpen(true)
    }

    const openEdit = (t: OrderType) => {
        setEditTarget(t)
        setFormName(t.name)
        setFormStages(t.stages.map((s) => s.name).join(', '))
        setEditOpen(true)
    }

    const handleSave = async () => {
        const name = formName.trim()
        if (!name) {
            notify('Укажите название типа продажи', 'warning')
            return
        }
        const stageNames = formStages
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (stageNames.length === 0) {
            notify('Добавьте хотя бы одну стадию (через запятую)', 'warning')
            return
        }
        // Build stage specs; the last stage is terminal. Reuse existing ids on edit
        // where the stage name is unchanged so history/analytics stay stable.
        const prevByName = new Map(
            (editTarget?.stages ?? []).map((s) => [s.name, s.id] as const),
        )
        const stages = stageNames.map((sn, i) => ({
            id: prevByName.get(sn) ?? `stage-${i + 1}`,
            name: sn,
            order: i,
            isTerminal: i === stageNames.length - 1,
        }))
        const payload = {
            name,
            fields: editTarget?.fields ?? [],
            stages,
        }
        setSaving(true)
        try {
            if (editTarget) {
                await apiUpdateOrderType(editTarget.id, payload)
                notify('Тип продажи обновлён', 'success')
            } else {
                await apiCreateOrderType(payload)
                notify('Тип продажи создан', 'success')
            }
            setEditOpen(false)
            load()
        } catch (err) {
            notify(crmErrorMessage(err, 'Не удалось сохранить тип продажи'), 'danger')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!delTarget) return
        setBusyId(delTarget.id)
        try {
            await apiDeleteOrderType(delTarget.id)
            notify('Тип продажи удалён', 'success')
            setDelTarget(null)
            load()
        } catch (err) {
            notify(crmErrorMessage(err, 'Не удалось удалить тип продажи'), 'danger')
        } finally {
            setBusyId(null)
        }
    }

    // Contextual-disabled: orders module is off for this project.
    if (!ordersEnabled || moduleOff) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.orderTypes.stub')}>
                <p className="text-sm text-gray-500">
                    Типы продаж доступны после включения модуля «Продажи» во вкладке
                    «Модули».
                </p>
            </AdaptiveCard>
        )
    }

    if (loading) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.orderTypes.loading')}>
                <p className="text-sm text-gray-400">Загрузка типов продаж…</p>
            </AdaptiveCard>
        )
    }

    if (loadError) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.orderTypes.error')}>
                <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                    <Button
                        {...qa('host.projectSettings.orderTypes.retry')}
                        size="sm"
                        variant="solid"
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    return (
        <div className="flex flex-col gap-4" {...qa('host.projectSettings.orderTypes.root')}>
            <div className="flex justify-end">
                {canManage && (
                    <Button
                        {...qa('host.projectSettings.orderTypes.create')}
                        variant="solid"
                        color="primary"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={openCreate}
                    >
                        Тип продажи
                    </Button>
                )}
            </div>

            {types.length === 0 ? (
                <AdaptiveCard {...qa('host.projectSettings.orderTypes.empty')}>
                    <div className="flex flex-col items-center gap-3 py-6">
                        <p className="text-sm text-gray-500">В проекте пока нет типов продаж</p>
                        {canManage && (
                            <Button
                                {...qa('host.projectSettings.orderTypes.emptyCreate')}
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusDuotone />}
                                onClick={openCreate}
                            >
                                Создать первый тип
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {types.map((orderType) => (
                        <Card
                            key={orderType.id}
                            {...qa('host.projectSettings.orderTypes.card', { type: orderType.id })}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h5 className="font-semibold heading-text">
                                        {orderType.name}
                                    </h5>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {orderType.fields.length} полей ·{' '}
                                        {orderType.activeOrders} активных продаж
                                    </div>
                                </div>
                                {canManage && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.orderTypes.edit', {
                                                type: orderType.id,
                                            })}
                                            aria-label="Редактировать тип продажи"
                                            title="Редактировать"
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            onClick={() => openEdit(orderType)}
                                        >
                                            <PiPencilDuotone className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.orderTypes.delete', {
                                                type: orderType.id,
                                            })}
                                            aria-label="Удалить тип продажи"
                                            title="Удалить"
                                            disabled={busyId === orderType.id}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500 disabled:opacity-50"
                                            onClick={() => setDelTarget(orderType)}
                                        >
                                            <PiTrashDuotone className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {orderType.stages.length === 0 ? (
                                <p className="text-xs text-gray-400">Стадии не настроены</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {orderType.stages.map((stage, index) => (
                                        <div key={stage.id} className="flex items-center gap-1">
                                            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                                                {stage.name}
                                            </span>
                                            {index < orderType.stages.length - 1 && (
                                                <span className="text-gray-300 text-xs">→</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {/* ── Create / rename order type ─────────────────────────── */}
            <Dialog
                isOpen={editOpen}
                {...qa('host.projectSettings.orderTypes.dialog')}
                onClose={() => setEditOpen(false)}
                onRequestClose={() => setEditOpen(false)}
            >
                <h5 className="mb-4">
                    {editTarget ? 'Редактировать тип продажи' : 'Новый тип продажи'}
                </h5>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Название</label>
                        <Input
                            {...qa('host.projectSettings.orderTypes.dialog.name')}
                            value={formName}
                            placeholder="Напр. Подключение CRM"
                            onChange={(e) => setFormName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">
                            Стадии (через запятую)
                        </label>
                        <Input
                            {...qa('host.projectSettings.orderTypes.dialog.stages')}
                            value={formStages}
                            placeholder="Заполнение, Проверка, Завершён"
                            onChange={(e) => setFormStages(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Последняя стадия считается завершающей.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-5">
                    <Button size="sm" onClick={() => setEditOpen(false)}>
                        Отмена
                    </Button>
                    <Button
                        {...qa('host.projectSettings.orderTypes.dialog.save')}
                        size="sm"
                        variant="solid"
                        color="primary"
                        loading={saving}
                        onClick={handleSave}
                    >
                        {editTarget ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </Dialog>

            {/* ── Delete order type confirm ──────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(delTarget)}
                type="danger"
                title="Удалить тип продажи?"
                {...qa('host.projectSettings.orderTypes.deleteDialog')}
                confirmText="Удалить"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qa('host.projectSettings.orderTypes.deleteConfirm'),
                    loading: busyId === delTarget?.id,
                }}
                onClose={() => setDelTarget(null)}
                onRequestClose={() => setDelTarget(null)}
                onCancel={() => setDelTarget(null)}
                onConfirm={handleDelete}
            >
                <p>Тип продажи «{delTarget?.name}» будет удалён.</p>
            </ConfirmDialog>
        </div>
    )
}

/**
 * SCR-PROJECT-SETTINGS-SOURCES — «Источники» tab (T-008 fix, Корень C).
 * Real CRUD over the deals contract (`/api/v1/deal-sources*`, deals:manage).
 * Create/rename open an inline dialog (name + color); delete is 409-aware.
 * Contextual-disabled when the `deals` module is off.
 */
const SourcesTab = () => {
    const can = usePermission()
    const canManage = can('deals', 'manage')
    const enabledModules = useChromeModuleKeys()
    const dealsEnabled = enabledModules.includes('deals')

    const [sources, setSources] = useState<DealSource[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reload, setReload] = useState(0)
    const [busyId, setBusyId] = useState<string | null>(null)

    // Create / rename dialog state.
    const [editOpen, setEditOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<DealSource | null>(null)
    const [formName, setFormName] = useState('')
    const [formColor, setFormColor] = useState(SOURCE_COLOR_PALETTE[0])
    const [saving, setSaving] = useState(false)
    const [delTarget, setDelTarget] = useState<DealSource | null>(null)

    const load = () => setReload((n) => n + 1)

    useEffect(() => {
        if (!dealsEnabled) {
            setLoading(false)
            return
        }
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetDealSources<DealSource[] | { list: DealSource[] }>()
            .then((data) => {
                if (!mounted) return
                const list = Array.isArray(data)
                    ? data
                    : ((data as { list?: DealSource[] })?.list ?? [])
                setSources(list)
            })
            .catch((err) => {
                if (mounted)
                    setLoadError(crmErrorMessage(err, 'Не удалось загрузить источники'))
            })
            .finally(() => {
                if (mounted) setLoading(false)
            })
        return () => {
            mounted = false
        }
    }, [reload, dealsEnabled])

    const openCreate = () => {
        setEditTarget(null)
        setFormName('')
        setFormColor(SOURCE_COLOR_PALETTE[0])
        setEditOpen(true)
    }

    const openEdit = (s: DealSource) => {
        setEditTarget(s)
        setFormName(s.name)
        setFormColor(s.color || SOURCE_COLOR_PALETTE[0])
        setEditOpen(true)
    }

    const handleSave = async () => {
        const name = formName.trim()
        if (!name) {
            notify('Укажите название источника', 'warning')
            return
        }
        setSaving(true)
        try {
            if (editTarget) {
                await apiUpdateDealSource(editTarget.id, { name, color: formColor })
                notify('Источник обновлён', 'success')
            } else {
                await apiCreateDealSource({ name, color: formColor })
                notify('Источник создан', 'success')
            }
            setEditOpen(false)
            load()
        } catch (err) {
            notify(crmErrorMessage(err, 'Не удалось сохранить источник'), 'danger')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!delTarget) return
        setBusyId(delTarget.id)
        try {
            await apiDeleteDealSource(delTarget.id)
            notify('Источник удалён', 'success')
            setDelTarget(null)
            load()
        } catch (err) {
            notify(crmErrorMessage(err, 'Не удалось удалить источник'), 'danger')
        } finally {
            setBusyId(null)
        }
    }

    // Contextual-disabled: deals module is off for this project.
    if (!dealsEnabled) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.sources.stub')}>
                <p className="text-sm text-gray-500">
                    Источники доступны после включения модуля «Сделки» во вкладке
                    «Модули».
                </p>
            </AdaptiveCard>
        )
    }

    if (loading) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.sources.loading')}>
                <p className="text-sm text-gray-400">Загрузка источников…</p>
            </AdaptiveCard>
        )
    }

    if (loadError) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.sources.error')}>
                <div className="flex flex-col items-start gap-3">
                    <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
                    <Button
                        {...qa('host.projectSettings.sources.retry')}
                        size="sm"
                        variant="solid"
                        onClick={load}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    return (
        <div className="flex flex-col gap-4" {...qa('host.projectSettings.sources.root')}>
            <div className="flex justify-end">
                {canManage && (
                    <Button
                        {...qa('host.projectSettings.sources.create')}
                        variant="solid"
                        color="primary"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={openCreate}
                    >
                        Источник
                    </Button>
                )}
            </div>

            {sources.length === 0 ? (
                <AdaptiveCard {...qa('host.projectSettings.sources.empty')}>
                    <div className="flex flex-col items-center gap-3 py-6">
                        <p className="text-sm text-gray-500">В проекте пока нет источников</p>
                        {canManage && (
                            <Button
                                {...qa('host.projectSettings.sources.emptyCreate')}
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusDuotone />}
                                onClick={openCreate}
                            >
                                Создать первый источник
                            </Button>
                        )}
                    </div>
                </AdaptiveCard>
            ) : (
                <AdaptiveCard>
                    <div className="space-y-2">
                        {sources.map((source) => (
                            <div
                                key={source.id}
                                {...qa('host.projectSettings.sources.row', { source: source.id })}
                                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span
                                        className="w-4 h-4 rounded-full"
                                        style={{ backgroundColor: source.color || '#9CA3AF' }}
                                    />
                                    <span className="font-medium">{source.name}</span>
                                </div>
                                {canManage && (
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.sources.edit', { source: source.id })}
                                            aria-label="Редактировать источник"
                                            title="Редактировать"
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            onClick={() => openEdit(source)}
                                        >
                                            <PiPencilDuotone className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.sources.delete', { source: source.id })}
                                            aria-label="Удалить источник"
                                            title="Удалить"
                                            disabled={busyId === source.id}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500 disabled:opacity-50"
                                            onClick={() => setDelTarget(source)}
                                        >
                                            <PiTrashDuotone className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </AdaptiveCard>
            )}

            {/* ── Create / rename source ─────────────────────────────── */}
            <Dialog
                isOpen={editOpen}
                {...qa('host.projectSettings.sources.dialog')}
                onClose={() => setEditOpen(false)}
                onRequestClose={() => setEditOpen(false)}
            >
                <h5 className="mb-4">
                    {editTarget ? 'Редактировать источник' : 'Новый источник'}
                </h5>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Название</label>
                        <Input
                            {...qa('host.projectSettings.sources.dialog.name')}
                            value={formName}
                            placeholder="Напр. Сайт"
                            onChange={(e) => setFormName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">Цвет</label>
                        <div {...qa('host.projectSettings.sources.colorPicker')} className="flex flex-wrap gap-2">
                            {SOURCE_COLOR_PALETTE.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    {...qa('host.projectSettings.sources.colorOption', { color })}
                                    aria-label={`Цвет ${color}`}
                                    onClick={() => setFormColor(color)}
                                    className={`w-7 h-7 rounded-full transition-transform ${
                                        formColor === color
                                            ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800 scale-110'
                                            : ''
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-5">
                    <Button size="sm" onClick={() => setEditOpen(false)}>
                        Отмена
                    </Button>
                    <Button
                        {...qa('host.projectSettings.sources.dialog.save')}
                        size="sm"
                        variant="solid"
                        color="primary"
                        loading={saving}
                        onClick={handleSave}
                    >
                        {editTarget ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </Dialog>

            {/* ── Delete source confirm ──────────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(delTarget)}
                type="danger"
                title="Удалить источник?"
                {...qa('host.projectSettings.sources.deleteDialog')}
                confirmText="Удалить"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qa('host.projectSettings.sources.deleteConfirm'),
                    loading: busyId === delTarget?.id,
                }}
                onClose={() => setDelTarget(null)}
                onRequestClose={() => setDelTarget(null)}
                onCancel={() => setDelTarget(null)}
                onConfirm={handleDelete}
            >
                <p>Источник «{delTarget?.name}» будет удалён.</p>
            </ConfirmDialog>
        </div>
    )
}

/** Best-effort message from an axios-style BFF error. */
const apiErrorMessage = (err: unknown, fallback: string): string => {
    const e = err as {
        response?: { data?: { error?: { message?: string }; message?: string } }
    }
    return e?.response?.data?.error?.message ?? e?.response?.data?.message ?? fallback
}

const integrationSubtitle = (int: ProjectIntegration): string => {
    if (int.type === 'rest') return int.config.endpoint ?? '—'
    if (int.type === 'kafka') return `Топик: ${int.config.topic ?? '—'}`
    return int.config.database
        ? `${int.config.host ?? ''}${int.config.host ? '/' : ''}${int.config.database}`
        : '—'
}

const blankConfig: IntegrationConfig = {}

/**
 * SCR-PRJSET-TAB-INTEGRATIONS — project integrations & API-keys (F3-integ-ui, U8 fix).
 *
 * Real CRUD over the F3-integ-be contract (project-scoped
 * `/api/v1/projects/:id/integrations*` and `/api/v1/projects/:id/api-keys*`).
 * Create/edit/delete integrations (REST / Kafka / DB), issue/list/revoke API
 * keys. Secrets are write-only; a freshly issued key is shown once in a modal.
 * Manage gate: `project:manage` (board DoD). States: loading / error+retry /
 * empty / no-rights (PermissionCheck) / success (toast).
 */
const IntegrationsTab = ({ projectId }: { projectId?: string }) => {
    const canManage = usePermission('project', 'manage')

    // ── integrations list ──────────────────────────────────────────────
    const [integrations, setIntegrations] = useState<ProjectIntegration[]>([])
    const [intLoading, setIntLoading] = useState(true)
    const [intError, setIntError] = useState<string | null>(null)

    // ── api keys list ──────────────────────────────────────────────────
    const [apiKeys, setApiKeys] = useState<ProjectApiKey[]>([])
    const [keysLoading, setKeysLoading] = useState(true)
    const [keysError, setKeysError] = useState<string | null>(null)

    // ── integration drawer (create/edit) ───────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editing, setEditing] = useState<ProjectIntegration | null>(null)
    const [formType, setFormType] = useState<IntegrationType>('rest')
    const [formName, setFormName] = useState('')
    const [formConfig, setFormConfig] = useState<IntegrationConfig>(blankConfig)
    const [formSecret, setFormSecret] = useState('')
    const [formActive, setFormActive] = useState(true)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    // ── delete confirm ─────────────────────────────────────────────────
    const [delTarget, setDelTarget] = useState<ProjectIntegration | null>(null)
    const [deleting, setDeleting] = useState(false)

    // ── issue key drawer + reveal modal ────────────────────────────────
    const [keyDrawerOpen, setKeyDrawerOpen] = useState(false)
    const [newKeyName, setNewKeyName] = useState('')
    const [issuing, setIssuing] = useState(false)
    const [keyFormError, setKeyFormError] = useState<string | null>(null)
    const [issuedKey, setIssuedKey] = useState<IssuedApiKey | null>(null)
    const [keyCopied, setKeyCopied] = useState(false)

    // ── revoke confirm ─────────────────────────────────────────────────
    const [revokeTarget, setRevokeTarget] = useState<ProjectApiKey | null>(null)
    const [revoking, setRevoking] = useState(false)

    // ── deliveries panel (per REST integration) ────────────────────────
    const [deliveriesFor, setDeliveriesFor] = useState<ProjectIntegration | null>(
        null,
    )
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
    const [deliveriesLoading, setDeliveriesLoading] = useState(false)
    const [deliveriesError, setDeliveriesError] = useState<string | null>(null)

    const loadIntegrations = useCallback(() => {
        if (!projectId) return
        setIntLoading(true)
        setIntError(null)
        apiGetIntegrations(projectId)
            .then((res) => setIntegrations(res?.list ?? []))
            .catch((e) =>
                setIntError(apiErrorMessage(e, 'Не удалось загрузить интеграции')),
            )
            .finally(() => setIntLoading(false))
    }, [projectId])

    const loadApiKeys = useCallback(() => {
        if (!projectId) return
        setKeysLoading(true)
        setKeysError(null)
        apiGetApiKeys(projectId)
            .then((res) => setApiKeys(res?.list ?? []))
            .catch((e) =>
                setKeysError(apiErrorMessage(e, 'Не удалось загрузить API-ключи')),
            )
            .finally(() => setKeysLoading(false))
    }, [projectId])

    useEffect(() => {
        // TODO-279: чтения интеграций и API-ключей закрыты правом
        // `project:manage` на gateway (v1-data-bff.controller.ts,
        // listIntegrations/listApiKeys). Без права не дёргаем ручки вовсе —
        // иначе каждое открытие вкладки шлёт два заведомых 403.
        if (!canManage) {
            setIntLoading(false)
            setKeysLoading(false)
            return
        }
        loadIntegrations()
        loadApiKeys()
    }, [canManage, loadIntegrations, loadApiKeys])

    const openCreate = (type: IntegrationType) => {
        setEditing(null)
        setFormType(type)
        setFormName('')
        setFormConfig(blankConfig)
        setFormSecret('')
        setFormActive(true)
        setFormError(null)
        setDrawerOpen(true)
    }

    const openEdit = (int: ProjectIntegration) => {
        setEditing(int)
        setFormType(int.type)
        setFormName(int.name)
        setFormConfig({ ...int.config })
        setFormSecret('')
        setFormActive(int.status !== 'inactive')
        setFormError(null)
        setDrawerOpen(true)
    }

    const patchConfig = (patch: Partial<IntegrationConfig>) =>
        setFormConfig((c) => ({ ...c, ...patch }))

    const selectedEvents = formConfig.events ?? []
    const subscribedAll = selectedEvents.includes(WEBHOOK_EVENT_ALL)

    const toggleEvent = (key: string) => {
        const current = formConfig.events ?? []
        if (key === WEBHOOK_EVENT_ALL) {
            // "All events" is exclusive — selecting it clears the explicit list.
            patchConfig({ events: subscribedAll ? [] : [WEBHOOK_EVENT_ALL] })
            return
        }
        const withoutAll = current.filter((e) => e !== WEBHOOK_EVENT_ALL)
        patchConfig({
            events: withoutAll.includes(key)
                ? withoutAll.filter((e) => e !== key)
                : [...withoutAll, key],
        })
    }

    const openDeliveries = (int: ProjectIntegration) => {
        if (!projectId) return
        setDeliveriesFor(int)
        setDeliveries([])
        setDeliveriesError(null)
        setDeliveriesLoading(true)
        apiGetIntegrationDeliveries(projectId, int.id, 50)
            .then((res) => setDeliveries(res?.list ?? []))
            .catch((e) =>
                setDeliveriesError(
                    apiErrorMessage(e, 'Не удалось загрузить журнал доставок'),
                ),
            )
            .finally(() => setDeliveriesLoading(false))
    }

    const formValid = useMemo(() => {
        if (!formName.trim()) return false
        if (formType === 'rest') return Boolean(formConfig.endpoint?.trim())
        if (formType === 'kafka')
            return Boolean(formConfig.brokers?.trim() && formConfig.topic?.trim())
        return Boolean(formConfig.host?.trim() && formConfig.database?.trim())
    }, [formName, formType, formConfig])

    const handleSave = async () => {
        if (!projectId || !formValid) return
        setSaving(true)
        setFormError(null)
        const payload: CreateIntegrationPayload = {
            type: formType,
            name: formName.trim(),
            config: formConfig,
            status: formActive ? 'active' : 'inactive',
            ...(formSecret.trim() ? { secret: formSecret.trim() } : {}),
        }
        try {
            if (editing) {
                await apiUpdateIntegration(projectId, editing.id, payload)
                notify('Интеграция обновлена', 'success')
            } else {
                await apiCreateIntegration(projectId, payload)
                notify('Интеграция создана', 'success')
            }
            setDrawerOpen(false)
            loadIntegrations()
        } catch (e) {
            // BX-INTEG-6: surface the anti-SSRF verdict against the endpoint field.
            setFormError(
                webhookTargetError(e) ??
                    apiErrorMessage(e, 'Не удалось сохранить интеграцию'),
            )
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!projectId || !delTarget) return
        setDeleting(true)
        try {
            await apiDeleteIntegration(projectId, delTarget.id)
            notify('Интеграция удалена', 'success')
            setDelTarget(null)
            loadIntegrations()
        } catch (e) {
            notify(apiErrorMessage(e, 'Не удалось удалить интеграцию'), 'danger')
        } finally {
            setDeleting(false)
        }
    }

    const handleIssueKey = async () => {
        if (!projectId || !newKeyName.trim()) return
        setIssuing(true)
        setKeyFormError(null)
        try {
            const issued = await apiIssueApiKey(projectId, {
                name: newKeyName.trim(),
            })
            setKeyDrawerOpen(false)
            setNewKeyName('')
            setKeyCopied(false)
            setIssuedKey(issued)
            loadApiKeys()
        } catch (e) {
            setKeyFormError(apiErrorMessage(e, 'Не удалось выпустить ключ'))
        } finally {
            setIssuing(false)
        }
    }

    const handleRevoke = async () => {
        if (!projectId || !revokeTarget) return
        setRevoking(true)
        try {
            await apiRevokeApiKey(projectId, revokeTarget.id)
            notify('Ключ отозван', 'success')
            setRevokeTarget(null)
            loadApiKeys()
        } catch (e) {
            notify(apiErrorMessage(e, 'Не удалось отозвать ключ'), 'danger')
        } finally {
            setRevoking(false)
        }
    }

    const copyKey = async () => {
        if (!issuedKey) return
        try {
            await navigator.clipboard.writeText(issuedKey.key)
            setKeyCopied(true)
        } catch {
            setKeyCopied(false)
        }
    }

    // ST: no project selected
    if (!projectId) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.integrations.noProject')}>
                <p className="text-sm text-gray-500">Проект не выбран.</p>
            </AdaptiveCard>
        )
    }

    // ST: no-rights — read of config requires project:manage on this surface
    if (!canManage) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.integrations.stub')}>
                <div className="py-10 text-center text-sm text-gray-500">
                    Недостаточно прав для просмотра и настройки интеграций проекта.
                </div>
            </AdaptiveCard>
        )
    }

    return (
        <div className="flex flex-col gap-6" {...qa('host.projectSettings.integrations.root')}>
            {/* ── Create integration cards ──────────────────────────── */}
            <section {...qa('host.projectSettings.integrations.createSection')}>
                <h4 className="text-base font-semibold heading-text mb-3">
                    Создание интеграций
                </h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Подключите проект к внешним системам через REST API, Kafka
                    или прямое подключение к БД.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {integrationTypeCatalog.map((item) => (
                        <Card
                            key={item.id}
                            {...qa('host.projectSettings.integrations.createCard', { type: item.id })}
                            className="p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <PiPlugDuotone className="w-5 h-5 text-primary" />
                                </div>
                                <span className="font-semibold heading-text">
                                    {item.name}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                                {item.description}
                            </p>
                            <Button
                                {...qa('host.projectSettings.integrations.create', { type: item.id })}
                                variant="solid"
                                size="sm"
                                className="w-full"
                                icon={<PiPlusDuotone />}
                                onClick={() => openCreate(item.id)}
                            >
                                Создать
                            </Button>
                        </Card>
                    ))}
                </div>
            </section>

            {/* ── Connected integrations ────────────────────────────── */}
            <section {...qa('host.projectSettings.integrations.listSection')}>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-semibold heading-text">
                        Подключённые интеграции
                    </h4>
                </div>
                <AdaptiveCard {...qa('host.projectSettings.integrations.list')}>
                    {intError ? (
                        <div className="flex flex-col items-start gap-3 py-6">
                            <p
                                {...qa('host.projectSettings.integrations.error')}
                                className="text-sm text-red-600 dark:text-red-400"
                            >
                                {intError}
                            </p>
                            <Button
                                {...qa('host.projectSettings.integrations.retry')}
                                size="sm"
                                variant="solid"
                                onClick={loadIntegrations}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : intLoading ? (
                        <p {...qa('host.projectSettings.integrations.loading')} className="py-6 text-sm text-gray-400">
                            Загрузка интеграций…
                        </p>
                    ) : integrations.length === 0 ? (
                        <div {...qa('host.projectSettings.integrations.empty')} className="py-8 text-center text-gray-500 text-sm">
                            Нет подключённых интеграций. Создайте первую через
                            карточки выше.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {integrations.map((int) => (
                                <div
                                    key={int.id}
                                    {...qa('host.projectSettings.integrations.row', { integration: int.id })}
                                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <PiPlugDuotone className="w-5 h-5 text-gray-400 shrink-0" />
                                        <div className="min-w-0">
                                            <span className="font-medium">
                                                {int.name}
                                            </span>
                                            <span className="text-xs text-gray-500 ml-2">
                                                {integrationTypeLabel(int.type)} ·{' '}
                                                {integrationSubtitle(int)}
                                            </span>
                                        </div>
                                        <Tag
                                            className={
                                                int.status === 'active'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    : int.status === 'error'
                                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                      : ''
                                            }
                                        >
                                            {int.status === 'active'
                                                ? 'Активна'
                                                : int.status === 'error'
                                                  ? 'Ошибка'
                                                  : 'Неактивна'}
                                        </Tag>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {int.type === 'rest' && (
                                            <button
                                                type="button"
                                                {...qa('host.projectSettings.integrations.deliveries', {
                                                    integration: int.id,
                                                })}
                                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                aria-label="Журнал доставок"
                                                title="Доставки"
                                                onClick={() => openDeliveries(int)}
                                            >
                                                <PiListChecksDuotone className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.integrations.edit', {
                                                integration: int.id,
                                            })}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                            aria-label="Редактировать"
                                            onClick={() => openEdit(int)}
                                        >
                                            <PiPencilDuotone className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            {...qa('host.projectSettings.integrations.delete', {
                                                integration: int.id,
                                            })}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500"
                                            aria-label="Удалить"
                                            onClick={() => setDelTarget(int)}
                                        >
                                            <PiTrashDuotone className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </AdaptiveCard>
            </section>

            {/* ── API keys ──────────────────────────────────────────── */}
            <section {...qa('host.projectSettings.integrations.keysSection')}>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-semibold heading-text flex items-center gap-2">
                        <PiKeyDuotone className="w-5 h-5 text-primary" />
                        API-ключи
                    </h4>
                    <Button
                        {...qa('host.projectSettings.integrations.issueKey')}
                        variant="solid"
                        color="primary"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={() => {
                            setNewKeyName('')
                            setKeyFormError(null)
                            setKeyDrawerOpen(true)
                        }}
                    >
                        Сгенерировать ключ
                    </Button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    API-ключи используются для доступа к REST API проекта.
                    Храните ключи в безопасном месте — полное значение
                    показывается только при создании.
                </p>
                <AdaptiveCard {...qa('host.projectSettings.integrations.keysList')}>
                    {keysError ? (
                        <div className="flex flex-col items-start gap-3 py-6">
                            <p
                                {...qa('host.projectSettings.integrations.keysError')}
                                className="text-sm text-red-600 dark:text-red-400"
                            >
                                {keysError}
                            </p>
                            <Button
                                {...qa('host.projectSettings.integrations.keysRetry')}
                                size="sm"
                                variant="solid"
                                onClick={loadApiKeys}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : keysLoading ? (
                        <p {...qa('host.projectSettings.integrations.keysLoading')} className="py-6 text-sm text-gray-400">
                            Загрузка ключей…
                        </p>
                    ) : apiKeys.length === 0 ? (
                        <div {...qa('host.projectSettings.integrations.keysEmpty')} className="py-8 text-center text-gray-500 text-sm">
                            Ключей пока нет. Сгенерируйте первый ключ.
                        </div>
                    ) : (
                        <DataTable
                            {...qa('host.projectSettings.integrations.keysTable')}
                            columns={
                                [
                                    { header: 'Название', accessorKey: 'name' },
                                    {
                                        header: 'Ключ',
                                        id: 'masked',
                                        cell: ({ row }) => (
                                            <code className="text-xs">
                                                {row.original.maskedKey}
                                            </code>
                                        ),
                                    },
                                    {
                                        header: 'Создан',
                                        id: 'createdAt',
                                        cell: ({ row }) =>
                                            row.original.createdAt
                                                ? new Date(
                                                      row.original.createdAt,
                                                  ).toLocaleDateString('ru-RU')
                                                : '—',
                                    },
                                    {
                                        header: 'Последнее использование',
                                        id: 'lastUsedAt',
                                        cell: ({ row }) =>
                                            row.original.lastUsedAt
                                                ? new Date(
                                                      row.original.lastUsedAt,
                                                  ).toLocaleString('ru-RU')
                                                : '—',
                                    },
                                    {
                                        header: '',
                                        id: 'actions',
                                        cell: ({ row }) => (
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    {...qa('host.projectSettings.integrations.revokeKey', {
                                                        key: row.original.id,
                                                    })}
                                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500"
                                                    title="Отозвать"
                                                    aria-label="Отозвать ключ"
                                                    onClick={() =>
                                                        setRevokeTarget(
                                                            row.original,
                                                        )
                                                    }
                                                >
                                                    <PiTrashDuotone className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ),
                                    },
                                ] as ColumnDef<ProjectApiKey>[]
                            }
                            data={apiKeys}
                        />
                    )}
                </AdaptiveCard>
            </section>

            {/* ── Developer docs (BX-INTEG-7) ───────────────────────── */}
            <section>
                <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-base font-semibold heading-text flex items-center gap-2">
                        <PiListChecksDuotone className="w-5 h-5 text-primary" />
                        API и вебхуки
                    </h4>
                    <HelpIcon title="Как обращаться к публичному REST API проекта по ключу и как проверять подпись входящих вебхуков." />
                </div>
                <ApiDocs />
            </section>

            {/* ── Create/edit integration drawer ────────────────────── */}
            <Drawer
                isOpen={drawerOpen}
                {...qa('host.projectSettings.integrations.drawer')}
                title={
                    editing
                        ? `Редактировать: ${editing.name}`
                        : `Новая интеграция · ${integrationTypeLabel(formType)}`
                }
                onClose={() => setDrawerOpen(false)}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Название
                        </label>
                        <Input
                            {...qa('host.projectSettings.integrations.drawer.name')}
                            placeholder="Например, Внешний CRM"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                        />
                    </div>

                    {formType === 'rest' && (
                        <>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-medium mb-1">
                                    Endpoint URL
                                    <HelpIcon title="Внешний https-адрес, куда доставляются события. Внутренние, приватные и loopback-адреса запрещены политикой безопасности." />
                                </label>
                                <Input
                                    placeholder="https://api.partner.com/webhook"
                                    value={formConfig.endpoint ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ endpoint: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    HTTP-метод
                                </label>
                                <Input
                                    placeholder="POST"
                                    value={formConfig.httpMethod ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ httpMethod: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-1 text-sm font-medium mb-1">
                                    События
                                    <HelpIcon title="Какие события проекта отправлять на этот адрес. Каждое доставляется POST-запросом с HMAC-подписью в заголовке x-fairflow-signature. Выберите «Все события проекта», чтобы получать всё." />
                                </label>
                                <p className="text-xs text-gray-400 mb-2">
                                    Выберите, что доставлять на этот webhook.
                                </p>
                                <div className="flex flex-col gap-1.5">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            {...qa('host.projectSettings.integrations.eventAll')}
                                            type="checkbox"
                                            className="accent-primary"
                                            checked={subscribedAll}
                                            onChange={() =>
                                                toggleEvent(WEBHOOK_EVENT_ALL)
                                            }
                                        />
                                        <span className="font-medium">
                                            {webhookEventLabel(WEBHOOK_EVENT_ALL)}
                                        </span>
                                    </label>
                                    {WEBHOOK_EVENT_CATALOG.map((ev) => (
                                        <label
                                            key={ev.key}
                                            className={`flex items-center gap-2 text-sm cursor-pointer ${
                                                subscribedAll
                                                    ? 'opacity-50'
                                                    : ''
                                            }`}
                                        >
                                            <input
                                                {...qa('host.projectSettings.integrations.event', {
                                                    event: ev.key,
                                                })}
                                                type="checkbox"
                                                className="accent-primary"
                                                disabled={subscribedAll}
                                                checked={
                                                    subscribedAll ||
                                                    selectedEvents.includes(ev.key)
                                                }
                                                onChange={() =>
                                                    toggleEvent(ev.key)
                                                }
                                            />
                                            <span>{ev.label}</span>
                                            <code className="text-xs text-gray-400">
                                                {ev.key}
                                            </code>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {formType === 'kafka' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Брокеры (через запятую)
                                </label>
                                <Input
                                    placeholder="broker1:9092,broker2:9092"
                                    value={formConfig.brokers ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ brokers: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Топик
                                </label>
                                <Input
                                    placeholder="orders.events"
                                    value={formConfig.topic ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ topic: e.target.value })
                                    }
                                />
                            </div>
                        </>
                    )}

                    {formType === 'db' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Драйвер
                                </label>
                                <Input
                                    placeholder="postgres / mysql"
                                    value={formConfig.driver ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ driver: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Хост
                                    </label>
                                    <Input
                                        placeholder="db.example.com"
                                        value={formConfig.host ?? ''}
                                        onChange={(e) =>
                                            patchConfig({ host: e.target.value })
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Порт
                                    </label>
                                    <Input
                                        type="number"
                                        placeholder="5432"
                                        value={formConfig.port ?? ''}
                                        onChange={(e) =>
                                            patchConfig({
                                                port: e.target.value
                                                    ? Number(e.target.value)
                                                    : undefined,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    База данных
                                </label>
                                <Input
                                    placeholder="fairflow"
                                    value={formConfig.database ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ database: e.target.value })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Пользователь
                                </label>
                                <Input
                                    placeholder="readonly"
                                    value={formConfig.username ?? ''}
                                    onChange={(e) =>
                                        patchConfig({ username: e.target.value })
                                    }
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Секрет{' '}
                            <span className="text-xs text-gray-400">
                                {formType === 'db'
                                    ? '(пароль)'
                                    : '(токен / ключ авторизации)'}
                            </span>
                        </label>
                        <Input
                            type="password"
                            placeholder={
                                editing
                                    ? 'Оставьте пустым, чтобы не менять'
                                    : '••••••••'
                            }
                            value={formSecret}
                            onChange={(e) => setFormSecret(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-400">
                            Секрет хранится отдельно и не отображается в списке.
                        </p>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Активна</span>
                        <Switcher
                            checked={formActive}
                            onChange={(checked) => setFormActive(checked)}
                        />
                    </div>

                    {formError && (
                        <p
                            {...qa('host.projectSettings.integrations.formError')}
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {formError}
                        </p>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            variant="plain"
                            onClick={() => setDrawerOpen(false)}
                        >
                            Отмена
                        </Button>
                        <Button
                            {...qa('host.projectSettings.integrations.drawer.save')}
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={!formValid}
                            onClick={handleSave}
                        >
                            {editing ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </div>
            </Drawer>

            {/* ── Issue API-key drawer ──────────────────────────────── */}
            <Drawer
                isOpen={keyDrawerOpen}
                {...qa('host.projectSettings.integrations.keyDrawer')}
                title="Новый API-ключ"
                onClose={() => setKeyDrawerOpen(false)}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Название ключа
                        </label>
                        <Input
                            {...qa('host.projectSettings.integrations.keyDrawer.name')}
                            placeholder="Например, Интеграция 1С"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                        />
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <PiWarningDuotone className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>
                            Полное значение ключа будет показано один раз сразу
                            после создания. Скопируйте и сохраните его — повторно
                            посмотреть будет нельзя.
                        </span>
                    </div>
                    {keyFormError && (
                        <p
                            {...qa('host.projectSettings.integrations.keyFormError')}
                            className="text-sm text-red-600 dark:text-red-400"
                        >
                            {keyFormError}
                        </p>
                    )}
                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            variant="plain"
                            onClick={() => setKeyDrawerOpen(false)}
                        >
                            Отмена
                        </Button>
                        <Button
                            {...qa('host.projectSettings.integrations.keyDrawer.issue')}
                            variant="solid"
                            color="primary"
                            loading={issuing}
                            disabled={!newKeyName.trim()}
                            onClick={handleIssueKey}
                        >
                            Сгенерировать
                        </Button>
                    </div>
                </div>
            </Drawer>

            {/* ── Issued-key reveal modal (shown once) ──────────────── */}
            <Dialog
                isOpen={Boolean(issuedKey)}
                {...qa('host.projectSettings.integrations.issuedKeyDialog')}
                onClose={() => setIssuedKey(null)}
                onRequestClose={() => setIssuedKey(null)}
            >
                <h5 className="mb-1 flex items-center gap-2">
                    <PiCheckCircleDuotone className="w-5 h-5 text-emerald-500" />
                    Ключ «{issuedKey?.name}» создан
                </h5>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Скопируйте ключ сейчас — он больше не будет показан.
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50 dark:bg-gray-700/40">
                    <code className="text-sm break-all flex-1">
                        {issuedKey?.key}
                    </code>
                    <Button
                        size="xs"
                        variant="solid"
                        icon={<PiCopyDuotone />}
                        onClick={copyKey}
                    >
                        {keyCopied ? 'Скопировано' : 'Копировать'}
                    </Button>
                </div>
                <div className="flex justify-end pt-5">
                    <Button
                        variant="solid"
                        color="primary"
                        onClick={() => setIssuedKey(null)}
                    >
                        Готово
                    </Button>
                </div>
            </Dialog>

            {/* ── Delete integration confirm ────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(delTarget)}
                type="danger"
                title="Удалить интеграцию?"
                {...qa('host.projectSettings.integrations.deleteDialog')}
                confirmText="Удалить"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qa('host.projectSettings.integrations.deleteConfirm'),
                    loading: deleting,
                }}
                onClose={() => setDelTarget(null)}
                onRequestClose={() => setDelTarget(null)}
                onCancel={() => setDelTarget(null)}
                onConfirm={handleDelete}
            >
                <p>
                    Интеграция «{delTarget?.name}» будет удалена. Внешние системы
                    перестанут получать данные по этому подключению.
                </p>
            </ConfirmDialog>

            {/* ── Revoke key confirm ────────────────────────────────── */}
            <ConfirmDialog
                isOpen={Boolean(revokeTarget)}
                type="danger"
                title="Отозвать ключ?"
                {...qa('host.projectSettings.integrations.revokeDialog')}
                confirmText="Отозвать"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qa('host.projectSettings.integrations.revokeConfirm'),
                    loading: revoking,
                }}
                onClose={() => setRevokeTarget(null)}
                onRequestClose={() => setRevokeTarget(null)}
                onCancel={() => setRevokeTarget(null)}
                onConfirm={handleRevoke}
            >
                <p>
                    Ключ «{revokeTarget?.name}» перестанет работать немедленно.
                    Это действие необратимо.
                </p>
            </ConfirmDialog>

            {/* ── Deliveries panel (REST webhook journal) ───────────────── */}
            <Drawer
                isOpen={Boolean(deliveriesFor)}
                {...qa('host.projectSettings.integrations.deliveriesDrawer')}
                width={640}
                title={`Доставки · ${deliveriesFor?.name ?? ''}`}
                onClose={() => setDeliveriesFor(null)}
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Последние попытки доставки событий на{' '}
                        <code className="text-xs break-all">
                            {deliveriesFor?.config.endpoint ?? '—'}
                        </code>
                        . Каждый POST подписан заголовком{' '}
                        <code className="text-xs">x-fairflow-signature</code>.
                    </p>
                    {deliveriesError ? (
                        <div className="flex flex-col items-start gap-3 py-6">
                            <p
                                {...qa('host.projectSettings.integrations.deliveriesError')}
                                className="text-sm text-red-600 dark:text-red-400"
                            >
                                {deliveriesError}
                            </p>
                            <Button
                                {...qa('host.projectSettings.integrations.deliveriesRetry')}
                                size="sm"
                                variant="solid"
                                onClick={() =>
                                    deliveriesFor && openDeliveries(deliveriesFor)
                                }
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : deliveriesLoading ? (
                        <p {...qa('host.projectSettings.integrations.deliveriesLoading')} className="py-6 text-sm text-gray-400">
                            Загрузка доставок…
                        </p>
                    ) : deliveries.length === 0 ? (
                        <div {...qa('host.projectSettings.integrations.deliveriesEmpty')} className="py-8 text-center text-gray-500 text-sm">
                            Доставок пока нет. Как только произойдёт подписанное
                            событие, попытки появятся здесь.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {deliveries.map((d) => {
                                const meta = DELIVERY_STATUS_META[d.status]
                                return (
                                    <div
                                        key={d.id}
                                        className="rounded-lg border border-gray-200 dark:border-gray-600 p-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-sm">
                                                {webhookEventLabel(d.eventType)}
                                            </span>
                                            <Tag className={meta?.cls}>
                                                {meta?.label ?? d.status}
                                            </Tag>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                                            <span>
                                                {d.createdAt
                                                    ? new Date(
                                                          d.createdAt,
                                                      ).toLocaleString('ru-RU')
                                                    : '—'}
                                            </span>
                                            <span>
                                                HTTP:{' '}
                                                {d.httpCode ?? 'нет ответа'}
                                            </span>
                                            <span>Попыток: {d.attempts}</span>
                                            <code className="text-gray-400">
                                                {d.eventType}
                                            </code>
                                        </div>
                                        {d.error && (
                                            <p className="mt-1 text-xs text-red-600 dark:text-red-400 break-all">
                                                {d.error}
                                            </p>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </Drawer>
        </div>
    )
}

const Settings = ({ projectId: propProjectId }: { projectId?: string }) => {
    const location = useLocation()
    /**
     * TODO-279: вкладка «Интеграции» целиком под `project:manage` — и списки
     * интеграций, и список API-ключей закрыты этим правом на gateway
     * (v1-data-bff.controller.ts). Маршрут настроек открыт любому участнику
     * (routes.config.ts, `authority: []`), поэтому без гейта рядовой участник
     * видел в TabList вкладку, за которой его ждёт только отказ.
     * TabContent при этом НЕ гейтим: deep-link `?tab=integrations` должен
     * открывать честную заглушку IntegrationsTab, а не пустую панель.
     */
    const canManageProject = usePermission('project', 'manage')
    const can = usePermission()
    const { projectId: urlProjectId } = useParams<{ projectId: string }>()
    const storeProjectId = useProjectStore((s) => s.currentProjectId)
    const projectId = propProjectId ?? urlProjectId ?? storeProjectId ?? undefined
    const initialTab = useMemo(() => {
        // TODO-454: `?tab=` — САМЫЙ специфичный источник и проверяется ПЕРВЫМ.
        // Раньше суффикс пути выигрывал, поэтому на `/settings/modules`
        // переключение вкладки писало `?tab=general`, а useEffect ниже тут же
        // возвращал 'modules' — вкладка «залипала».
        // Legacy-имена (policies/members/roles) ремапятся в «Доступ» (BX-MODEL-1).
        const wanted = new URLSearchParams(location.search).get('tab')
        if (wanted) {
            const mapped = LEGACY_TAB_MAP[wanted] ?? wanted
            if (SETTINGS_TABS.includes(mapped)) return mapped
            // Вкладка модуля (FR-PSET-230): `?tab=module:search`. Существование
            // проверяется ниже — если вклада нет, откатываемся на «Основное».
            if (isModuleTab(mapped)) return mapped
            if (isSlotTab(mapped)) return mapped
            // Legacy deep-link before module:/slot: prefixes.
            if (mapped === 'search') return moduleTabValue('search')
        }
        if (location.pathname.endsWith('/settings/modules')) return 'modules'
        // BX-MODEL-1: legacy `/settings/policies` route → единый раздел «Доступ».
        if (location.pathname.endsWith('/settings/policies')) return 'access'
        return 'general'
    }, [location.pathname, location.search])
    const [activeTab, setActiveTab] = useState(initialTab)
    const [, setSearchParams] = useSearchParams()
    /**
     * TODO-454: переключение вкладки пишется в `?tab=`, чтобы ссылку на открытую
     * вкладку можно было скопировать, а «назад» возвращал на предыдущую.
     * Остальные query-параметры сохраняем (функциональная форма setSearchParams).
     */
    const handleTabChange = useCallback(
        (val: string) => {
            setActiveTab(val)
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev)
                    next.set('tab', val)
                    return next
                },
                { replace: false },
            )
        },
        [setSearchParams],
    )
    const [moduleRegistry, setModuleRegistry] = useState<ModuleMeta[]>([])
    const [registryError, setRegistryError] = useState<string | null>(null)
    const storeProjectName = useProjectStore((s) => s.currentProject?.name)
    const [projectName, setProjectName] = useState<string | undefined>(storeProjectName)
    const enabledModules = useChromeModuleKeys()
    const canUse = useCallback(
        (requires?: string) => {
            if (!requires) return true
            const [subject, action] = requires.split(':')
            return subject && action ? can(subject, action) : true
        },
        [can],
    )
    /**
     * FR-PSET-230 / FR-SHELL-070: вклады модулей в слот `project.settings.tab`.
     * Каждый вклад = отдельная вкладка настроек проекта; рендер вклада
     * (границы ошибок, Suspense, гейт `requires`) — в `SettingsSlotTabs`.
     */
    const slotContributions = useSlotContributions('project.settings.tab')
    const slotTabs = useMemo(
        () => slotContributions.filter((c) => c.wired && canUse(c.requires)),
        [slotContributions, canUse],
    )
    /**
     * Экраны настроек, которые host монтирует напрямую (`ModuleSettingsPanel`) —
     * для модулей, чей вклад в слот `project.settings.tab` не смонтирован
     * (слот `open` после OQ-MODULE-130; живой вклад выигрывает — `slotModuleIds`).
     * Видны только для включённых в проекте модулей и только под `project:manage`
     * (гейт слота `project.settings.tab` из SLOT_CATALOG).
     */
    const panelTabs = useMemo(
        () =>
            moduleSettingsPanelTabs({
                registry: moduleRegistry,
                enabledModuleIds: enabledModules,
                canManageProject,
                projectId,
                currentProjectId: storeProjectId,
                slotModuleIds: slotTabs.map((c) => c.moduleId),
            }),
        [
            canManageProject,
            moduleRegistry,
            enabledModules,
            slotTabs,
            projectId,
            storeProjectId,
        ],
    )
    const moduleTabValues = useMemo(
        () =>
            new Set([
                ...slotTabs.map((c) =>
                    moduleTabValue(c.moduleId, c.component),
                ),
                ...panelTabs.map((t) => moduleTabValue(t.moduleId)),
            ]),
        [slotTabs, panelTabs],
    )
    useEffect(() => {
        setActiveTab(initialTab)
    }, [initialTab])
    // Deep-link `?tab=module:<id>` на вкладку, которой в этом проекте нет
    // (модуль выключен / нет прав / вклад не смонтирован) — не оставляем пустой
    // экран под заголовком.
    useEffect(() => {
        if (
            (isModuleTab(activeTab) || isSlotTab(activeTab)) &&
            moduleRegistry.length > 0 &&
            !moduleTabValues.has(activeTab)
        ) {
            setActiveTab('general')
        }
    }, [activeTab, moduleRegistry.length, moduleTabValues])
    // Load the real project name for the header (closes D2 hardcode).
    useEffect(() => {
        if (!projectId) return
        let mounted = true
        apiGetProject<{ name?: string }>(projectId)
            .then((res) => {
                if (mounted && res?.name) setProjectName(res.name)
            })
            .catch(() => undefined)
        return () => {
            mounted = false
        }
    }, [projectId])
    useEffect(() => {
        let mounted = true
        const loadRegistry = async () => {
            try {
                const response = await apiGetModulesRegistry()
                const list = Array.isArray(response?.list) ? response.list : []
                const normalized: ModuleMeta[] = list
                    .filter((item): item is ModuleRegistryItem =>
                        Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item),
                    )
                    .map((item) => ({
                        id: item.id,
                        name: item.name,
                        description: item.description ?? '',
                        locked: Boolean(item.locked),
                        dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
                        integrationMethods: Array.isArray(item.integrationMethods)
                            ? item.integrationMethods.map((method) => ({
                                  id: method.id,
                                  name: method.name,
                                  description: method.description,
                              }))
                            : [],
                        personalSettingsSchema:
                            item.personalSettingsSchema &&
                            typeof item.personalSettingsSchema === 'object'
                                ? item.personalSettingsSchema
                                : {},
                        integrationSettingsSchema:
                            item.integrationSettingsSchema &&
                            typeof item.integrationSettingsSchema === 'object'
                                ? item.integrationSettingsSchema
                                : {},
                    }))
                if (mounted) {
                    setModuleRegistry(normalized)
                    setRegistryError(
                        normalized.length > 0
                            ? null
                            : 'Сервер вернул пустой список модулей',
                    )
                }
            } catch {
                if (mounted) {
                    setModuleRegistry([])
                    setRegistryError('Не удалось загрузить реестр модулей')
                }
            }
        }
        loadRegistry()
        return () => {
            mounted = false
        }
    }, [])

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <PiGearSixDuotone className="w-7 h-7 text-gray-500" />
                        <h3 {...qa('host.projectSettings.heading')}>
                            Настройки{projectName ? ` — ${projectName}` : ''}
                        </h3>
                    </div>

                    <Tabs value={activeTab} onChange={handleTabChange}>
                        <TabList {...qa('host.projectSettings.tabList')}>
                            <TabNav value="general" {...qa('host.projectSettings.tab', { tab: 'general' })}>
                                Основное
                            </TabNav>
                            {/* FR-PLATFORM-250: матрица модулей — read-only любому участнику. */}
                            <TabNav value="modules" {...qa('host.projectSettings.tab', { tab: 'modules' })}>
                                Модули
                            </TabNav>
                            {canManageProject && (
                                <>
                                    <TabNav
                                        value="access"
                                        {...qa('host.projectSettings.tab', { tab: 'access' })}
                                    >
                                        Доступ
                                    </TabNav>
                                    <TabNav
                                        value="unassigned"
                                        {...qa('host.projectSettings.tab', { tab: 'unassigned' })}
                                    >
                                        Без владельца
                                    </TabNav>
                                    <TabNav
                                        value="teamStatus"
                                        {...qa('host.projectSettings.tab', { tab: 'teamStatus' })}
                                    >
                                        Статус команды
                                    </TabNav>
                                </>
                            )}
                            <TabNav value="audit" {...qa('host.projectSettings.tab', { tab: 'audit' })}>
                                Аудит
                            </TabNav>
                            <TabNav
                                value="pipelines"
                                {...qa('host.projectSettings.tab', { tab: 'pipelines' })}
                            >
                                Воронки
                            </TabNav>
                            <TabNav
                                value="orderTypes"
                                {...qa('host.projectSettings.tab', { tab: 'orderTypes' })}
                            >
                                Типы продаж
                            </TabNav>
                            <TabNav value="sources" {...qa('host.projectSettings.tab', { tab: 'sources' })}>
                                Источники
                            </TabNav>
                            {canManageProject && (
                                <TabNav
                                    value="integrations"
                                    {...qa('host.projectSettings.tab', { tab: 'integrations' })}
                                >
                                    Интеграции
                                </TabNav>
                            )}
                            <SettingsSlotTabs
                                variant="nav"
                                projectId={projectId}
                                activeTab={activeTab}
                            />
                            {panelTabs.map((tab) => (
                                <TabNav
                                    key={tab.moduleId}
                                    value={moduleTabValue(tab.moduleId)}
                                    {...qa('host.projectSettings.tab', {
                                        tab: moduleTabValue(tab.moduleId),
                                    })}
                                >
                                    {tab.label}
                                </TabNav>
                            ))}
                        </TabList>
                        <div className="mt-4">
                            <TabContent value="general">
                                <GeneralTab projectId={projectId} />
                            </TabContent>
                            <TabContent value="modules">
                                {registryError ? (
                                    <AdaptiveCard>
                                        <p
                                            {...qa('host.projectSettings.registryError')}
                                            className="text-sm text-red-600 dark:text-red-400"
                                        >
                                            {registryError}
                                        </p>
                                    </AdaptiveCard>
                                ) : null}
                                <ModulesTab projectId={projectId} moduleRegistry={moduleRegistry} />
                            </TabContent>
                            <TabContent value="access">
                                <AccessTab projectId={projectId} />
                            </TabContent>
                            <TabContent value="unassigned">
                                <UnassignedTab projectId={projectId} />
                            </TabContent>
                            <TabContent value="teamStatus">
                                <TeamStatus />
                            </TabContent>
                            <TabContent value="audit">
                                <AuditTab projectId={projectId} />
                            </TabContent>
                            <TabContent value="pipelines">
                                <PipelinesTab />
                            </TabContent>
                            <TabContent value="orderTypes">
                                <OrderTypesTab />
                            </TabContent>
                            <TabContent value="sources">
                                <SourcesTab />
                            </TabContent>
                            <TabContent
                                value="integrations"
                                {...qa('host.projectSettings.tabContent', { tab: 'integrations' })}
                            >
                                <IntegrationsTab projectId={projectId} />
                            </TabContent>
                            <SettingsSlotTabs
                                variant="panels"
                                projectId={projectId}
                                activeTab={activeTab}
                            />
                            {panelTabs.map((tab) => (
                                <TabContent
                                    key={tab.moduleId}
                                    value={moduleTabValue(tab.moduleId)}
                                    {...qa('host.projectSettings.tabContent', {
                                        tab: moduleTabValue(tab.moduleId),
                                    })}
                                >
                                    <ModuleSettingsPanel
                                        moduleId={tab.moduleId}
                                        projectId={projectId}
                                        moduleDisabled={!enabledModules.includes(tab.moduleId)}
                                    />
                                </TabContent>
                            ))}
                        </div>
                    </Tabs>
                </div>
            </AdaptiveCard>
        </Container>
    )
}

export default Settings
