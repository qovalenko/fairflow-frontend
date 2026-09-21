import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
    PiBriefcaseDuotone,
    PiPhoneDuotone,
    PiCarDuotone,
    PiTruckDuotone,
    PiGearSixDuotone,
    PiCheckDuotone,
    PiArrowLeftDuotone,
    PiArrowRightDuotone,
    PiXBold,
    PiPlusDuotone,
    PiLockKeyDuotone,
    PiFlowArrowDuotone,
    PiWarningDuotone,
    PiQuestion,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Progress from '@/components/ui/Progress'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Alert from '@/components/ui/Alert'
import { FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { qa, qaWithAlias } from '@/shared/qa'
import { useSessionUser } from '@/store/authStore'
import {
    apiCreateProject,
    apiCreateInvitation,
    apiGetProjectTemplates,
    type ProjectTemplate,
} from '@/services/CrmService'
import { resolveCreateProjectSubmitError } from './createProjectErrors'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import {
    FALLBACK_PROJECT_TEMPLATES,
    MODULE_LABELS,
    ALL_MODULE_IDS,
    LOCKED_MODULE_ID,
} from './templatesFallback'
import { previewWizardEnableCascade } from '@/utils/moduleDependencies'
import {
    completeOnboardingWizard,
    startOnboardingWizard,
} from '@/utils/onboardingMetrics'

/** Per-template icon (UI only; not part of the catalog contract). */
const TEMPLATE_ICONS: Record<
    string,
    React.ComponentType<{ className?: string }>
> = {
    'b2b-sales': PiBriefcaseDuotone,
    'call-center': PiPhoneDuotone,
    'car-dealer': PiCarDuotone,
    delivery: PiTruckDuotone,
    default: PiGearSixDuotone,
}

const roles = [
    { value: 'member', label: 'Участник' },
    { value: 'manager', label: 'Менеджер' },
    { value: 'admin', label: 'Администратор' },
    { value: 'viewer', label: 'Наблюдатель' },
]

const ROLE_HINT =
    'Роль участника в проекте: «Менеджер» — работа со сделками, «Администратор» — управление настройками, «Наблюдатель» — только чтение.'

/** Wizard role → system project role (owner/admin/manager/member/viewer). */
const PROJECT_ROLES = new Set(['admin', 'manager', 'member', 'viewer'])
function toProjectRole(wizardRole: string): string {
    return PROJECT_ROLES.has(wizardRole) ? wizardRole : 'member'
}

interface Invite {
    id: string
    email: string
    role: string
}

type ModuleMap = Record<string, boolean>

const emptyModuleMap = (): ModuleMap =>
    ALL_MODULE_IDS.reduce((acc, id) => {
        acc[id] = false
        return acc
    }, {} as ModuleMap)

/** Generate a fresh idempotency key per submit attempt (FR-ONB-15). */
const genIdempotencyKey = () =>
    `prj-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

const CreateProject = () => {
    const navigate = useNavigate()
    const userId = useSessionUser((s) => s.user.userId)
    const setUser = useSessionUser((s) => s.setUser)
    const user = useSessionUser((s) => s.user)
    // box single-tenant: владелец проекта — единственная Система; выбора владельца
    // и личного вектора нет (BE проставляет владельца по контексту).
    const { systemId } = useWorkspaceRole()

    // ── Templates from API (FR-ONB-2) with deterministic fallback (ST-6) ──
    const [templates, setTemplates] = useState<ProjectTemplate[]>([])
    const [templatesLoading, setTemplatesLoading] = useState(true)
    const [templatesError, setTemplatesError] = useState(false)

    const loadTemplates = useMemo(
        () => async () => {
            setTemplatesLoading(true)
            setTemplatesError(false)
            try {
                const list = await apiGetProjectTemplates()
                if (Array.isArray(list) && list.length > 0) {
                    setTemplates(list)
                } else {
                    // Empty/unexpected payload — degrade to builtin (OQ-UX-ONB-7).
                    setTemplates(FALLBACK_PROJECT_TEMPLATES)
                    setTemplatesError(true)
                }
            } catch {
                // Network/server error — degrade to builtin catalog, keep retry.
                setTemplates(FALLBACK_PROJECT_TEMPLATES)
                setTemplatesError(true)
            } finally {
                setTemplatesLoading(false)
            }
        },
        [],
    )

    useEffect(() => {
        void loadTemplates()
    }, [loadTemplates])

    useEffect(() => {
        startOnboardingWizard()
    }, [])

    const [step, setStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [provisioning, setProvisioning] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [modulesCustomized, setModulesCustomized] = useState(false)
    const [pendingTemplate, setPendingTemplate] = useState<ProjectTemplate | null>(
        null,
    )
    const [moduleCascadeHint, setModuleCascadeHint] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        template: '',
        name: '',
        description: '',
        modules: emptyModuleMap(),
        // Наполнить проект демо-данными (по включённым модулям). По умолчанию выкл.
        seedDemoData: false,
        invites: [{ id: '1', email: '', role: 'member' }] as Invite[],
    })

    const selectedTemplateData = templates.find(
        (t) => t.id === formData.template,
    )

    // box single-tenant: всегда 4 шага (шаблон → инфо → модули → участники).
    const totalSteps = 4

    const applyTemplateSelection = (template: ProjectTemplate) => {
        const map = emptyModuleMap()
        for (const id of template.modules ?? []) {
            if (id in map) map[id] = true
        }
        map[LOCKED_MODULE_ID] = true
        setFormData((prev) => ({
            ...prev,
            template: template.id,
            modules: map,
        }))
        setModulesCustomized(false)
        setModuleCascadeHint(null)
        setErrors((prev) => ({ ...prev, template: '' }))
    }

    /**
     * FR-ONB-3 / FR-PSET-410: pick a template → prefill step-3 modules from
     * `template.modules`. Warn before overwriting manual tweaks on step 3.
     */
    const requestSelectTemplate = (template: ProjectTemplate) => {
        if (
            modulesCustomized &&
            formData.template &&
            formData.template !== template.id
        ) {
            setPendingTemplate(template)
            return
        }
        applyTemplateSelection(template)
    }

    const confirmTemplateReset = () => {
        if (pendingTemplate) applyTemplateSelection(pendingTemplate)
        setPendingTemplate(null)
    }

    const validateStep = (stepNum: number): boolean => {
        const newErrors: Record<string, string> = {}

        if (stepNum === 1) {
            if (!formData.template) {
                newErrors.template = 'Выберите шаблон'
            }
        } else if (stepNum === 2) {
            if (!formData.name.trim()) {
                newErrors.name = 'Введите название проекта'
            }
        } else if (stepNum === 4) {
            formData.invites.forEach((invite, index) => {
                if (
                    invite.email &&
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email)
                ) {
                    newErrors[`invites.${index}.email`] =
                        'Введите корректный email'
                }
            })
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleNext = () => {
        if (validateStep(step)) {
            if (step === 1 && selectedTemplateData) {
                setFormData((prev) => ({
                    ...prev,
                    name:
                        prev.name.trim() ||
                        selectedTemplateData.name ||
                        'Мой проект',
                }))
            }
            setStep((s) => s + 1)
        }
    }

    const handleBack = () => {
        setStep((s) => s - 1)
    }

    const submitInvites = async (createdProjectId: string) => {
        const pendingInvites = formData.invites.filter(
            (inv) =>
                inv.email.trim() &&
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email.trim()),
        )
        if (pendingInvites.length === 0) return { sent: 0, failed: 0 }
        const results = await Promise.allSettled(
            pendingInvites.map((inv) =>
                apiCreateInvitation({
                    // Org role stays coarse (admin → platform_admin, else employee)…
                    role: inv.role === 'admin' ? 'platform_admin' : 'employee',
                    email: inv.email.trim(),
                    // …but the granular wizard role (manager/member/viewer/admin) is
                    // carried into a project grant on the just-created project so the
                    // invitee also becomes a ProjectMember (FR-ONB-10). control drops
                    // grants to projects outside the org.
                    projectGrants: createdProjectId
                        ? [
                              {
                                  projectId: createdProjectId,
                                  role: toProjectRole(inv.role),
                              },
                          ]
                        : undefined,
                }),
            ),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        return { sent: pendingInvites.length - failed, failed }
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!userId) return
        // Guard against implicit form submits (e.g. Enter in a step-1/2 input):
        // the project is created ONLY from the explicit "Создать проект" click on
        // the final step. Any submit fired before the last step is a no-op.
        if (step !== totalSteps) return
        if (isSubmitting || provisioning) return
        if (!validateStep(4)) return
        // box: владелец — Система; BE авторитетно проставляет владельца проекта.
        const ownerId = systemId ?? ''
        setErrors((prev) => ({ ...prev, submit: '' }))
        setIsSubmitting(true)
        const idempotencyKey = genIdempotencyKey()
        try {
            const res = await apiCreateProject(
                {
                    ownerType: 'ORGANIZATION',
                    ownerId,
                    name: formData.name.trim(),
                    templateId: formData.template || undefined,
                    modules: ALL_MODULE_IDS.filter((id) => formData.modules[id]),
                    createdByUserId: userId,
                    seedDemoData: formData.seedDemoData,
                },
                idempotencyKey,
            )
            const createdOwnerId = res.ownerId ?? res.owner_id ?? ownerId

            // NFR-ONB-6 / ST-26: show "Настраиваем ваш проект…" while invites are
            // sent and the backend provisions pipeline/order-types (best-effort).
            setProvisioning(true)

            // box: приглашения в Систему; отправляем всегда (single-tenant).
            const summary = await submitInvites(res.id)
            if (summary.failed > 0) {
                // FR-PSET-460 / FR-ONB-17: partial invite failure does NOT cancel creation.
                toast.push(
                    <Notification
                        title="Приглашения отправлены частично"
                        type="warning"
                        {...qa('host.createProject.inviteToastPartial')}
                    >
                        {`Отправлено ${summary.sent} из ${summary.sent + summary.failed}. Проверьте email и повторите приглашение позже.`}
                    </Notification>,
                )
            } else if (summary.sent > 0) {
                toast.push(
                    <Notification
                        title="Приглашения отправлены"
                        type="success"
                        {...qa('host.createProject.inviteToastSuccess')}
                    >
                        {`Отправлено ${summary.sent} из ${summary.sent}.`}
                    </Notification>,
                )
            }

            completeOnboardingWizard(res.id)

            // Modules the user actually enabled in step 3 (deals is always on).
            const chosenModules = ALL_MODULE_IDS.filter(
                (id) => formData.modules[id],
            )
            // BE авто-каскадит зависимости (products→orders→deals) и молча
            // отбрасывает невалидные id — истина набора в `effective_modules`
            // ответа, НЕ в отправленном списке. Берём его, чтобы каскадно
            // доключённые модули сразу отразились в сайдбаре/редиректе (иначе
            // post-create redirect резолвил бы модуль по неполному списку и мог
            // вести на выключенный раздел). Fallback на chosenModules — если
            // ответ (legacy/offline-mock) поле не вернул.
            const effectiveModules =
                res.effective_modules && res.effective_modules.length > 0
                    ? res.effective_modules
                    : res.modules && res.modules.length > 0
                      ? res.modules
                      : chosenModules
            const newProject = {
                id: res.id,
                name: res.name,
                color: '#6366f1',
                ownerType: 'ORGANIZATION' as const,
                ownerId: createdOwnerId,
                role: 'owner' as const,
                enabledModules: effectiveModules,
                effectiveModules: effectiveModules,
            }
            setUser({
                ...user,
                projects: [...(user.projects ?? []), newProject],
            })
            navigate(`/p/${res.id}`, { replace: true })
        } catch (error) {
            console.error('Project creation failed:', error)
            setErrors((prev) => ({
                ...prev,
                submit: resolveCreateProjectSubmitError(error),
            }))
            setProvisioning(false)
        } finally {
            setIsSubmitting(false)
        }
    }

    const addInvite = () => {
        setFormData((prev) => ({
            ...prev,
            invites: [
                ...prev.invites,
                { id: Date.now().toString(), email: '', role: 'member' },
            ],
        }))
    }

    const removeInvite = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            invites: prev.invites.filter((inv) => inv.id !== id),
        }))
    }

    const updateInvite = (id: string, field: 'email' | 'role', value: string) => {
        setFormData((prev) => ({
            ...prev,
            invites: prev.invites.map((inv) =>
                inv.id === id ? { ...inv, [field]: value } : inv,
            ),
        }))
    }

    // ── ST-26: full-screen provisioning indicator (NFR-ONB-6) ──
    if (provisioning) {
        return (
            <Container>
                <div
                    {...qa('host.createProject.provisioning')}
                    className="py-20 flex flex-col items-center justify-center text-center"
                >
                    <Spinner size={48} />
                    <h3 className="text-xl font-bold mt-6 mb-2">
                        Настраиваем ваш проект…
                    </h3>
                    <p className="text-sm text-gray-500 max-w-sm">
                        Создаём воронку, типы продаж и отправляем приглашения.
                        Это займёт несколько секунд.
                    </p>
                </div>
            </Container>
        )
    }

    const renderStep1 = () => (
        <div>
            <h3 className="text-xl font-bold mb-4">Выберите шаблон</h3>

            {/* ST-6: API failed → degraded to builtin catalog + retry. */}
            {templatesError && !templatesLoading && (
                <Alert
                    {...qa('host.createProject.templateLoadError')}
                    showIcon
                    type="warning"
                    className="mb-4"
                    customIcon={<PiWarningDuotone />}
                    {...qa('host.createProject.templatesError')}
                >
                    <div className="flex items-center justify-between gap-3">
                        <span>
                            Не удалось загрузить каталог шаблонов — показаны
                            встроенные. Попробуйте обновить.
                        </span>
                        <Button
                            {...qa('host.createProject.templateRetry')}
                            size="xs"
                            variant="plain"
                            {...qa('host.createProject.templatesRefresh')}
                            onClick={() => void loadTemplates()}
                            {...qa('host.createProject.templatesRetry')}
                        >
                            Обновить
                        </Button>
                    </div>
                </Alert>
            )}

            {/* ST-1: skeleton grid while the catalog loads. */}
            {templatesLoading ? (
                <div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    {...qa('host.createProject.templatesLoading')}
                >
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="h-36 rounded-lg border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 animate-pulse"
                        />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((template) => {
                        const Icon =
                            TEMPLATE_ICONS[template.id] ?? PiGearSixDuotone
                        const isSelected = formData.template === template.id
                        return (
                            <button
                                key={template.id}
                                type="button"
                                {...qa('host.createProject.template', {
                                    template: template.id,
                                })}
                                className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                                    isSelected
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                                onClick={() => requestSelectTemplate(template)}
                            >
                                {template.recommended && (
                                    <Tag className="absolute top-2 right-2 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs">
                                        Рекомендуется
                                    </Tag>
                                )}
                                {isSelected && (
                                    <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                                        <PiCheckDuotone className="w-3 h-3 text-white" />
                                    </div>
                                )}
                                <div className="flex flex-col items-center text-center mt-2">
                                    <div
                                        className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${
                                            isSelected
                                                ? 'bg-blue-500 text-white'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                        }`}
                                    >
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <h4 className="font-semibold mb-1">
                                        {template.name}
                                    </h4>
                                    {template.description && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* EL-WZ-5 (FR-ONB-18): pipeline preview for the selected template. */}
            {selectedTemplateData?.pipeline?.stages?.length ? (
                <div
                    {...qa('host.createProject.pipelinePreview')}
                    className="mt-5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4"
                >
                    <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <PiFlowArrowDuotone className="w-4 h-4" />
                        Воронка «
                        {selectedTemplateData.pipeline.name ?? 'Воронка'}» ·{' '}
                        {selectedTemplateData.pipeline.stages.length} стадий
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedTemplateData.pipeline.stages.map(
                            (stage, idx) => (
                                <div
                                    key={stage.id}
                                    className="flex items-center gap-2"
                                >
                                    <span
                                        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600"
                                        style={
                                            stage.color
                                                ? {
                                                      borderColor: stage.color,
                                                      color: stage.color,
                                                  }
                                                : undefined
                                        }
                                    >
                                        {stage.name}
                                    </span>
                                    {idx <
                                        selectedTemplateData.pipeline!.stages!
                                            .length -
                                            1 && (
                                        <PiArrowRightDuotone className="w-3.5 h-3.5 text-gray-400" />
                                    )}
                                </div>
                            ),
                        )}
                    </div>
                </div>
            ) : null}

            {errors.template && (
                <p className="text-red-500 text-sm mt-2">{errors.template}</p>
            )}
        </div>
    )

    const renderStep2 = () => (
        <div>
            <h3 className="text-xl font-bold mb-4">Основная информация</h3>
            <div className="space-y-4">
                <FormItem
                    invalid={Boolean(errors.name)}
                    errorMessage={errors.name}
                >
                    <Input
                        {...qa('host.createProject.name')}
                        placeholder="Название проекта"
                        suffix={<HelpIcon title="Название проекта" />}
                        value={formData.name}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                name: e.target.value,
                            }))
                        }
                    />
                </FormItem>
                <FormItem
                    label="Описание"
                    invalid={Boolean(errors.description)}
                    errorMessage={errors.description}
                >
                    <Input
                        textArea
                        placeholder="Опишите проект (необязательно)"
                        value={formData.description}
                        onChange={(e) =>
                            setFormData((prev) => ({
                                ...prev,
                                description: e.target.value,
                            }))
                        }
                    />
                </FormItem>
            </div>
        </div>
    )

    const renderStep3 = () => (
        <div>
            <h3 className="text-xl font-bold mb-1">Модули проекта</h3>
            <p className="text-sm text-gray-500 mb-4">
                Предзаполнено по выбранному шаблону. Вы можете изменить набор.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALL_MODULE_IDS.map((moduleId) => {
                    const meta = MODULE_LABELS[moduleId]
                    const locked = moduleId === LOCKED_MODULE_ID
                    return (
                        <div
                            key={moduleId}
                            {...qa('host.createProject.module', {
                                module: moduleId,
                            })}
                            className="flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                            {locked ? (
                                <Tooltip title="Модуль обязателен — без него проект не работает">
                                    <span className="inline-flex">
                                        <Switcher checked disabled />
                                    </span>
                                </Tooltip>
                            ) : (
                                <Switcher
                                    checked={formData.modules[moduleId]}
                                    onChange={(checked) => {
                                        const enabledNow = ALL_MODULE_IDS.filter(
                                            (id) => formData.modules[id],
                                        )
                                        const cascade = checked
                                            ? previewWizardEnableCascade(
                                                  moduleId,
                                                  enabledNow,
                                              )
                                            : []
                                        setFormData((prev) => {
                                            const nextModules = {
                                                ...prev.modules,
                                                [moduleId]: checked,
                                            }
                                            for (const dep of cascade) {
                                                nextModules[dep] = true
                                            }
                                            return {
                                                ...prev,
                                                modules: nextModules,
                                            }
                                        })
                                        setModulesCustomized(true)
                                        if (cascade.length > 0) {
                                            const names = cascade
                                                .map(
                                                    (id) =>
                                                        MODULE_LABELS[id]?.name ??
                                                        id,
                                                )
                                                .join(', ')
                                            setModuleCascadeHint(
                                                `Также будут включены: ${names}.`,
                                            )
                                        } else {
                                            setModuleCascadeHint(null)
                                        }
                                    }}
                                />
                            )}
                            <div className="flex-1">
                                <h4 className="font-semibold mb-1 flex items-center gap-1.5">
                                    {meta?.name ?? moduleId}
                                    {locked && (
                                        <PiLockKeyDuotone className="w-3.5 h-3.5 text-gray-400" />
                                    )}
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {locked
                                        ? 'Модуль обязателен'
                                        : (meta?.description ?? '')}
                                </p>
                            </div>
                        </div>
                    )
                })}
            </div>
            {moduleCascadeHint && (
                <p
                    {...qaWithAlias(
                        'host.createProject.moduleCascadeHint',
                        'host.createProject.cascadeHint',
                    )}
                    className="text-xs text-blue-600 dark:text-blue-400 mt-2"
                >
                    {moduleCascadeHint}
                </p>
            )}
            {/* EL-WZ-13: warn that order-types won't be provisioned without orders. */}
            {!formData.modules.orders && (
                <p
                    {...qa('host.createProject.ordersDisable')}
                    className="text-xs text-gray-500 mt-3"
                >
                    Модуль «Продажи» выключен — типы продаж из шаблона не будут
                    созданы. Его можно включить позже в настройках проекта.
                </p>
            )}

            {/* Демо-данные: наполнить включённые модули примерами для ознакомления. */}
            <div
                {...qa('host.createProject.seedDemo')}
                className="mt-6 flex items-start gap-3 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/40"
            >
                <Switcher
                    checked={formData.seedDemoData}
                    onChange={(checked) =>
                        setFormData((prev) => ({
                            ...prev,
                            seedDemoData: checked,
                        }))
                    }
                />
                <div className="flex-1">
                    <h4 className="font-semibold mb-1">
                        Наполнить демонстрационными данными
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Создаст примеры контактов, компаний, сделок (воронка с
                        выигранными и проигранными), продаж и активностей — со
                        связями между ними и историей изменений. Заполняются
                        только включённые выше модули. Данные демонстрационные,
                        без реальной информации — их можно удалить позже.
                    </p>
                </div>
            </div>
        </div>
    )

    const renderStep4 = () => (
        <div>
            <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold">Пригласить участников</h3>
                <Tooltip title={ROLE_HINT}>
                    <span
                        className="text-xs text-gray-400 cursor-help border border-gray-300 dark:border-gray-600 rounded-full w-4 h-4 inline-flex items-center justify-center"
                        {...qa('host.createProject.inviteRoleHint')}
                    >
                        ?
                    </span>
                </Tooltip>
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Необязательно — можно пропустить и пригласить позже.
            </p>
            <div className="space-y-4 mb-4">
                {formData.invites.map((invite, index) => (
                    <div
                        key={invite.id}
                        {...qa('host.createProject.inviteRow', {
                            index: String(index),
                        })}
                        className="flex gap-2 items-start"
                    >
                        <div className="flex-1 grid grid-cols-2 gap-2">
                            <div
                                {...(errors[`invites.${index}.email`]
                                    ? qa('host.createProject.inviteEmailError', {
                                          index: String(index),
                                      })
                                    : {})}
                            >
                                <FormItem
                                    invalid={Boolean(
                                        errors[`invites.${index}.email`],
                                    )}
                                    errorMessage={
                                        errors[`invites.${index}.email`]
                                    }
                                >
                                    <Input
                                        {...qa('host.createProject.inviteEmail', {
                                            index: String(index),
                                        })}
                                        placeholder="email@example.com"
                                        type="email"
                                        value={invite.email}
                                        onChange={(e) =>
                                            updateInvite(
                                                invite.id,
                                                'email',
                                                e.target.value,
                                            )
                                        }
                                    />
                                </FormItem>
                            </div>
                            <FormItem
                                invalid={Boolean(
                                    errors[`invites.${index}.role`],
                                )}
                                errorMessage={errors[`invites.${index}.role`]}
                            >
                                <Select<{ value: string; label: string }>
                                    {...qa('host.createProject.inviteRole', {
                                        index: String(index),
                                    })}
                                    options={roles}
                                    value={roles.find(
                                        (opt) => opt.value === invite.role,
                                    )}
                                    onChange={(opt) =>
                                        updateInvite(
                                            invite.id,
                                            'role',
                                            opt?.value || 'member',
                                        )
                                    }
                                    {...qa('host.createProject.inviteRole', { index })}
                                />
                            </FormItem>
                        </div>
                        {formData.invites.length > 1 && (
                            <button
                                {...qa('host.createProject.inviteRemove', {
                                    index: String(index),
                                })}
                                type="button"
                                title="Удалить участника"
                                aria-label="Удалить участника"
                                className="mt-1 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                onClick={() => removeInvite(invite.id)}
                            >
                                <PiXBold className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <button
                {...qa('host.createProject.inviteAdd')}
                type="button"
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline text-sm mb-4"
                onClick={addInvite}
                {...qa('host.createProject.inviteAdd')}
            >
                <PiPlusDuotone className="w-4 h-4" />
                Добавить ещё
            </button>
        </div>
    )

    const isLastStep = step === totalSteps

    return (
        <Container>
            <div className="py-6">
                <AdaptiveCard className="max-w-4xl mx-auto">
                    <Progress
                        percent={Math.round((step / totalSteps) * 100)}
                        className="mb-6"
                    />

                    <form {...qa('host.createProject.form')} onSubmit={handleSubmit}>
                        {step === 1 && renderStep1()}
                        {step === 2 && renderStep2()}
                        {step === 3 && renderStep3()}
                        {step === 4 && renderStep4()}

                        {/* EL-WZ-22 (m-10 fix): submit error banner (ST-7). */}
                        {errors.submit && (
                            <Alert
                                showIcon
                                type="danger"
                                className="mt-6"
                                customIcon={<PiWarningDuotone />}
                                {...qa('host.createProject.error')}
                            >
                                {errors.submit}
                            </Alert>
                        )}

                        <div className="flex items-center justify-between mt-8">
                            <Button
                                variant="plain"
                                type="button"
                                disabled={step === 1}
                                icon={<PiArrowLeftDuotone />}
                                onClick={handleBack}
                                {...qa('host.createProject.back')}
                            >
                                Назад
                            </Button>
                            <div className="flex items-center gap-2">
                                {/* EL-WZ-18: skip invites on the last step. */}
                                {isLastStep && (
                                    <Button
                                        variant="plain"
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => {
                                            setFormData((prev) => ({
                                                ...prev,
                                                invites: [
                                                    {
                                                        id: '1',
                                                        email: '',
                                                        role: 'member',
                                                    },
                                                ],
                                            }))
                                            void handleSubmit()
                                        }}
                                        {...qa('host.createProject.skip')}
                                    >
                                        Пропустить
                                    </Button>
                                )}
                                {!isLastStep ? (
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        type="button"
                                        icon={<PiArrowRightDuotone />}
                                        onClick={handleNext}
                                        {...qa('host.createProject.next')}
                                    >
                                        Далее
                                    </Button>
                                ) : (
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        type="submit"
                                        loading={isSubmitting}
                                        disabled={isSubmitting}
                                        {...qa('host.createProject.submit')}
                                    >
                                        Создать проект
                                    </Button>
                                )}
                            </div>
                        </div>
                    </form>
                </AdaptiveCard>
            </div>

            <ConfirmDialog
                {...qaWithAlias(
                    'host.createProject.templateResetDialog',
                    'host.createProject.templateReset',
                )}
                isOpen={pendingTemplate !== null}
                type="warning"
                title="Сменить шаблон?"
                confirmText="Сбросить модули"
                cancelText="Отмена"
                confirmButtonProps={{
                    ...qaWithAlias(
                        'host.createProject.templateResetConfirm',
                        'host.createProject.templateReset.confirm',
                    ),
                    ...qa('host.createProject.templateResetConfirm'),
                }}
                cancelButtonProps={{
                    ...qaWithAlias(
                        'host.createProject.templateResetCancel',
                        'host.createProject.templateReset.cancel',
                    ),
                    ...qa('host.createProject.templateResetCancel'),
                }}
                onClose={() => setPendingTemplate(null)}
                onRequestClose={() => setPendingTemplate(null)}
                onCancel={() => setPendingTemplate(null)}
                onConfirm={confirmTemplateReset}
            >
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Вы изменили набор модулей на шаге 3. Смена шаблона перезапишет
                    ваши правки по пресету «{pendingTemplate?.name}».
                </p>
            </ConfirmDialog>
        </Container>
    )
}

export default CreateProject
