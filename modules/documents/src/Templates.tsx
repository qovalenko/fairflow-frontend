import { useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import {
    PiPlusDuotone,
    PiPencilDuotone,
    PiDownloadDuotone,
    PiFileDuotone,
    PiUploadSimpleDuotone,
    PiArchiveDuotone,
    PiTrashDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiListTemplates,
    apiPublishTemplate,
    apiArchiveTemplate,
    apiDeleteTemplate,
    apiDownloadTemplate,
    CONTEXT_LABELS,
    type TemplateSummary,
    type TemplateStatus,
} from '@/services/DocumentsService'
import { NoPermissionState, ErrorState, errMessage } from '@/components/shared/documents/shared'
import DocumentsHowTo from '@/components/shared/documents/DocumentsHowTo'
import { qa } from './qa'

const contextColors: Record<string, string> = {
    order: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    deal: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    contact: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    company: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
}

const statusMeta: Record<TemplateStatus, { label: string; color: string }> = {
    draft: {
        label: 'Черновик',
        color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    },
    published: {
        label: 'Опубликован',
        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    archived: {
        label: 'В архиве',
        color: 'bg-gray-200 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    },
}

const Templates = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('documents', 'read')
    const canManage = can('documents', 'manage')

    const [busyId, setBusyId] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(null)
    const [deleting, setDeleting] = useState(false)

    const swrKey = pid && canRead ? ['/document-templates', pid] : null
    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        () => apiListTemplates({ projectId: pid! }),
        { revalidateOnFocus: false },
    )

    const templates = data?.items ?? []

    const handlePublish = async (t: TemplateSummary) => {
        if (!pid) return
        setBusyId(t.id)
        try {
            await apiPublishTemplate(t.id, { projectId: pid })
            toast.push('Шаблон опубликован')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось опубликовать шаблон'))
        } finally {
            setBusyId(null)
        }
    }

    // EL-TPL-10 (G4): скачать исходный DOCX текущей ревизии. Ручка отдаёт
    // короткоживущий presigned URL — открываем его новой вкладкой, браузер качает.
    const handleDownload = async (t: TemplateSummary) => {
        if (!pid) return
        try {
            const { url } = await apiDownloadTemplate(t.id, { projectId: pid })
            window.open(url, '_blank', 'noopener')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось скачать шаблон'))
        }
    }

    const handleArchive = async (t: TemplateSummary) => {
        if (!pid) return
        setBusyId(t.id)
        try {
            await apiArchiveTemplate(t.id, { projectId: pid })
            toast.push('Шаблон архивирован')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось архивировать шаблон'))
        } finally {
            setBusyId(null)
        }
    }

    // EL-TPL-13 (FR-DOCS-370): мягкое удаление шаблона. Ручка
    // DELETE /v1/document-templates/:id гейтится `documents:manage` — тем же правом,
    // что и кнопка. Ревизии и уже выпущенные документы на сервере сохраняются.
    const confirmDelete = async () => {
        if (!deleteTarget || !pid) return
        setDeleting(true)
        try {
            await apiDeleteTemplate(deleteTarget.id, { projectId: pid })
            toast.push('Шаблон удалён')
            setDeleteTarget(null)
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить шаблон'))
        } finally {
            setDeleting(false)
        }
    }

    // ── ST-10: нет права ──
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права documents:read." />
            </Container>
        )
    }

    const renderBody = () => {
        // ST-1
        if (isLoading) {
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} height={180} className="rounded-lg" />
                    ))}
                </div>
            )
        }
        // ST-6
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить шаблоны')}
                    onRetry={() => mutate()}
                />
            )
        }
        // ST-3
        if (templates.length === 0) {
            return (
                <AdaptiveCard>
                    <div className="py-10 max-w-xl mx-auto" {...qa('documents.templates.empty')}>
                        <div className="text-center">
                            <PiFileDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            {canManage ? (
                                <p className="text-gray-500 mb-6">
                                    Нет шаблонов документов. Настройте первый шаблон за 3 шага:
                                </p>
                            ) : (
                                <p className="text-gray-500 mb-6">
                                    Шаблоны ещё не настроены, обратитесь к администратору. Как это
                                    работает:
                                </p>
                            )}
                        </div>
                        <DocumentsHowTo />
                        {canManage && (
                            <div className="text-center mt-6">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    icon={<PiPlusDuotone />}
                                    {...qa('documents.templates.emptyCreate')}
                                    onClick={() => navigate('/documents/templates/new')}
                                >
                                    Создать шаблон
                                </Button>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>
            )
        }
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" {...qa('documents.templates.grid')}>
                {templates.map((t) => {
                    const status = statusMeta[t.status]
                    const busy = busyId === t.id
                    return (
                        <Card key={t.id} {...qa('documents.templates.card', { template: t.id })}>
                            <div className="flex items-start justify-between mb-3">
                                <div
                                    className="flex items-center gap-2 cursor-pointer"
                                    onClick={() =>
                                        canManage &&
                                        navigate(`/documents/templates/${t.id}/edit`)
                                    }
                                >
                                    <PiFileDuotone className="w-5 h-5 text-gray-400" />
                                    <h5 className="font-semibold heading-text">{t.name}</h5>
                                </div>
                                <Tag className={status.color}>{status.label}</Tag>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-3">
                                <Tag className={contextColors[t.contextType] || ''}>
                                    {CONTEXT_LABELS[t.contextType]}
                                </Tag>
                                {t.orderTypeId && (
                                    <Tag className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                        {t.orderTypeId}
                                    </Tag>
                                )}
                            </div>

                            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-4">
                                <div>
                                    Редакция:{' '}
                                    {t.currentRevision != null
                                        ? `v${t.currentRevision} (опубл.)`
                                        : t.draftRevision != null
                                          ? `черновик v${t.draftRevision}`
                                          : '—'}
                                </div>
                                {t.documentsCreated != null && (
                                    <div>{t.documentsCreated} документов создано</div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2 pt-3 border-t">
                                {/* EL-TPL-9: manage */}
                                {canManage && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        icon={<PiPencilDuotone />}
                                        {...qa('documents.templates.edit', { template: t.id })}
                                        onClick={() =>
                                            navigate(`/documents/templates/${t.id}/edit`)
                                        }
                                    >
                                        Редактировать
                                    </Button>
                                )}
                                {/* EL-TPL-11: publish для draft */}
                                {canManage && t.draftRevision != null && (
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        color="primary"
                                        loading={busy}
                                        icon={<PiUploadSimpleDuotone />}
                                        {...qa('documents.templates.publish', { template: t.id })}
                                        onClick={() => handlePublish(t)}
                                    >
                                        Опубликовать
                                    </Button>
                                )}
                                {/* EL-TPL-12: archive для published */}
                                {canManage && t.status === 'published' && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        loading={busy}
                                        icon={<PiArchiveDuotone />}
                                        {...qa('documents.templates.archive', { template: t.id })}
                                        onClick={() => handleArchive(t)}
                                    >
                                        Архивировать
                                    </Button>
                                )}
                                {/* EL-TPL-10: скачать (read) */}
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiDownloadDuotone />}
                                    {...qa('documents.templates.download', { template: t.id })}
                                    onClick={() => handleDownload(t)}
                                >
                                    Скачать
                                </Button>
                                {/* EL-TPL-13: удалить (manage) — то же правo, что и на сервере */}
                                {canManage && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        className="text-red-500"
                                        icon={<PiTrashDuotone />}
                                        disabled={busy}
                                        {...qa('documents.templates.delete', { template: t.id })}
                                        onClick={() => setDeleteTarget(t)}
                                    >
                                        Удалить
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )
                })}
            </div>
        )
    }

    return (
        <Container {...qa('documents.templates.root')}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold">Шаблоны документов</h3>
                    {/* EL-TPL-2: ST-11 скрыта без manage */}
                    {canManage && (
                        <Button
                            variant="solid"
                            color="primary"
                            icon={<PiPlusDuotone />}
                            {...qa('documents.templates.new')}
                            onClick={() => navigate('/documents/templates/new')}
                        >
                            Новый шаблон
                        </Button>
                    )}
                </div>
                {renderBody()}
            </div>

            {/* ST-7: подтверждение удаления шаблона */}
            <Dialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                {...qa('documents.templates.deleteDialog')}
            >
                <h5 className="mb-2">Удалить шаблон?</h5>
                <p className="text-sm text-gray-500 mb-6">
                    Шаблон «{deleteTarget?.name}» будет удалён, новые документы по нему
                    выпускать станет нельзя. Ранее выпущенные документы и их версии
                    сохраняются.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => setDeleteTarget(null)}
                        {...qa('documents.templates.deleteCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        loading={deleting}
                        {...qa('documents.templates.deleteConfirm')}
                        onClick={confirmDelete}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default Templates
