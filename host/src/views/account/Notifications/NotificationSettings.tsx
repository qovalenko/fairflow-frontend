import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
    PiBellDuotone,
    PiBellSlashDuotone,
    PiWarningDuotone,
    PiLockSimpleDuotone,
    PiInfoDuotone,
} from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Segment from '@/components/ui/Segment'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import {
    apiGetNotificationCatalog,
    apiGetNotificationPreferences,
    apiUpdateNotificationPreferences,
    DEFAULT_CATALOG,
    DEFAULT_PREFERENCES,
    type CategoryPref,
    type CategorySpec,
    type EmailMode,
    type NotificationPreferences,
} from '@/services/NotificationService'
import {
    isModuleDisabledError,
    notificationErrorCode,
} from '@/utils/hooks/useNotifications'
import { qa, qaWithAlias, type QaAttributes } from '@/shared/qa'

/**
 * SCR-NOTIFY-SETTINGS — настройки уведомлений (per-user, host-shell/AccountLayout).
 *
 * Каталог категорий — динамический (GET /catalog из манифестов, FR-MNOT-16);
 * критичные (`mandatory`) показываются БЕЗ переключателей (FR-MNOT-17, не disabled).
 * Prefs — GET/PUT /preferences (user-scope, FR-MNOT-15). Сохранение оптимистично
 * с toast и откатом.
 *
 * Покрытые состояния (ux/screens/notifications SCR-NOTIFY-SETTINGS §10):
 *  ST-1 loading (skeleton), ST-6 error+retry, ST-7 откат сохранения,
 *  ST-8 partial (catalog есть, prefs нет → дефолты+предупреждение),
 *  ST-10 no-permission, ST-12 critical без управления, ST-17 module-disabled,
 *  ST-26 pending (кнопка SENDING), ST-29 success toast, ST-30 dirty-state.
 */

const EMAIL_MODE_LABEL: Record<EmailMode, string> = {
    immediate: 'Сразу',
    hourly: 'Дайджест час',
    daily: 'Дайджест день',
    off: 'Выключены',
}

const SEVERITY_LABEL: Record<CategorySpec['severity'], string> = {
    info: '',
    important: 'важное',
    critical: 'критично',
}

function effectivePref(prefs: NotificationPreferences, spec: CategorySpec): CategoryPref {
    const saved = prefs.categories[spec.category]
    if (saved) return saved
    return {
        in_app: spec.default_channels.includes('in_app'),
        email: spec.default_channels.includes('email'),
    }
}

const NotificationSettings = () => {
    const projectId = useResolvedProjectId()
    const canRead = usePermission('notifications', 'read')
    const currentProject = useProjectStore((s) => s.currentProject)
    const moduleEnabled = useMemo(
        () => getEnabledModules(currentProject).includes('notifications'),
        [currentProject],
    )
    const gate = canRead && moduleEnabled

    // ── GET /catalog (project-scope) ─────────────────────────────────────────
    const {
        data: catalogData,
        error: catalogError,
        isLoading: catalogLoading,
        mutate: refetchCatalog,
    } = useSWR(
        gate && projectId ? ['notification/catalog', projectId] : null,
        () => apiGetNotificationCatalog({ projectId: projectId! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // ── GET /preferences (user-scope) ────────────────────────────────────────
    const {
        data: prefsData,
        error: prefsError,
        isLoading: prefsLoading,
        mutate: refetchPrefs,
    } = useSWR(
        gate ? ['notification/preferences'] : null,
        () => apiGetNotificationPreferences(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // ── Локальное (dirty) состояние формы ────────────────────────────────────
    const [draft, setDraft] = useState<NotificationPreferences | null>(null)
    const [saving, setSaving] = useState(false)

    const catalog: CategorySpec[] = catalogData?.categories ?? DEFAULT_CATALOG
    // ST-8: catalog есть, prefs нет → деградация к дефолтам + предупреждение.
    const partialPrefs = Boolean(catalogData && prefsError && !isModuleDisabledError(prefsError))
    const baseline: NotificationPreferences = prefsData ?? DEFAULT_PREFERENCES
    const prefs: NotificationPreferences = draft ?? baseline

    const moduleDisabled =
        isModuleDisabledError(catalogError) || isModuleDisabledError(prefsError)
    // ST-6: ошибка загрузки caталога (prefs-ошибка деградирует к дефолтам, ST-8).
    const loadError = !moduleDisabled && catalogError ? catalogError : null
    const isLoading = gate && (catalogLoading || prefsLoading) && !catalogData && !prefsData

    const dirty = draft !== null
    useUnsavedChangesGuard(dirty, 'notification-prefs')

    const patch = (next: Partial<NotificationPreferences>) =>
        setDraft({ ...prefs, ...next })

    const patchCategory = (category: string, channel: keyof CategoryPref, value: boolean) => {
        const current = prefs.categories[category] ??
            effectivePref(prefs, catalog.find((c) => c.category === category)!)
        patch({
            categories: {
                ...prefs.categories,
                [category]: { ...current, [channel]: value },
            },
        })
    }

    const onSave = async () => {
        if (partialPrefs) {
            toast.push(
                <Notification title="Нельзя сохранить" type="warning" {...qa('host.notifications.toast.warning')}>
                    Настройки не загружены — обновите страницу
                </Notification>,
            )
            return
        }
        setSaving(true)
        // Собираем только нестандартные/изменяемые категории (без mandatory).
        const categories: Record<string, CategoryPref> = {}
        for (const spec of catalog) {
            if (spec.mandatory) continue
            categories[spec.category] = effectivePref(prefs, spec)
        }
        try {
            const saved = await apiUpdateNotificationPreferences({
                email_mode: prefs.email_mode,
                digest_time: prefs.digest_time ?? null,
                timezone: prefs.timezone ?? null,
                categories,
            })
            await refetchPrefs(saved, false)
            setDraft(null)
            toast.push(
                <Notification title="Сохранено" type="success" {...qa('host.notifications.toast.success')}>
                    Настройки уведомлений обновлены
                </Notification>,
            )
        } catch (e) {
            // ST-7: откат к серверному состоянию + спец-обработка 422 (critical override).
            const code = notificationErrorCode(e)
            toast.push(
                <Notification title="Не удалось сохранить" type="danger" {...qa('host.notifications.toast.error')}>
                    {code === 'INVALID_ARGUMENT'
                        ? 'Критичную категорию нельзя отключить'
                        : 'Попробуйте ещё раз'}
                </Notification>,
            )
            setDraft(null)
        } finally {
            setSaving(false)
        }
    }

    return (
        <AccountLayout>
            <div className="space-y-6" {...qa('host.notifications.settings.screen')}>
                <div className="flex items-center gap-3">
                    <PiBellDuotone className="w-7 h-7 text-gray-500" />
                    <h2 className="text-2xl font-semibold" {...qa('host.notificationSettings.heading')}>
                        Уведомления
                    </h2>
                </div>

                {renderBody()}
            </div>
        </AccountLayout>
    )

    function renderBody() {
        // ST-17: module disabled — check FIRST. `notifications:read` is derived
        // from the enabled-module catalog, so a disabled module strips the
        // permission even for the owner; showing «no access» would misattribute
        // the cause. The owner has all rights; the module is just not enabled.
        if (moduleDisabled || !moduleEnabled) {
            return (
                <AdaptiveCard>
                    <Unavailable
                        text="Модуль уведомлений выключен в проекте"
                        {...qaWithAlias(
                            'host.notificationSettings.unavailable',
                            'host.notifications.settings.unavailable',
                        )}
                        {...qa('host.notifications.settings.unavailable', { reason: 'moduleDisabled' })}
                    />
                </AdaptiveCard>
            )
        }
        // ST-10: genuine no-permission (module enabled, role lacks the right)
        if (!canRead) {
            return (
                <AdaptiveCard>
                    <Unavailable
                        text="У вас нет доступа к настройкам уведомлений"
                        {...qaWithAlias(
                            'host.notificationSettings.unavailable',
                            'host.notifications.settings.unavailable',
                        )}
                        {...qa('host.notifications.settings.unavailable', { reason: 'noPermission' })}
                    />
                </AdaptiveCard>
            )
        }
        // ST-1: loading
        if (isLoading) {
            return <SettingsSkeleton />
        }
        // ST-6: error (catalog)
        if (loadError) {
            return (
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center py-16 gap-3 text-center text-gray-500"
                        {...qa('host.notificationSettings.error')}
                        {...qa('host.notifications.settings.error')}
                    >
                        <PiWarningDuotone className="text-4xl text-red-500" />
                        <h5>Не удалось загрузить настройки</h5>
                        <Button
                            size="sm"
                            variant="default"
                            {...qa('host.notificationSettings.retry')}
                            onClick={() => {
                                refetchCatalog()
                                refetchPrefs()
                            }}
                            {...qa('host.notifications.settings.retry')}
                        >
                            Повторить
                        </Button>
                    </div>
                </AdaptiveCard>
            )
        }

        return (
            <>
                {/* ST-8: prefs не загрузились → дефолты + предупреждение */}
                {partialPrefs && (
                    <div
                        className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
                        {...qa('host.notificationSettings.partialWarning')}
                        {...qa('host.notifications.settings.partialWarning')}
                    >
                        Настройки не загружены — показаны значения по умолчанию. Сохранение заблокировано до обновления.
                    </div>
                )}

                {/* Блок Email-режима (EL-SET-2) */}
                <AdaptiveCard>
                    <h5 className="mb-4" {...qa('host.notificationSettings.emailHeading')}>
                        Email-уведомления
                    </h5>
                    <Segment
                        value={prefs.email_mode}
                        onChange={(val) =>
                            patch({ email_mode: (Array.isArray(val) ? val[0] : val) as EmailMode })
                        }
                    >
                        {(Object.keys(EMAIL_MODE_LABEL) as EmailMode[]).map((m) => (
                            <Segment.Item
                                key={m}
                                value={m}
                                {...qa('host.notificationSettings.emailMode', { mode: m })}
                                {...qa('host.notifications.settings.emailMode', { mode: m })}
                            >
                                {EMAIL_MODE_LABEL[m]}
                            </Segment.Item>
                        ))}
                    </Segment>

                    {/* EL-SET-2a — время дайджеста (FR-MNOT-35) */}
                    {(prefs.email_mode === 'daily' || prefs.email_mode === 'hourly') && (
                        <div className="mt-4 flex items-center gap-3">
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                                Время дайджеста
                            </label>
                            <input
                                type="time"
                                aria-label="Время дайджеста"
                                title="Время дайджеста"
                                value={prefs.digest_time ?? ''}
                                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-transparent"
                                {...qa('host.notificationSettings.digestTime')}
                                onChange={(e) => patch({ digest_time: e.target.value || null })}
                            />
                        </div>
                    )}

                    {/* ST-15 — email-квота близка (FR-MNOT-20) */}
                    {prefs.email_mode === 'immediate' && (
                        <p className="mt-3 text-xs text-gray-500">
                            При исчерпании email-квоты часть писем уйдёт в дайджест; критичные доставляются всегда.
                        </p>
                    )}
                </AdaptiveCard>

                {/* Блок Категории (EL-SET-3) */}
                <AdaptiveCard>
                    <h5 className="mb-6" {...qa('host.notificationSettings.categoriesHeading')}>
                        Категории
                    </h5>

                    {/* EL-SET-9 — пояснение адресации «как руководитель» (FR-MNOT-31) */}
                    <div className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                        <PiInfoDuotone className="mt-0.5 flex-shrink-0" />
                        <span>Уведомления о подчинённых приходят автоматически по оргструктуре.</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-3 font-semibold">Категория</th>
                                    <th className="text-center py-3 font-semibold">In-App</th>
                                    <th className="text-center py-3 font-semibold">Эл. почта</th>
                                </tr>
                            </thead>
                            <tbody>
                                {catalog.map((spec) => {
                                    const pref = effectivePref(prefs, spec)
                                    return (
                                        <tr
                                            key={spec.category}
                                            className="border-b last:border-0"
                                            {...qa('host.notificationSettings.categoryRow', {
                                                category: spec.category,
                                            })}
                                            {...qa('host.notifications.settings.categoryRow', { category: spec.category })}
                                        >
                                            <td className="py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{spec.title}</span>
                                                    {spec.mandatory ? (
                                                        <span
                                                            className="inline-flex items-center gap-1 text-xs text-gray-500"
                                                            {...qa('host.notificationSettings.mandatory', {
                                                                category: spec.category,
                                                            })}
                                                            {...qa('host.notifications.settings.mandatory', {
                                                                category: spec.category,
                                                            })}
                                                        >
                                                            <PiLockSimpleDuotone /> всегда включено
                                                        </span>
                                                    ) : (
                                                        spec.severity !== 'info' && (
                                                            <span className="text-xs text-gray-400">
                                                                {SEVERITY_LABEL[spec.severity]}
                                                            </span>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                            {/* FR-MNOT-17: critical/mandatory — БЕЗ переключателей (ST-12) */}
                                            <td className="py-3 text-center">
                                                {spec.mandatory ? (
                                                    <span className="text-xs text-gray-400">—</span>
                                                ) : (
                                                    <Switcher
                                                        checked={pref.in_app}
                                                        {...qa('host.notificationSettings.inApp', {
                                                            category: spec.category,
                                                        })}
                                                        onChange={(checked) =>
                                                            patchCategory(spec.category, 'in_app', checked)
                                                        }
                                                        {...qaWithAlias(
                                                            'host.notifications.settings.inAppSwitch',
                                                            'host.accountNotifications.pref',
                                                        )}
                                                        {...qa('host.notifications.settings.inAppSwitch', {
                                                            category: spec.category,
                                                        })}
                                                        {...qa('host.accountNotifications.pref', {
                                                            category: spec.category,
                                                            channel: 'in_app',
                                                        })}
                                                    />
                                                )}
                                            </td>
                                            <td className="py-3 text-center">
                                                {spec.mandatory ? (
                                                    <span className="text-xs text-gray-400">—</span>
                                                ) : (
                                                    <Switcher
                                                        checked={pref.email}
                                                        {...qa('host.notificationSettings.email', {
                                                            category: spec.category,
                                                        })}
                                                        onChange={(checked) =>
                                                            patchCategory(spec.category, 'email', checked)
                                                        }
                                                        {...qaWithAlias(
                                                            'host.notifications.settings.emailSwitch',
                                                            'host.accountNotifications.pref',
                                                        )}
                                                        {...qa('host.notifications.settings.emailSwitch', {
                                                            category: spec.category,
                                                        })}
                                                        {...qa('host.accountNotifications.pref', {
                                                            category: spec.category,
                                                            channel: 'email',
                                                        })}
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </AdaptiveCard>

                {/* Футер — сохранить (EL-SET-4): ST-26 pending, ST-30 dirty-gate */}
                <div className="flex items-center justify-end gap-3">
                    {dirty && (
                        <span
                            className="text-xs text-amber-600 dark:text-amber-400"
                            {...qa('host.notificationSettings.dirty')}
                        >
                            Есть несохранённые изменения
                        </span>
                    )}
                    <Button
                        variant="solid"
                        color="primary"
                        loading={saving}
                        disabled={!dirty || saving || partialPrefs}
                        {...qa('host.notificationSettings.save')}
                        onClick={onSave}
                        {...qa('host.notifications.settings.save')}
                    >
                        Сохранить
                    </Button>
                </div>
            </>
        )
    }
}

function Unavailable({ text, ...rest }: { text: string } & QaAttributes) {
    return (
        <div
            className="flex flex-col items-center justify-center py-16 gap-2 text-center text-gray-500"
            {...rest}
            {...qa('host.notificationSettings.unavailable')}
        >
            <PiBellSlashDuotone className="text-4xl" />
            <h5>Раздел недоступен</h5>
            <p className="text-sm">{text}</p>
        </div>
    )
}

function SettingsSkeleton() {
    return (
        <div
            className="space-y-6"
            {...qa('host.notificationSettings.skeleton')}
            {...qa('host.notifications.settings.skeleton')}
        >
            <AdaptiveCard>
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-600 rounded mb-4 animate-pulse" />
                <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            </AdaptiveCard>
            <AdaptiveCard>
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-600 rounded mb-6 animate-pulse" />
                <div className="space-y-4">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between animate-pulse">
                            <div className="h-3 w-40 bg-gray-200 dark:bg-gray-600 rounded" />
                            <div className="flex gap-12">
                                <div className="h-5 w-10 bg-gray-200 dark:bg-gray-600 rounded-full" />
                                <div className="h-5 w-10 bg-gray-200 dark:bg-gray-600 rounded-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </AdaptiveCard>
        </div>
    )
}

export default NotificationSettings
