import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router'
import { PiCameraDuotone, PiQuestion } from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tooltip from '@/components/ui/Tooltip'
import Select from '@/components/ui/Select'
import Segment from '@/components/ui/Segment'
import Alert from '@/components/ui/Alert'
import Tag from '@/components/ui/Tag'
import {
    apiGetMyProfile,
    apiUpdateMyProfile,
    apiUploadMyAvatar,
    type MyProfileResponse,
} from '@/services/AuthService'
import { useSessionUser } from '@/store/authStore'
import { normalizeApiError } from '@/utils/apiError'
import { notify } from '@/utils/notify'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import { qa, qaWithAlias } from '@/shared/qa'

type ThousandsSeparator = 'space' | 'comma'
type ViewMode = 'kanban' | 'list'
type ActivitiesView = 'list' | 'calendar'
type TimeFormat = '24h' | '12h'

type ProfileForm = {
    name: string
    firstName: string
    lastName: string
    email: string
    avatar: string
    phone: string
    position: string
    language: string
    timezone: string
    dateFormat: string
    timeFormat: TimeFormat
    defaultDealsView: ViewMode
    defaultActivitiesView: ActivitiesView
    thousandsSeparator: ThousandsSeparator
}

const LANGUAGE_OPTIONS = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
]

const buildTimezoneOptions = () => {
    try {
        const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
            .supportedValuesOf
        if (typeof sv === 'function') {
            return sv('timeZone')
                .map((value) => ({ value, label: value }))
                .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
        }
    } catch {
        /* fall through */
    }
    return [
        { value: 'Europe/Moscow', label: 'Europe/Moscow' },
        { value: 'Europe/Kiev', label: 'Europe/Kiev' },
        { value: 'Asia/Almaty', label: 'Asia/Almaty' },
    ]
}

const TIMEZONE_OPTIONS = buildTimezoneOptions()

const detectDefaultTimezone = () => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'
    } catch {
        return 'Europe/Moscow'
    }
}

const DEFAULT_TIMEZONE = detectDefaultTimezone()

const DATE_FORMAT_OPTIONS = [
    { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
]

// ST-6 (FR-MPROF-1): no DEFAULT_PROFILE mock — never show fake/other-user data.
const EMPTY_PROFILE: ProfileForm = {
    name: '',
    firstName: '',
    lastName: '',
    email: '',
    avatar: '',
    phone: '',
    position: '',
    language: 'ru',
    timezone: DEFAULT_TIMEZONE,
    dateFormat: 'DD.MM.YYYY',
    timeFormat: '24h',
    defaultDealsView: 'kanban',
    defaultActivitiesView: 'list',
    thousandsSeparator: 'space',
}

const ReadOnlyField = ({ label, value }: { label: string; value: string }) => (
    <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {value}
        </p>
    </div>
)

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

const toSegmentValue = (value: string | string[]) =>
    Array.isArray(value) ? value[0] : value

const optionLabel = (
    options: Array<{ value: string; label: string }>,
    value: string,
) => options.find((opt) => opt.value === value)?.label ?? value

const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    return {
        firstName: parts[0] ?? '',
        lastName: parts.slice(1).join(' '),
    }
}

const joinName = (firstName: string, lastName: string) =>
    `${firstName.trim()} ${lastName.trim()}`.trim()

const toProfileForm = (user: NonNullable<MyProfileResponse['user']>): ProfileForm => {
    const split = splitName(user.name || user.userName || '')
    return {
        name: user.name || user.userName || '',
        firstName: split.firstName,
        lastName: split.lastName,
        email: user.email || '',
        avatar: user.avatar || '',
        phone: user.phone || '',
        position: user.position || '',
        language: user.language || 'ru',
        timezone: user.timezone || DEFAULT_TIMEZONE,
        dateFormat: user.dateFormat || 'DD.MM.YYYY',
        timeFormat: (user.timeFormat || '24h') as TimeFormat,
        defaultDealsView: (user.defaultDealsView || 'kanban') as ViewMode,
        defaultActivitiesView: (user.defaultActivitiesView || 'list') as ActivitiesView,
        thousandsSeparator: (user.thousandsSeparator || 'space') as ThousandsSeparator,
    }
}

const getInitials = (firstName: string, lastName: string, fallback = 'АИ') => {
    const a = firstName.trim()[0]
    const b = lastName.trim()[0]
    if (a && b) return `${a}${b}`.toUpperCase()
    if (a) return a.toUpperCase()
    return fallback
}

const Profile = () => {
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const sessionUser = useSessionUser((s) => s.user)
    const setSessionUser = useSessionUser((s) => s.setUser)
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE)
    const [draft, setDraft] = useState<ProfileForm>(EMPTY_PROFILE)
    const [pendingEmail, setPendingEmail] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState(false) // ST-6
    const [isSaving, setIsSaving] = useState(false)
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

    const load = useCallback(async () => {
        setIsLoading(true)
        setLoadError(false)
        try {
            const resp = await apiGetMyProfile()
            if (!resp?.user) {
                setLoadError(true)
                return
            }
            const form = toProfileForm(resp.user)
            setProfile(form)
            setDraft(form)
            setPendingEmail(resp.user.pendingEmail ?? null)
            setSessionUser({
                ...sessionUser,
                avatar: form.avatar,
                userName: form.name || sessionUser.userName,
                name: form.name,
                email: form.email,
                phone: form.phone,
                position: form.position,
                language: form.language,
                timezone: form.timezone,
                dateFormat: form.dateFormat,
                timeFormat: form.timeFormat,
                thousandsSeparator: form.thousandsSeparator,
                defaultDealsView: form.defaultDealsView,
                defaultActivitiesView: form.defaultActivitiesView,
            })
        } catch {
            // ST-6: surface a retryable banner, never substitute fake data.
            setLoadError(true)
        } finally {
            setIsLoading(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        load()
    }, [load])

    // ST-30: warn on tab close / project switch while there are unsaved edits.
    useUnsavedChangesGuard(isEditing, 'profile')
    useEffect(() => {
        if (!isEditing) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isEditing])

    const startEdit = () => {
        setDraft(profile)
        setIsEditing(true)
    }

    const cancelEdit = () => {
        setDraft(profile)
        setIsEditing(false)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const payload = {
                name: joinName(draft.firstName, draft.lastName),
                phone: draft.phone,
                position: draft.position,
                language: draft.language,
                timezone: draft.timezone,
                dateFormat: draft.dateFormat,
                timeFormat: draft.timeFormat,
                thousandsSeparator: draft.thousandsSeparator,
                defaultDealsView: draft.defaultDealsView,
                defaultActivitiesView: draft.defaultActivitiesView,
            }
            const resp = await apiUpdateMyProfile(payload)
            const next = resp?.user
                ? toProfileForm(resp.user)
                : { ...draft, name: payload.name }
            setProfile(next)
            setDraft(next)
            setSessionUser({
                ...sessionUser,
                userName: next.name || sessionUser.userName,
                name: next.name,
                avatar: next.avatar,
                email: next.email,
                phone: next.phone,
                position: next.position,
                language: next.language,
                timezone: next.timezone,
                dateFormat: next.dateFormat,
                timeFormat: next.timeFormat,
                thousandsSeparator: next.thousandsSeparator,
                defaultDealsView: next.defaultDealsView,
                defaultActivitiesView: next.defaultActivitiesView,
            })
            setIsEditing(false)
            notify('Изменения сохранены', 'success') // ST-29
        } catch (e) {
            // ST-7: surface the error with its code; keep the draft (no silent catch).
            notify(normalizeApiError(e, 'Не удалось сохранить профиль').message, 'danger')
        } finally {
            setIsSaving(false)
        }
    }

    const triggerAvatarPicker = () => {
        fileInputRef.current?.click()
    }

    const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        // FR-MPROF-5: client-side guard (sniff/limit) — deny svg, ≤5 МБ.
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
        if (!allowed.includes(file.type)) {
            notify('Недопустимый формат файла (PNG/JPEG/WebP)', 'danger')
            e.target.value = ''
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            notify('Файл слишком большой (макс. 5 МБ)', 'danger')
            e.target.value = ''
            return
        }
        setIsUploadingAvatar(true)
        try {
            const resp = await apiUploadMyAvatar(file)
            if (resp?.user) {
                const next = toProfileForm(resp.user)
                setProfile(next)
                setDraft(next)
                setSessionUser({
                    ...sessionUser,
                    avatar: next.avatar,
                    userName: next.name || sessionUser.userName,
                    name: next.name,
                })
            }
            notify('Аватар обновлён', 'success') // ST-29
        } catch (err) {
            notify(normalizeApiError(err, 'Не удалось загрузить аватар').message, 'danger')
        } finally {
            setIsUploadingAvatar(false)
            e.target.value = ''
        }
    }

    // ST-6 Error-load — retryable banner, no fake data.
    if (loadError) {
        return (
            <AccountLayout>
                <AdaptiveCard>
                    <Alert
                        showIcon
                        type="danger"
                        className="mb-4"
                        {...qaWithAlias('host.profile.loadError', 'host.profile.error')}
                    >
                        Не удалось загрузить профиль.
                    </Alert>
                    <Button variant="solid" onClick={load} {...qa('host.profile.retry')}>
                        Повторить
                    </Button>
                </AdaptiveCard>
            </AccountLayout>
        )
    }

    return (
        <AccountLayout>
            <div className="space-y-6" {...(isEditing ? qa('host.profile.editing') : {})}>
                {/* Персональные данные */}
                <AdaptiveCard>
                    <div className="mb-6 flex items-center justify-between gap-3">
                        <h5 className="mb-0">Персональные данные</h5>
                        {!isEditing && canManage && (
                            <Button variant="solid" onClick={startEdit} {...qa('host.profile.edit')}>
                                Редактировать профиль
                            </Button>
                        )}
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-start gap-6">
                            <div className="relative">
                                {draft.avatar || profile.avatar ? (
                                    <img
                                        src={isEditing ? draft.avatar : profile.avatar}
                                        alt="Аватар"
                                        className="w-24 h-24 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-2xl font-semibold text-blue-600 dark:text-blue-400">
                                        {getInitials(
                                            isEditing
                                                ? draft.firstName
                                                : profile.firstName,
                                            isEditing
                                                ? draft.lastName
                                                : profile.lastName,
                                        )}
                                    </div>
                                )}
                                {isEditing && canManage && (
                                    <button
                                        type="button"
                                        className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-60"
                                        title="Загрузить фото"
                                        disabled={isUploadingAvatar}
                                        onClick={triggerAvatarPicker}
                                        {...qa('host.profile.avatarUpload')}
                                    >
                                        <PiCameraDuotone className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="flex-1 pt-2">
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                    {isEditing
                                        ? 'Загрузите изображение для аватара'
                                        : 'Фото профиля'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Рекомендуемый размер: 200x200px, формат: JPG или PNG
                                </p>
                            </div>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            className="hidden"
                            onChange={handleAvatarChange}
                            {...qa('host.profile.avatarInput')}
                        />

                        {isLoading ? (
                            <div className="text-sm text-gray-500">Загрузка профиля...</div>
                        ) : isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Input
                                        value={draft.firstName}
                                        placeholder="Имя"
                                        suffix={<HelpIcon title="Имя" />}
                                        onChange={(e) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                firstName: e.target.value,
                                            }))
                                        }
                                        {...qa('host.profile.firstName')}
                                    />
                                </div>
                                <div>
                                    <Input
                                        value={draft.lastName}
                                        placeholder="Фамилия"
                                        suffix={<HelpIcon title="Фамилия" />}
                                        onChange={(e) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                lastName: e.target.value,
                                            }))
                                        }
                                        {...qa('host.profile.lastName')}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            readOnly
                                            value={draft.email}
                                            placeholder="Эл. почта"
                                            suffix={<HelpIcon title="Эл. почта" />}
                                            className="bg-gray-50 dark:bg-gray-800"
                                        />
                                        <Link
                                            to="/account/profile/change-email"
                                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
                                            {...qa('host.profile.changeEmail')}
                                        >
                                            Изменить
                                        </Link>
                                    </div>
                                    {/* ST-26 Pending email */}
                                    {pendingEmail && (
                                        <Tag
                                            className="mt-2 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                            {...qa('host.profile.pendingEmail')}
                                        >
                                            Ожидает подтверждения: {pendingEmail}
                                        </Tag>
                                    )}
                                </div>
                                <div>
                                    <Input
                                        value={draft.phone}
                                        placeholder="Телефон — +7 (999) 123-45-67"
                                        suffix={<HelpIcon title="Телефон" />}
                                        onChange={(e) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                phone: e.target.value,
                                            }))
                                        }
                                        {...qa('host.profile.phone')}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Input
                                        value={draft.position}
                                        placeholder="Должность — напр. Менеджер по продажам"
                                        suffix={<HelpIcon title="Должность" />}
                                        onChange={(e) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                position: e.target.value,
                                            }))
                                        }
                                        {...qa('host.profile.position')}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <ReadOnlyField label="Имя" value={profile.firstName} />
                                <ReadOnlyField
                                    label="Фамилия"
                                    value={profile.lastName}
                                />
                                <ReadOnlyField
                                    label="Эл. почта"
                                    value={profile.email}
                                />
                                <ReadOnlyField
                                    label="Телефон"
                                    value={profile.phone}
                                />
                                <div className="md:col-span-2">
                                    <ReadOnlyField
                                        label="Должность"
                                        value={profile.position}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                {/* Настройки */}
                <AdaptiveCard>
                    <h5 className="mb-6">Настройки</h5>

                    {isLoading ? (
                        <div className="text-sm text-gray-500">Загрузка профиля...</div>
                    ) : isEditing ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Язык
                                    </label>
                                    <Select<{ value: string; label: string }>
                                        value={LANGUAGE_OPTIONS.find(
                                            (opt) => opt.value === draft.language,
                                        )}
                                        options={LANGUAGE_OPTIONS}
                                        onChange={(opt) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                language: opt?.value || 'ru',
                                            }))
                                        }
                                        {...qa('host.profile.language')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Часовой пояс
                                    </label>
                                    <Select<{ value: string; label: string }>
                                        value={TIMEZONE_OPTIONS.find(
                                            (opt) => opt.value === draft.timezone,
                                        )}
                                        options={TIMEZONE_OPTIONS}
                                        onChange={(opt) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                timezone:
                                                    opt?.value || 'Europe/Moscow',
                                            }))
                                        }
                                        {...qa('host.profile.timezone')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Формат даты
                                    </label>
                                    <Select<{ value: string; label: string }>
                                        value={DATE_FORMAT_OPTIONS.find(
                                            (opt) =>
                                                opt.value === draft.dateFormat,
                                        )}
                                        options={DATE_FORMAT_OPTIONS}
                                        onChange={(opt) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                dateFormat:
                                                    opt?.value || 'DD.MM.YYYY',
                                            }))
                                        }
                                        {...qa('host.profile.dateFormat')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Формат времени
                                    </label>
                                    <Segment
                                        value={draft.timeFormat}
                                        onChange={(val) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                timeFormat: toSegmentValue(
                                                    val,
                                                ) as TimeFormat,
                                            }))
                                        }
                                        {...qa('host.profile.timeFormat')}
                                    >
                                        <Segment.Item value="24h" {...qa('host.profile.timeFormatOption', { value: '24h' })}>
                                            24 часа
                                        </Segment.Item>
                                        <Segment.Item value="12h" {...qa('host.profile.timeFormatOption', { value: '12h' })}>
                                            12 часов
                                        </Segment.Item>
                                    </Segment>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Разделитель тысяч
                                    </label>
                                    <Segment
                                        value={draft.thousandsSeparator}
                                        onChange={(val) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                thousandsSeparator:
                                                    toSegmentValue(
                                                        val,
                                                    ) as ThousandsSeparator,
                                            }))
                                        }
                                        {...qa('host.profile.thousandsSeparator')}
                                    >
                                        <Segment.Item value="space" {...qa('host.profile.thousandsSeparatorOption', { value: 'space' })}>
                                            Пробел
                                        </Segment.Item>
                                        <Segment.Item value="comma" {...qa('host.profile.thousandsSeparatorOption', { value: 'comma' })}>
                                            Запятая
                                        </Segment.Item>
                                    </Segment>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-3">
                                    Представления по умолчанию
                                </label>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            Сделки
                                        </label>
                                        <Segment
                                            value={draft.defaultDealsView}
                                            onChange={(val) =>
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    defaultDealsView:
                                                        toSegmentValue(
                                                            val,
                                                        ) as ViewMode,
                                                }))
                                            }
                                            {...qa('host.profile.defaultDealsView')}
                                        >
                                            <Segment.Item
                                                value="kanban"
                                                {...qa('host.profile.defaultDealsViewOption', { value: 'kanban' })}
                                                {...qa('host.profile.defaultDealsView.kanban')}
                                            >
                                                Доска
                                            </Segment.Item>
                                            <Segment.Item
                                                value="list"
                                                {...qa('host.profile.defaultDealsViewOption', { value: 'list' })}
                                                {...qa('host.profile.defaultDealsView.list')}
                                            >
                                                Список
                                            </Segment.Item>
                                        </Segment>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                                            Активности
                                        </label>
                                        <Segment
                                            value={draft.defaultActivitiesView}
                                            onChange={(val) =>
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    defaultActivitiesView:
                                                        toSegmentValue(
                                                            val,
                                                        ) as ActivitiesView,
                                                }))
                                            }
                                            {...qa('host.profile.defaultActivitiesView')}
                                        >
                                            <Segment.Item value="list" {...qa('host.profile.defaultActivitiesViewOption', { value: 'list' })}>
                                                Список
                                            </Segment.Item>
                                            <Segment.Item value="calendar" {...qa('host.profile.defaultActivitiesViewOption', { value: 'calendar' })}>
                                                Календарь
                                            </Segment.Item>
                                        </Segment>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <ReadOnlyField
                                label="Язык"
                                value={optionLabel(
                                    LANGUAGE_OPTIONS,
                                    profile.language,
                                )}
                            />
                            <ReadOnlyField
                                label="Часовой пояс"
                                value={optionLabel(
                                    TIMEZONE_OPTIONS,
                                    profile.timezone,
                                )}
                            />
                            <ReadOnlyField
                                label="Формат даты"
                                value={profile.dateFormat}
                            />
                            <ReadOnlyField
                                label="Формат времени"
                                value={
                                    profile.timeFormat === '24h'
                                        ? '24 часа'
                                        : '12 часов'
                                }
                            />
                            <ReadOnlyField
                                label="Разделитель тысяч"
                                value={
                                    profile.thousandsSeparator === 'space'
                                        ? 'Пробел'
                                        : 'Запятая'
                                }
                            />
                            <ReadOnlyField
                                label="Сделки по умолчанию"
                                value={
                                    profile.defaultDealsView === 'kanban'
                                        ? 'Доска'
                                        : 'Список'
                                }
                            />
                            <ReadOnlyField
                                label="Активности по умолчанию"
                                value={
                                    profile.defaultActivitiesView === 'list'
                                        ? 'Список'
                                        : 'Календарь'
                                }
                            />
                        </div>
                    )}
                </AdaptiveCard>

                {isEditing && (
                    <div className="flex justify-end gap-3">
                        <Button variant="plain" onClick={cancelEdit} {...qa('host.profile.cancel')}>
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={isSaving}
                            onClick={handleSave}
                            {...qa('host.profile.save')}
                        >
                            Сохранить изменения
                        </Button>
                    </div>
                )}
            </div>
        </AccountLayout>
    )
}

export default Profile
