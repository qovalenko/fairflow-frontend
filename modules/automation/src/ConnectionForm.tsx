import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import { PiArrowLeftDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiGetConnection,
    apiCreateConnection,
    apiUpdateConnection,
    type SaveConnectionInput,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    NotFoundState,
    errMessage,
    errCode,
    httpStatus,
} from './shared'
import { qa } from './qa'

/** SCR-AUTOMATION-CONNECTION-FORM — создание/редактирование connection. */
const ConnectionForm = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const isEdit = !!id && id !== 'new'
    const can = usePermission()
    const canManage = can('automation', 'manage')

    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [secret, setSecret] = useState('')
    const [headersText, setHeadersText] = useState('')
    const [enabled, setEnabled] = useState(true)
    const [secretSet, setSecretSet] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [fieldError, setFieldError] = useState<{ url?: string; name?: string }>(
        {},
    )

    const {
        data: conn,
        isLoading,
        error,
        mutate,
    } = useSWR(
        isEdit && pid && canManage ? ['/automation/connections', pid, id] : null,
        () => apiGetConnection(id!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    useEffect(() => {
        if (!conn) return
        setName(conn.name)
        setUrl(conn.url)
        setEnabled(conn.enabled)
        setSecretSet(conn.secretSet)
        setHeadersText(
            conn.headers
                ? Object.entries(conn.headers)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')
                : '',
        )
        setDirty(false)
    }, [conn])

    const goBack = () => {
        if (
            dirty &&
            !window.confirm('Несохранённые изменения будут потеряны. Выйти?')
        ) {
            return
        }
        navigate('/automation/connections')
    }

    const parseHeaders = (): Record<string, string> | undefined => {
        if (!headersText.trim()) return undefined
        const out: Record<string, string> = {}
        for (const line of headersText.split('\n')) {
            const idx = line.indexOf(':')
            if (idx > 0) {
                out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
            }
        }
        return Object.keys(out).length ? out : undefined
    }

    const handleSave = async () => {
        if (!pid) return
        setFieldError({})
        if (!name.trim()) {
            setFieldError({ name: 'Укажите название' })
            return
        }
        if (!url.trim()) {
            setFieldError({ url: 'Укажите URL' })
            return
        }
        setSaving(true)
        try {
            const payload: SaveConnectionInput = {
                name: name.trim(),
                url: url.trim(),
                headers: parseHeaders(),
                enabled,
            }
            if (secret) payload.secret = secret
            if (isEdit) {
                await apiUpdateConnection(id!, payload, { projectId: pid })
                toast.push('Connection сохранён')
            } else {
                await apiCreateConnection(payload, { projectId: pid })
                toast.push('Connection создан')
            }
            setDirty(false)
            navigate('/automation/connections')
        } catch (e) {
            // ST-7: deny-лист URL / коллизия имени — inline
            const code = errCode(e)
            if (code === 'WEBHOOK_TARGET_INVALID' || code === 'WEBHOOK_URL_DENIED') {
                setFieldError({ url: errMessage(e, 'URL запрещён политикой') })
            } else if (code === 'ALREADY_EXISTS') {
                setFieldError({
                    name: errMessage(e, 'Connection с таким именем уже существует'),
                })
            } else {
                toast.push(errMessage(e, 'Не удалось сохранить connection'))
            }
        } finally {
            setSaving(false)
        }
    }

    if (!pid) {
        return (
            <Container>
                <NoProjectState />
            </Container>
        )
    }
    if (!canManage) {
        return (
            <Container>
                <NoPermissionState message="Нужно право automation:manage." />
            </Container>
        )
    }
    if (isEdit && isLoading) {
        return (
            <Container>
                <div className="flex flex-col gap-4">
                    <Skeleton height={40} width={280} />
                    <Skeleton height={300} className="rounded-lg" />
                </div>
            </Container>
        )
    }
    if (isEdit && error) {
        if (httpStatus(error) === 404) {
            return (
                <Container>
                    <NotFoundState
                        message="Connection не найден."
                        onBack={() => navigate('/automation/connections')}
                        backLabel="К каталогу"
                    />
                </Container>
            )
        }
        return (
            <Container>
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить connection')}
                    onRetry={() => mutate()}
                />
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        aria-label="Назад"
                        title="Назад"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        onClick={goBack}
                        {...qa('automation.connectionForm.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">
                        {isEdit ? 'Редактирование connection' : 'Новый connection'}
                    </h3>
                </div>

                <AdaptiveCard>
                    <div className="max-w-lg space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Название *
                            </label>
                            <Input
                                value={name}
                                onChange={(e) => {
                                    setDirty(true)
                                    setName(e.target.value)
                                }}
                                placeholder="Например, 1С прод"
                                {...qa('automation.connectionForm.name')}
                            />
                            {fieldError.name && (
                                <p className="text-xs text-red-500 mt-1" {...qa('automation.connectionForm.nameError')}>
                                    {fieldError.name}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                URL * (https, проверяется политикой безопасности)
                            </label>
                            <Input
                                value={url}
                                onChange={(e) => {
                                    setDirty(true)
                                    setUrl(e.target.value)
                                }}
                                placeholder="https://erp.example.com/hook"
                                {...qa('automation.connectionForm.url')}
                            />
                            {fieldError.url && (
                                <p className="text-xs text-red-500 mt-1" {...qa('automation.connectionForm.urlError')}>
                                    {fieldError.url}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Заголовки (по одному на строку, «Ключ: значение»)
                            </label>
                            <textarea
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent p-2 text-sm font-mono"
                                rows={3}
                                value={headersText}
                                onChange={(e) => {
                                    setDirty(true)
                                    setHeadersText(e.target.value)
                                }}
                                placeholder="X-Tenant: acme"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Секрет (HMAC){secretSet ? ' — задан' : ''}
                            </label>
                            <Input
                                type="password"
                                value={secret}
                                onChange={(e) => {
                                    setDirty(true)
                                    setSecret(e.target.value)
                                }}
                                placeholder={
                                    secretSet
                                        ? 'Оставьте пустым, чтобы не менять'
                                        : 'whsec_…'
                                }
                                {...qa('automation.connectionForm.secret')}
                            />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <Switcher
                                checked={enabled}
                                onChange={() => {
                                    setDirty(true)
                                    setEnabled((v) => !v)
                                }}
                            />
                            <span className="text-sm">Включён</span>
                        </label>
                    </div>
                </AdaptiveCard>

                <div className="flex justify-end gap-2">
                    <Button variant="plain" onClick={goBack} {...qa('automation.connectionForm.cancel')}>
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={saving}
                        onClick={handleSave}
                        {...qa('automation.connectionForm.save')}
                    >
                        Сохранить
                    </Button>
                </div>
            </div>
        </Container>
    )
}

export default ConnectionForm
