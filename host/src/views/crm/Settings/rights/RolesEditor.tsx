import { useMemo, useState } from 'react'
import useSWR from 'swr'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Checkbox from '@/components/ui/Checkbox'
import Spinner from '@/components/ui/Spinner'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import PermissionCheck from '@/components/shared/PermissionCheck'
import usePermission from '@/utils/hooks/usePermission'
import { usePermissionStatus } from '@/utils/hooks/usePermissionStatus'
import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import { notify } from '@/utils/notify'
import {
    PiPlusDuotone,
    PiPencilDuotone,
    PiCopyDuotone,
    PiTrashDuotone,
    PiLockKeyDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import {
    apiGetProjectRoles,
    apiGetPermissionCatalog,
    apiCreateProjectRole,
    apiUpdateProjectRole,
    apiArchiveProjectRole,
    apiCloneProjectRole,
} from '@/services/PermissionService'
import type {
    ProjectRoleDef,
    PermissionCatalogEntry,
} from '@/services/PermissionService'
import type { AxiosError } from 'axios'
import { qa } from '@/shared/qa'

/**
 * SCR-PRJSET-ROLES + SCR-PRJSET-ROLE-EDITOR (E2-14).
 *
 * Live custom-role editor: lists system + custom roles from the access engine
 * and edits a custom role by toggling `subject:action` cells from the project
 * permission catalogue. Gated by `roles:read` (view) / `roles:manage` (mutate)
 * — fail-closed via the PDP projection (E2-13). System roles are immutable
 * (FR-PERM-9); no-self-escalation: permissions the editor does not hold are
 * disabled (FR-PERM-10). The host does not compute RBAC — it renders the
 * catalogue/roles and posts mutations.
 */

const ACTION_LABELS_RU: Record<string, string> = {
    read: 'Чтение',
    write: 'Запись',
    create: 'Создание',
    update: 'Изменение',
    delete: 'Удаление',
    manage: 'Управление',
    move: 'Перемещение',
    export: 'Экспорт',
    import: 'Импорт',
    execute: 'Выполнение',
    invoke: 'Вызов',
}

// Объекты прав в родительном падеже — для человеческих подписей по формуле
// «{Действие} {объект}»: `deals:export` → «Экспорт сделок», `contacts:import`
// → «Импорт контактов». Дотнутые subject'ы (`deals.stage`) резолвятся по базе.
const SUBJECT_GENITIVE_RU: Record<string, string> = {
    deals: 'сделок',
    contacts: 'контактов',
    companies: 'компаний',
    activities: 'активностей',
    orders: 'продаж',
    products: 'продуктов',
    reports: 'отчётов',
    documents: 'документов',
    statistics: 'статистики',
    automation: 'автоматизаций',
    search: 'поиска',
    notifications: 'уведомлений',
    chat: 'чата',
    members: 'участников',
    roles: 'ролей',
    project: 'проекта',
}

function actionLabel(a: string) {
    return ACTION_LABELS_RU[a] ?? a
}

function subjectGenitive(subject: string): string | undefined {
    return (
        SUBJECT_GENITIVE_RU[subject] ??
        SUBJECT_GENITIVE_RU[subject.split('.')[0]]
    )
}

/**
 * Человеческая подпись права вместо `subject:action`:
 * `deals:export` → «Экспорт сделок», `contacts:import` → «Импорт контактов»,
 * `deals:delete` → «Удаление сделок». Wildcard `*:manage` → «Полный доступ».
 */
function permissionLabel(key: string): string {
    const [subject, action] = key.split(':')
    if (!subject || !action) return key
    const act = actionLabel(action)
    if (subject === '*') {
        return action === 'manage' ? 'Полный доступ' : `${act} (все объекты)`
    }
    const obj = subjectGenitive(subject)
    return obj ? `${act} ${obj}` : `${act} · ${subject}`
}

/** Свёрнутая сводка «Умеет: …» — первые `max` подписей + «и ещё N». */
export function summarizePermissions(keys: Iterable<string>, max = 6): string {
    const labels = Array.from(keys)
        .map(permissionLabel)
        .sort((a, b) => a.localeCompare(b, 'ru'))
    if (labels.length === 0) return 'нет прав'
    if (labels.length <= max) return labels.join(', ')
    return `${labels.slice(0, max).join(', ')} и ещё ${labels.length - max}`
}

// ─── Пресеты кастомной роли (UX-конструкт, не рантайм) ──────────────────────
// «Создать роль» открывает выбор основы — преднабор галок каталога. Пресет —
// плоский набор `subject:action`; при применении пересекается с реальным
// каталогом проекта и с правами актора (no-self-escalation, §3/§6).

type PresetId = 'read' | 'manager' | 'manager_no_export' | 'operator' | 'scratch'

const PRESETS: { id: PresetId; label: string; hint: string }[] = [
    {
        id: 'read',
        label: 'Только чтение',
        hint: 'Чтение по всем включённым модулям',
    },
    {
        id: 'manager',
        label: 'Менеджер',
        hint: 'Чтение/запись/удаление/перемещение + экспорт по сделкам, контактам, компаниям, активностям и продажам',
    },
    {
        id: 'manager_no_export',
        label: 'Менеджер без экспорта',
        hint: 'То же, что «Менеджер», но без экспорта',
    },
    {
        id: 'operator',
        label: 'Оператор',
        hint: 'Контакты и активности — чтение и запись, сделки — только чтение',
    },
    { id: 'scratch', label: 'С нуля', hint: 'Пустая матрица' },
]

const MANAGER_FAMILIES = ['deals', 'contacts', 'companies', 'activities', 'orders']

const inFamily = (subject: string, base: string) =>
    subject === base || subject.startsWith(`${base}.`)

/**
 * Строит набор `subject:action` пресета из реального каталога проекта,
 * оставляя только права, которые актор вправе выдать (`canGrant`).
 */
function buildPreset(
    id: PresetId,
    catalog: PermissionCatalogEntry[],
    canGrant: (key: string) => boolean,
): Set<string> {
    const keys = new Set<string>()
    const add = (subject: string, action: string) =>
        keys.add(`${subject}:${action}`)

    for (const entry of catalog) {
        const has = (a: string) => entry.actions.includes(a)
        switch (id) {
            case 'read':
                if (has('read')) add(entry.subject, 'read')
                break
            case 'manager':
            case 'manager_no_export': {
                if (!MANAGER_FAMILIES.some((b) => inFamily(entry.subject, b)))
                    break
                const actions = ['read', 'write', 'delete', 'move']
                if (id === 'manager') actions.push('export')
                for (const a of actions) if (has(a)) add(entry.subject, a)
                break
            }
            case 'operator':
                if (
                    inFamily(entry.subject, 'contacts') ||
                    inFamily(entry.subject, 'activities')
                ) {
                    for (const a of ['read', 'write'])
                        if (has(a)) add(entry.subject, a)
                } else if (inFamily(entry.subject, 'deals')) {
                    if (has('read')) add(entry.subject, 'read')
                }
                break
            case 'scratch':
                break
        }
    }
    return new Set(Array.from(keys).filter(canGrant))
}

function errCode(e: unknown): { status?: number; code?: string } {
    const ax = e as AxiosError<{ code?: string }>
    return {
        status: ax?.response?.status,
        code: ax?.response?.data?.code,
    }
}

interface RolesEditorProps {
    projectId?: string
}

type View =
    | { mode: 'list' }
    | { mode: 'new' }
    | { mode: 'edit'; role: ProjectRoleDef }

const RolesEditor = ({ projectId }: RolesEditorProps) => {
    const [view, setView] = useState<View>({ mode: 'list' })
    const canRead = usePermission('roles', 'read')
    const { isLoading: permLoading, hasProject } = usePermissionStatus()

    // ST-10/11 — no roles:read → no-access placeholder (fail-closed).
    if (hasProject && !permLoading && !canRead) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.roles.noAccess')}>
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <PiLockKeyDuotone className="h-8 w-8 text-gray-400" />
                    <h4 className="text-base font-semibold">Нет доступа</h4>
                    <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
                        Для просмотра ролей проекта нужно право «Управление
                        ролями» (roles:read).
                    </p>
                </div>
            </AdaptiveCard>
        )
    }

    if (view.mode === 'list') {
        return (
            <RolesList
                projectId={projectId}
                onCreate={() => setView({ mode: 'new' })}
                onEdit={(role) => setView({ mode: 'edit', role })}
            />
        )
    }

    return (
        <RoleEditorForm
            projectId={projectId}
            role={view.mode === 'edit' ? view.role : undefined}
            onClose={() => setView({ mode: 'list' })}
        />
    )
}

// ─── SCR-PRJSET-ROLES — list ────────────────────────────────────────────────

const RolesList = ({
    projectId,
    onCreate,
    onEdit,
}: {
    projectId?: string
    onCreate: () => void
    onEdit: (role: ProjectRoleDef) => void
}) => {
    const canManage = usePermission('roles', 'manage')
    const [confirmArchive, setConfirmArchive] = useState<ProjectRoleDef | null>(
        null,
    )
    const [busyId, setBusyId] = useState<string | null>(null)

    const {
        data: roles,
        error,
        isLoading,
        mutate,
    } = useSWR(
        projectId ? ['project/roles', projectId] : null,
        () => apiGetProjectRoles(projectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const handleClone = async (role: ProjectRoleDef) => {
        if (!projectId) return
        setBusyId(role.id)
        try {
            await apiCloneProjectRole(projectId, role.id)
            notify('Роль клонирована', 'success')
            await mutate()
        } catch (e) {
            const { code } = errCode(e)
            notify(
                code === 'ROLE_NAME_TAKEN'
                    ? 'Имя клонированной роли уже занято'
                    : 'Не удалось клонировать роль',
                'danger',
            )
        } finally {
            setBusyId(null)
        }
    }

    const handleArchive = async () => {
        if (!projectId || !confirmArchive) return
        const role = confirmArchive
        setBusyId(role.id)
        try {
            await apiArchiveProjectRole(projectId, role.id)
            notify('Роль архивирована', 'success')
            setConfirmArchive(null)
            await mutate()
        } catch (e) {
            const { code } = errCode(e)
            const msg =
                code === 'ROLE_IN_USE'
                    ? 'Роль назначена участникам — сначала снимите её'
                    : code === 'SYSTEM_ROLE_IMMUTABLE'
                      ? 'Системную роль нельзя изменять'
                      : 'Не удалось архивировать роль'
            notify(msg, 'danger')
        } finally {
            setBusyId(null)
        }
    }

    // ST-1 — loading skeleton.
    if (isLoading) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.roles.loading')}>
                <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
                    <Spinner /> Загрузка ролей…
                </div>
            </AdaptiveCard>
        )
    }

    // ST-6 — load error + retry.
    if (error) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.roles.error')}>
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <PiWarningDuotone className="h-8 w-8 text-red-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Не удалось загрузить роли проекта.
                    </p>
                    <Button
                        size="sm"
                        onClick={() => mutate()}
                        {...qa('host.projectSettings.roles.retry')}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    const list = roles ?? []
    const customRoles = list.filter((r) => r.kind === 'custom')

    return (
        <AdaptiveCard {...qa('host.projectSettings.roles.list')}>
            <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold">Роли проекта</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Системные роли неизменяемы. Кастомные роли собираются из
                        каталога прав.
                    </p>
                </div>
                <PermissionCheck subject="roles" action="manage">
                    <Button
                        variant="solid"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={onCreate}
                        {...qa('host.projectSettings.roles.create')}
                    >
                        Создать роль
                    </Button>
                </PermissionCheck>
            </div>

            {/* ST-3 — only system roles present (not empty — normal). */}
            {customRoles.length === 0 && (
                <div
                    className="mb-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400"
                    {...qa('host.projectSettings.roles.empty')}
                >
                    Кастомных ролей пока нет.{' '}
                    {canManage
                        ? 'Создайте роль, чтобы тонко настроить права.'
                        : 'Их может создать администратор проекта.'}
                </div>
            )}

            <div className="space-y-2">
                {list.map((role) => {
                    const isSystem = role.kind === 'system'
                    const busy = busyId === role.id
                    return (
                        <div
                            key={role.id}
                            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                            {...qa('host.projectSettings.roles.row', { role: role.id })}
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">
                                        {role.name}
                                    </span>
                                    {isSystem ? (
                                        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                            системная
                                        </Tag>
                                    ) : (
                                        <Tag className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                                            кастомная
                                        </Tag>
                                    )}
                                    {role.archived && (
                                        <Tag className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                            архив
                                        </Tag>
                                    )}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">
                                    {role.permissions.length} прав
                                    {typeof role.memberCount === 'number'
                                        ? ` · ${role.memberCount} носителей`
                                        : ''}
                                    {isSystem && ' · неизменяема'}
                                </div>
                                {role.permissions.length > 0 && (
                                    <div className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                                        Умеет:{' '}
                                        {summarizePermissions(
                                            role.permissions,
                                            4,
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <PermissionCheck subject="roles" action="manage">
                                    <Button
                                        size="xs"
                                        icon={<PiCopyDuotone />}
                                        loading={busy}
                                        onClick={() => handleClone(role)}
                                        {...qa('host.projectSettings.roles.clone', {
                                            role: role.id,
                                        })}
                                    >
                                        Клонировать
                                    </Button>
                                </PermissionCheck>
                                <PermissionCheck subject="roles" action="manage">
                                    <Button
                                        size="xs"
                                        icon={<PiPencilDuotone />}
                                        disabled={isSystem || role.archived}
                                        onClick={() => onEdit(role)}
                                        {...qa('host.projectSettings.roles.edit', {
                                            role: role.id,
                                        })}
                                    >
                                        Редактировать
                                    </Button>
                                </PermissionCheck>
                                <PermissionCheck subject="roles" action="manage">
                                    <Button
                                        size="xs"
                                        icon={<PiTrashDuotone />}
                                        disabled={isSystem || role.archived}
                                        loading={busy}
                                        onClick={() => setConfirmArchive(role)}
                                        {...qa('host.projectSettings.roles.archive', {
                                            role: role.id,
                                        })}
                                    >
                                        Архивировать
                                    </Button>
                                </PermissionCheck>
                            </div>
                        </div>
                    )
                })}
            </div>

            <ConfirmDialog
                isOpen={Boolean(confirmArchive)}
                type="danger"
                title="Архивировать роль"
                confirmText="Архивировать"
                cancelText="Отмена"
                onClose={() => setConfirmArchive(null)}
                onCancel={() => setConfirmArchive(null)}
                onConfirm={handleArchive}
                {...qa('host.projectSettings.roles.archiveConfirm')}
            >
                <p>
                    Роль «{confirmArchive?.name}» будет архивирована. Если она
                    назначена участникам, архивация будет отклонена.
                </p>
            </ConfirmDialog>
        </AdaptiveCard>
    )
}

// ─── SCR-PRJSET-ROLE-EDITOR — editor ────────────────────────────────────────

const RoleEditorForm = ({
    projectId,
    role,
    onClose,
}: {
    projectId?: string
    role?: ProjectRoleDef
    onClose: () => void
}) => {
    const isEdit = Boolean(role)
    const [name, setName] = useState(role?.name ?? '')
    const [selected, setSelected] = useState<Set<string>>(
        new Set(role?.permissions ?? []),
    )
    const [activePreset, setActivePreset] = useState<PresetId | null>(null)
    const [saving, setSaving] = useState(false)

    // Editor's own grants — no-self-escalation (FR-PERM-10): permissions the
    // editing user does not hold are disabled. A `*:manage` wildcard (owner/admin)
    // grants everything.
    const projection = usePermissionProjection().projection
    const ownAllowed = useMemo(
        () => new Set(projection?.allowed ?? []),
        [projection],
    )
    const ownsEverything = ownAllowed.has('*:manage')

    const canGrant = (key: string): boolean => {
        if (ownsEverything) return true
        const [, action] = key.split(':')
        return ownAllowed.has(key) || (action ? ownAllowed.has(`*:${action}`) : false)
    }

    const {
        data: catalog,
        error: catalogError,
        isLoading: catalogLoading,
        mutate: refetchCatalog,
    } = useSWR(
        projectId ? ['project/permission-catalog', projectId] : null,
        () => apiGetPermissionCatalog(projectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const toggle = (key: string, on: boolean) => {
        // Ручная правка снимает подсветку основы — набор больше не «чистый пресет».
        setActivePreset(null)
        setSelected((prev) => {
            const next = new Set(prev)
            if (on) next.add(key)
            else next.delete(key)
            return next
        })
    }

    const applyPreset = (id: PresetId) => {
        setActivePreset(id)
        setSelected(buildPreset(id, catalog ?? [], canGrant))
    }

    // Linter warnings (FR-PERM-11, soft): mutation without read on same subject.
    const lintWarnings = useMemo(() => {
        const warnings: string[] = []
        const bySubject = new Map<string, Set<string>>()
        for (const key of selected) {
            const [subject, action] = key.split(':')
            if (!subject || !action) continue
            if (!bySubject.has(subject)) bySubject.set(subject, new Set())
            bySubject.get(subject)!.add(action)
        }
        for (const [subject, actions] of bySubject) {
            const hasMutating = ['write', 'create', 'update', 'delete'].some(
                (a) => actions.has(a),
            )
            if (hasMutating && !actions.has('read')) {
                warnings.push(
                    `«${subject}»: есть права на изменение без права на чтение`,
                )
            }
        }
        return warnings
    }, [selected])

    const handleSave = async () => {
        if (!projectId) return
        if (!name.trim()) {
            notify('Укажите название роли', 'warning')
            return
        }
        setSaving(true)
        try {
            const payload = {
                name: name.trim(),
                permissions: Array.from(selected),
            }
            if (isEdit && role) {
                await apiUpdateProjectRole(projectId, role.id, payload)
            } else {
                await apiCreateProjectRole(projectId, payload)
            }
            notify(isEdit ? 'Роль сохранена' : 'Роль создана', 'success')
            onClose()
        } catch (e) {
            const { code } = errCode(e)
            const msg =
                code === 'ROLE_NAME_TAKEN'
                    ? 'Роль с таким именем уже существует'
                    : code === 'SELF_ESCALATION_DENIED'
                      ? 'Нельзя выдать права, которых нет у вас'
                      : code === 'ROLE_PERMISSION_NOT_IN_CATALOG'
                        ? 'Одно из прав отсутствует в каталоге проекта'
                        : code === 'SYSTEM_ROLE_IMMUTABLE'
                          ? 'Системную роль нельзя изменять'
                          : 'Не удалось сохранить роль'
            notify(msg, 'danger')
        } finally {
            setSaving(false)
        }
    }

    return (
        <AdaptiveCard {...qa('host.projectSettings.roles.editor')}>
            <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold">
                    {isEdit ? `Роль: ${role?.name}` : 'Новая роль'}
                </h3>
                <Button
                    size="sm"
                    onClick={onClose}
                    {...qa('host.projectSettings.roles.backToList')}
                >
                    К списку ролей
                </Button>
            </div>

            <div className="mb-6 max-w-md">
                <label className="mb-1 block text-sm font-medium">
                    Название роли
                </label>
                <Input
                    value={name}
                    placeholder="Например, Менеджер по продажам"
                    onChange={(e) => setName(e.target.value)}
                    {...qa('host.projectSettings.roles.nameInput')}
                />
            </div>

            {/* ST-1 catalog loading */}
            {catalogLoading && (
                <div
                    className="flex items-center gap-2 py-8 text-gray-400"
                    {...qa('host.projectSettings.roles.catalogLoading')}
                >
                    <Spinner /> Загрузка каталога прав…
                </div>
            )}

            {/* ST-6 catalog error + retry */}
            {catalogError && !catalogLoading && (
                <div
                    className="flex flex-col items-center gap-3 py-8 text-center"
                    {...qa('host.projectSettings.roles.catalogError')}
                >
                    <PiWarningDuotone className="h-8 w-8 text-red-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Не удалось загрузить каталог прав.
                    </p>
                    <Button
                        size="sm"
                        onClick={() => refetchCatalog()}
                        {...qa('host.projectSettings.roles.catalogRetry')}
                    >
                        Повторить
                    </Button>
                </div>
            )}

            {!catalogLoading && !catalogError && (
                <>
                    {/* Пресеты-основа — только при создании роли (§3). */}
                    {!isEdit && (
                        <div className="mb-6">
                            <label className="mb-2 block text-sm font-medium">
                                Основа роли
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {PRESETS.map((p) => (
                                    <Button
                                        key={p.id}
                                        size="sm"
                                        variant={
                                            activePreset === p.id
                                                ? 'solid'
                                                : 'default'
                                        }
                                        title={p.hint}
                                        onClick={() => applyPreset(p.id)}
                                        {...qa('host.projectSettings.roles.preset', {
                                            preset: p.id,
                                        })}
                                    >
                                        {p.label}
                                    </Button>
                                ))}
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Пресет заполняет матрицу прав — дальше можно
                                снять или добавить отдельные галки.
                            </p>
                        </div>
                    )}

                    {lintWarnings.length > 0 && (
                        <div
                            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                            {...qa('host.projectSettings.roles.lintWarnings')}
                        >
                            <div className="mb-1 flex items-center gap-2 font-medium">
                                <PiWarningDuotone /> Предупреждения линтера
                            </div>
                            <ul className="list-disc pl-5">
                                {lintWarnings.map((w) => (
                                    <li key={w}>{w}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <CatalogMatrix
                        catalog={catalog ?? []}
                        selected={selected}
                        canGrant={canGrant}
                        onToggle={toggle}
                    />

                    {/* Человеческая сводка «что роль умеет» (§3). */}
                    {selected.size > 0 && (
                        <div
                            className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-800/40"
                            {...qa('host.projectSettings.roles.summary')}
                        >
                            <span className="font-medium">Роль умеет: </span>
                            <span className="text-gray-600 dark:text-gray-300">
                                {summarizePermissions(selected)}
                            </span>
                        </div>
                    )}

                    <div className="mt-6 flex items-center justify-end gap-2">
                        <Button
                            onClick={onClose}
                            {...qa('host.projectSettings.roles.cancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            loading={saving}
                            onClick={handleSave}
                            {...qa('host.projectSettings.roles.save')}
                        >
                            Сохранить
                        </Button>
                    </div>
                </>
            )}
        </AdaptiveCard>
    )
}

const CatalogMatrix = ({
    catalog,
    selected,
    canGrant,
    onToggle,
}: {
    catalog: PermissionCatalogEntry[]
    selected: Set<string>
    canGrant: (key: string) => boolean
    onToggle: (key: string, on: boolean) => void
}) => {
    if (catalog.length === 0) {
        return (
            <p
                className="py-6 text-sm text-gray-500 dark:text-gray-400"
                {...qa('host.projectSettings.roles.matrixEmpty')}
            >
                Каталог прав пуст — нет включённых модулей с правами.
            </p>
        )
    }
    return (
        <div className="space-y-4" {...qa('host.projectSettings.roles.matrix')}>
            {catalog.map((entry) => (
                <div
                    key={entry.subject}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    {...qa('host.projectSettings.roles.matrixSubject', {
                        subject: entry.subject,
                    })}
                >
                    <div className="mb-2 flex items-center gap-2">
                        <span className="font-medium">{entry.subject}</span>
                        {entry.moduleId && (
                            <Tag className="bg-gray-100 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                {entry.moduleId}
                            </Tag>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {entry.actions.map((action) => {
                            const key = `${entry.subject}:${action}`
                            const grantable = canGrant(key)
                            return (
                                <Checkbox
                                    key={key}
                                    checked={selected.has(key)}
                                    disabled={!grantable}
                                    onChange={(val) => onToggle(key, val)}
                                    {...qa('host.projectSettings.roles.permission', {
                                        permission: key,
                                    })}
                                >
                                    <span
                                        className={grantable ? '' : 'text-gray-400'}
                                    >
                                        {actionLabel(action)}
                                        {!grantable && (
                                            <span
                                                className="ml-1"
                                                title="Нельзя выдать право, которого нет у вас (no self-escalation)"
                                            >
                                                <PiLockKeyDuotone className="inline h-3 w-3" />
                                            </span>
                                        )}
                                    </span>
                                </Checkbox>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default RolesEditor
