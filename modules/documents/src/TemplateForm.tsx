import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import {
    PiArrowLeftDuotone,
    PiUploadDuotone,
    PiCopyDuotone,
    PiFileDuotone,
    PiDownloadDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiGetTemplate,
    apiListDocumentVariables,
    apiCreateTemplate,
    apiUpdateTemplate,
    apiPublishTemplate,
    apiDownloadTemplate,
    CONTEXT_LABELS,
    type DocContextType,
    type VariableDef,
} from '@/services/DocumentsService'
import { apiGetOrderTypes } from '@/services/CrmService'
import type { OrderType } from '@/@types/crm'
import { NoPermissionState, ErrorState, errMessage, httpStatus } from '@/components/shared/documents/shared'
import { qa } from './qa'

const contextKeys: DocContextType[] = ['order', 'deal', 'contact', 'company']

const TemplateForm = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canManage = can('documents', 'manage')

    // Фикс AS-IS-бага: режим определяется по наличию реального id (не 'new'/undefined).
    const isEdit = !!id && id !== 'new'

    const [name, setName] = useState('')
    const [context, setContext] = useState<DocContextType>('order')
    const [orderType, setOrderType] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [fileName, setFileName] = useState('')
    const [dirty, setDirty] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [leaveOpen, setLeaveOpen] = useState(false)
    const [nameError, setNameError] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Загрузка данных шаблона в edit-режиме (ST-1/ST-9) ──
    const tplKey = isEdit && pid && canManage ? ['/document-templates', pid, id] : null
    const {
        data: tpl,
        isLoading: tplLoading,
        error: tplError,
        mutate: tplMutate,
    } = useSWR(tplKey, () => apiGetTemplate(id!, { projectId: pid! }), {
        revalidateOnFocus: false,
    })

    useEffect(() => {
        if (tpl) {
            setName(tpl.name)
            setContext(tpl.contextType)
            setOrderType(tpl.orderTypeId ?? '')
            setFileName(`${tpl.name}.docx`)
        }
    }, [tpl])

    // ── Реальные типы продаж из orders-домена (BX-FLOW-4): убран мок ot1/ot2/ot3.
    //    Тег orderTypeId шаблона должен совпадать с настоящим типом продажи, иначе
    //    сужение шаблонов по типу заказа на карточке не сработает. Деградируем тихо. ──
    const { data: orderTypes } = useSWR(
        pid && canManage ? ['/api/v1/order-types', pid, 'templates'] : null,
        () => apiGetOrderTypes<OrderType[]>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const orderTypeOptions = useMemo(
        () => (orderTypes || []).map((ot) => ({ value: ot.id, label: ot.name })),
        [orderTypes],
    )

    // ── Каталог переменных по контексту (EL-FORM-8 / FR-DOCS-310) ──
    const { data: varsData, isLoading: varsLoading } = useSWR(
        pid && canManage ? ['/document-variables', pid, context, orderType] : null,
        () =>
            apiListDocumentVariables({
                projectId: pid!,
                contextType: context,
                orderTypeId: context === 'order' ? orderType || undefined : undefined,
            }),
        { revalidateOnFocus: false },
    )

    const variableGroups = useMemo(() => {
        const groups: Record<string, VariableDef[]> = {}
        for (const v of varsData?.items ?? []) {
            ;(groups[v.group] ??= []).push(v)
        }
        return groups
    }, [varsData])

    const copyToClipboard = (key: string) => {
        navigator.clipboard.writeText(`{{${key}}}`).then(() => toast.push('Скопировано'))
    }

    const onFilePicked = (f: File) => {
        if (!f.name.toLowerCase().endsWith('.docx')) {
            toast.push('Допустимы только файлы DOCX')
            return
        }
        setFile(f)
        setFileName(f.name)
        setDirty(true)
    }

    // G4: скачать текущий сохранённый DOCX редактируемого шаблона (presigned URL).
    const handleDownloadCurrent = async () => {
        if (!pid || !id) return
        try {
            const { url } = await apiDownloadTemplate(id, { projectId: pid })
            window.open(url, '_blank', 'noopener')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось скачать файл шаблона'))
        }
    }

    const validate = (): boolean => {
        if (!name.trim()) {
            setNameError('Введите название шаблона')
            return false
        }
        if (!isEdit && !file) {
            toast.push('Загрузите DOCX-файл шаблона')
            return false
        }
        setNameError('')
        return true
    }

    const buildForm = (): FormData => {
        const form = new FormData()
        form.append('name', name.trim())
        form.append('contextType', context)
        if (context === 'order' && orderType) form.append('orderTypeId', orderType)
        if (file) form.append('file', file)
        return form
    }

    const handleSave = async (publishAfter = false) => {
        if (!pid || !validate()) return
        setSubmitting(true)
        try {
            const form = buildForm()
            const saved = isEdit
                ? await apiUpdateTemplate(id!, form, { projectId: pid })
                : await apiCreateTemplate(form, { projectId: pid })
            if (publishAfter) {
                await apiPublishTemplate(saved.id, { projectId: pid })
                toast.push('Шаблон сохранён и опубликован')
            } else {
                toast.push(isEdit ? 'Шаблон сохранён' : 'Шаблон создан')
            }
            setDirty(false)
            navigate('/documents/templates')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось сохранить шаблон'))
        } finally {
            setSubmitting(false)
        }
    }

    const tryLeave = () => {
        if (dirty) setLeaveOpen(true)
        else navigate('/documents/templates')
    }

    // ── ST-10/11: нет права manage ──
    if (!canManage) {
        return (
            <Container {...qa('documents.templateForm.noPermission')}>
                <NoPermissionState message="Нет права documents:manage для управления шаблонами." />
            </Container>
        )
    }

    // ── ST-1: загрузка edit-данных ──
    if (isEdit && tplLoading) {
        return (
            <Container>
                <div className="flex flex-col gap-4">
                    <Spinner size={28} className="mx-auto mt-10" />
                </div>
            </Container>
        )
    }

    // ── ST-9: шаблон не найден ──
    if (isEdit && tplError && httpStatus(tplError) === 404) {
        return (
            <Container>
                <div className="text-center py-16" {...qa('documents.templateForm.notFound')}>
                    <PiFileDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Шаблон не найден</p>
                    <Button
                        size="sm"
                        variant="solid"
                        className="mt-4"
                        {...qa('documents.templateForm.backToList')}
                        onClick={() => navigate('/documents/templates')}
                    >
                        ← К шаблонам
                    </Button>
                </div>
            </Container>
        )
    }

    // ── ST-6 ──
    if (isEdit && tplError) {
        return (
            <Container>
                <ErrorState
                    message={errMessage(tplError, 'Не удалось загрузить шаблон')}
                    onRetry={() => tplMutate()}
                />
            </Container>
        )
    }

    return (
        <Container {...qa('documents.templateForm.root')}>
            <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                {...qa('documents.templateForm.fileInput')}
                aria-label="Загрузить DOCX-файл шаблона"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onFilePicked(f)
                    e.target.value = ''
                }}
            />
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        {...qa('documents.templateForm.back')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={tryLeave}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">
                        {isEdit ? 'Редактирование шаблона' : 'Новый шаблон'}
                    </h3>
                </div>

                <AdaptiveCard>
                    <h5 className="mb-4">Основная информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">
                                Название шаблона *
                            </label>
                            <Input
                                {...qa('documents.templateForm.name')}
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value)
                                    setDirty(true)
                                    if (nameError) setNameError('')
                                }}
                                placeholder="Введите название"
                            />
                            {nameError && (
                                <p className="text-xs text-red-500 mt-1">{nameError}</p>
                            )}
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-2">Контекст *</label>
                            <div className="flex gap-4 flex-wrap">
                                {contextKeys.map((ctx) => (
                                    <label
                                        key={ctx}
                                        className="flex items-center gap-2 cursor-pointer"
                                    >
                                        <input
                                            type="radio"
                                            {...qa('documents.templateForm.context', { context: ctx })}
                                            checked={context === ctx}
                                            onChange={() => {
                                                setContext(ctx)
                                                setDirty(true)
                                            }}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-sm">{CONTEXT_LABELS[ctx]}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {context === 'order' && (
                            <div className="md:col-span-2" {...qa('documents.templateForm.orderType')}>
                                <label className="block text-sm font-medium mb-1">
                                    Тип продажи
                                </label>
                                <Select
                                    {...qa('documents.templateForm.orderType')}
                                    options={orderTypeOptions}
                                    value={
                                        orderTypeOptions.find((o) => o.value === orderType) ||
                                        null
                                    }
                                    onChange={(opt) => {
                                        setOrderType(opt?.value || '')
                                        setDirty(true)
                                    }}
                                    placeholder={
                                        orderTypeOptions.length
                                            ? 'Выберите тип продажи'
                                            : 'Нет доступных типов продаж'
                                    }
                                    isClearable
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Шаблон предлагается на карточке продаж только этого типа;
                                    без выбора — для всех типов.
                                </p>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Файл шаблона</h5>
                    {fileName ? (
                        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                            <PiFileDuotone className="w-8 h-8 text-blue-500" />
                            <div className="flex-1">
                                <div className="font-medium">{fileName}</div>
                                <div className="text-xs text-gray-500">DOCX</div>
                            </div>
                            {/* G4: скачать текущий сохранённый файл (только в edit-режиме,
                                пока не выбран новый файл для замены). */}
                            {isEdit && !file && (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiDownloadDuotone />}
                                    {...qa('documents.templateForm.downloadCurrent')}
                                    onClick={handleDownloadCurrent}
                                >
                                    Скачать
                                </Button>
                            )}
                            <Button
                                size="xs"
                                variant="plain"
                                {...qa('documents.templateForm.replaceFile')}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Заменить
                            </Button>
                        </div>
                    ) : (
                        <div
                            className="flex items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer"
                            {...qa('documents.templateForm.dropZone')}
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault()
                                const f = e.dataTransfer.files?.[0]
                                if (f) onFilePicked(f)
                            }}
                        >
                            <div className="text-center">
                                <PiUploadDuotone className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-500 mb-2">
                                    Перетащите DOCX-файл или нажмите для загрузки
                                </p>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    icon={<PiUploadDuotone />}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        fileInputRef.current?.click()
                                    }}
                                >
                                    Выбрать файл
                                </Button>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-gray-500 mt-3">
                        Загрузите DOCX-файл с переменными вида {'{{variable}}'}. Запрещены
                        макросы и внешние ссылки; используемые переменные определяются
                        автоматически.
                    </p>
                </AdaptiveCard>

                <AdaptiveCard>
                    <h5 className="mb-4">Доступные переменные</h5>
                    {varsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                            <Spinner size={18} /> Загрузка каталога…
                        </div>
                    ) : Object.keys(variableGroups).length === 0 ? (
                        <p
                            className="text-sm text-gray-500 py-4"
                            {...qa('documents.templateForm.variablesEmpty')}
                        >
                            Для выбранного контекста нет доступных переменных (возможно, модуль-донор
                            выключен).
                        </p>
                    ) : (
                        <div className="space-y-6" {...qa('documents.templateForm.variablesTable')}>
                            {Object.entries(variableGroups).map(([group, vars]) => (
                                <div key={group}>
                                    <h6 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wider">
                                        {group}
                                    </h6>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b">
                                                    <th className="text-left py-1.5 font-medium w-56">
                                                        Переменная
                                                    </th>
                                                    <th className="text-left py-1.5 font-medium">
                                                        Описание
                                                    </th>
                                                    <th className="text-left py-1.5 font-medium w-20">
                                                        Обяз.
                                                    </th>
                                                    <th className="w-10" aria-label="Копировать" />
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {vars.map((v) => (
                                                    <tr
                                                        key={v.key}
                                                        className="border-b last:border-0"
                                                    >
                                                        <td className="py-1.5">
                                                            <code className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">
                                                                {`{{${v.key}}}`}
                                                            </code>
                                                        </td>
                                                        <td className="py-1.5 text-gray-600 dark:text-gray-400">
                                                            {v.label}
                                                        </td>
                                                        <td className="py-1.5 text-gray-500">
                                                            {v.required ? 'да' : '—'}
                                                        </td>
                                                        <td className="py-1.5">
                                                            <button
                                                                type="button"
                                                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                                title="Копировать"
                                                                {...qa('documents.templateForm.variableCopy', {
                                                                    key: v.key,
                                                                })}
                                                                onClick={() =>
                                                                    copyToClipboard(v.key)
                                                                }
                                                            >
                                                                <PiCopyDuotone className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </AdaptiveCard>

                <div className="flex justify-end gap-3">
                    <Button variant="plain" onClick={tryLeave} disabled={submitting}>
                        Отмена
                    </Button>
                    <Button
                        variant="default"
                        loading={submitting}
                        {...qa('documents.templateForm.saveAndPublish')}
                        onClick={() => handleSave(true)}
                    >
                        Сохранить и опубликовать
                    </Button>
                    <Button
                        variant="solid"
                        color="primary"
                        loading={submitting}
                        {...qa('documents.templateForm.save')}
                        onClick={() => handleSave(false)}
                    >
                        {isEdit ? 'Сохранить' : 'Создать'}
                    </Button>
                </div>
            </div>

            {/* ST-30: dirty-state guard */}
            <Dialog
                isOpen={leaveOpen}
                onClose={() => setLeaveOpen(false)}
                onRequestClose={() => setLeaveOpen(false)}
                {...qa('documents.templateForm.leaveDialog')}
            >
                <h5 className="mb-2">Несохранённые изменения</h5>
                <p className="text-sm text-gray-500 mb-6">
                    Покинуть форму без сохранения? Внесённые изменения будут потеряны.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => setLeaveOpen(false)}
                        {...qa('documents.templateForm.leaveStay')}
                    >
                        Остаться
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        {...qa('documents.templateForm.leaveConfirm')}
                        onClick={() => navigate('/documents/templates')}
                        {...qa('documents.templateForm.leaveDiscard')}
                    >
                        Уйти без сохранения
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default TemplateForm
