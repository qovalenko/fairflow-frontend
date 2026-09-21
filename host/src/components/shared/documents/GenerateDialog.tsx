import { useMemo, useState } from 'react'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiWarningDuotone } from 'react-icons/pi'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import toast from '@/components/ui/toast'
import useProjectMemberNames from '@/utils/hooks/useProjectMemberNames'
import {
    apiListTemplates,
    apiListTemplateRevisions,
    apiGetDocument,
    apiGenerateDocument,
    apiRegenerateDocument,
    CONTEXT_LABELS,
    type GenerateResponse,
    type DocContextType,
    type TemplateRevision,
} from '@/services/DocumentsService'
import { errCode, errMessage } from './shared'
import DocumentsHowTo from './DocumentsHowTo'
import { qa } from '@/shared/qa'
import type { OptionProps } from 'react-select'
import { components as selectComponents } from 'react-select'

interface GenerateDialogProps {
    isOpen: boolean
    onClose: () => void
    projectId: string
    /** Режим перегенерации: задан groupId — перевыпуск существующей группы (DETAIL). */
    regenerateGroupId?: string
    /** Контекст для генерации с нуля (TAB/карточка записи). */
    contextType?: DocContextType
    recordId?: string
    /** Подсказка drift при перегенерации. */
    driftChangedKeys?: string[]
    expectedVersion?: number
    onDone?: (res: GenerateResponse) => void
}

function revisionLabel(
    rev: TemplateRevision | undefined,
    userName: (id?: string | null) => string | undefined,
    prefix: string,
): string {
    if (!rev) return prefix
    const when = rev.publishedAt
        ? dayjs(rev.publishedAt).format('DD.MM.YYYY')
        : dayjs(rev.createdAt).format('DD.MM.YYYY')
    const author = userName(rev.createdBy) ?? rev.createdBy
    return `${prefix} — v${rev.version}, ${when}${author ? `, ${author}` : ''}`
}

/**
 * SCR-DOCUMENTS-GENERATE-DIALOG — выбор шаблона + ack drift/empty.
 * Поддерживает оба потока: FLOW-DOCUMENTS-GENERATE и FLOW-DOCUMENTS-REGENERATE.
 */
const GenerateDialog = (props: GenerateDialogProps) => {
    const {
        isOpen,
        onClose,
        projectId,
        regenerateGroupId,
        contextType,
        recordId,
        driftChangedKeys,
        expectedVersion,
        onDone,
    } = props

    const isRegenerate = !!regenerateGroupId
    const [templateId, setTemplateId] = useState<string>('')
    const [useRevision, setUseRevision] = useState<'current' | 'source'>('current')
    const [submitting, setSubmitting] = useState(false)
    const { userName } = useProjectMemberNames(projectId)

    const { data: docDetail } = useSWR(
        isOpen && isRegenerate && regenerateGroupId
            ? ['/documents', regenerateGroupId, projectId, 'generate-dialog']
            : null,
        () => apiGetDocument(regenerateGroupId!, { projectId }),
        { revalidateOnFocus: false },
    )

    const resolvedTemplateId = isRegenerate
        ? docDetail?.group.templateId ?? ''
        : templateId

    const { data: revisionsData } = useSWR(
        isOpen && resolvedTemplateId
            ? ['/document-templates', resolvedTemplateId, projectId, 'revisions']
            : null,
        () => apiListTemplateRevisions(resolvedTemplateId, { projectId }),
        { revalidateOnFocus: false },
    )

    const revisions = revisionsData?.items ?? []
    const currentRev = revisions.find((r) => r.publishedAt) ?? revisions[0]
    // getDocument отдаёт versions по убыванию version; backend regenerate
    // (`use_revision=source`) берёт templateRevision ТЕКУЩЕЙ версии группы.
    const sourceRevVersion =
        docDetail?.versions.find((v) => v.version === docDetail.group.currentVersion)
            ?.templateRevision ?? docDetail?.versions[0]?.templateRevision
    const sourceRev = revisions.find((r) => r.version === sourceRevVersion)

    const revisionOptions = useMemo(
        () => [
            {
                value: 'current',
                label: revisionLabel(
                    currentRev,
                    userName,
                    'Текущая редакция шаблона',
                ),
            },
            {
                value: 'source',
                label: revisionLabel(
                    isRegenerate ? sourceRev : currentRev,
                    userName,
                    isRegenerate
                        ? 'Редакция исходной версии'
                        : 'Зафиксировать редакцию на момент генерации',
                ),
            },
        ],
        [currentRev, sourceRev, isRegenerate, userName],
    )

    // Список опубликованных шаблонов под контекст (для режима генерации).
    const { data, isLoading } = useSWR(
        isOpen && !isRegenerate
            ? ['/document-templates', projectId, contextType, recordId, 'published']
            : null,
        () =>
            apiListTemplates({
                projectId,
                contextType,
                recordId,
                status: 'published',
            }),
        { revalidateOnFocus: false },
    )

    const templateOptions = useMemo(
        () =>
            (data?.items ?? []).map((t) => ({
                value: t.id,
                label: `${t.name} (${CONTEXT_LABELS[t.contextType]})`,
            })),
        [data],
    )

    const submit = async (acceptDrift = false) => {
        setSubmitting(true)
        try {
            let res: GenerateResponse
            if (isRegenerate) {
                res = await apiRegenerateDocument(
                    regenerateGroupId!,
                    { useRevision, expectedVersion, acceptDrift },
                    { projectId },
                )
                toast.push('Создана новая версия документа')
            } else {
                if (!templateId || !contextType || !recordId) {
                    toast.push('Выберите шаблон')
                    setSubmitting(false)
                    return
                }
                res = await apiGenerateDocument(
                    { templateId, contextType, recordId, useRevision, acceptDrift },
                    { projectId },
                )
                const warn = res.warnings
                if (warn?.emptyRequired?.length) {
                    toast.push(
                        `Документ создан. Не заполнены поля: ${warn.emptyRequired.join(', ')}`,
                    )
                } else {
                    toast.push('Документ сгенерирован')
                }
            }
            onDone?.(res)
            onClose()
        } catch (e) {
            // FR-ORDERS-255: 409 DRIFT_NOT_ACCEPTED — явный ack, затем повтор.
            if (!acceptDrift && errCode(e) === 'DRIFT_NOT_ACCEPTED') {
                if (
                    window.confirm(
                        'Реквизиты продажи изменились. Принять изменения и сгенерировать документ?',
                    )
                ) {
                    setSubmitting(false)
                    await submit(true)
                    return
                }
            }
            toast.push(errMessage(e, 'Не удалось сгенерировать документ'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} {...qa('documents.generate.dialog')}>
            <h5 className="mb-4">
                {isRegenerate ? 'Перегенерация документа' : 'Генерация документа'}
            </h5>

            {isRegenerate && driftChangedKeys && driftChangedKeys.length > 0 && (
                <div
                    className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                    {...qa('documents.generate.driftKeys')}
                >
                    <PiWarningDuotone className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                        Реквизиты изменились с момента генерации:{' '}
                        <span className="font-medium">{driftChangedKeys.join(', ')}</span>. Новая
                        версия будет создана с актуальными значениями.
                    </p>
                </div>
            )}

            <div className="flex flex-col gap-4">
                {!isRegenerate && (
                    <div>
                        <label className="block text-sm font-medium mb-1">Шаблон *</label>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                <Spinner size={18} /> Загрузка шаблонов…
                            </div>
                        ) : templateOptions.length === 0 ? (
                            <div className="py-2" {...qa('documents.generate.howTo')}>
                                <p className="text-sm text-gray-500 mb-4">
                                    Нет опубликованных шаблонов для этого контекста. Документы
                                    генерируются из шаблонов — настройте их за 3 шага:
                                </p>
                                <DocumentsHowTo compact />
                            </div>
                        ) : (
                            <Select
                                {...qa('documents.generate.template')}
                                options={templateOptions}
                                value={
                                    templateOptions.find((o) => o.value === templateId) || null
                                }
                                onChange={(opt) => {
                                    const selected =
                                        opt && !Array.isArray(opt)
                                            ? (opt as { value: string; label: string })
                                            : null
                                    setTemplateId(selected?.value ?? '')
                                }}
                                placeholder="Выберите шаблон"
                                components={{
                                    Option: (props: OptionProps<{ value: string; label: string }>) => (
                                        <selectComponents.Option
                                            {...props}
                                            innerProps={{
                                                ...props.innerProps,
                                                ...qa('documents.generate.templateOption', {
                                                    template: String(props.data.value),
                                                }),
                                            }}
                                        />
                                    ),
                                }}
                            />
                        )}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium mb-1">Редакция</label>
                    <Select
                        {...qa('documents.generate.revision')}
                        options={revisionOptions}
                        value={revisionOptions.find((o) => o.value === useRevision) || null}
                        onChange={(opt) =>
                            setUseRevision((opt?.value as 'current' | 'source') || 'current')
                        }
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
                <Button variant="plain" onClick={onClose} disabled={submitting} {...qa('documents.generate.cancel')}>
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={submitting}
                    disabled={!isRegenerate && !templateId}
                    {...qa('documents.generate.submit')}
                    onClick={() => void submit()}
                >
                    {isRegenerate ? 'Перегенерировать' : 'Сгенерировать'}
                </Button>
            </div>
        </Dialog>
    )
}

export default GenerateDialog
