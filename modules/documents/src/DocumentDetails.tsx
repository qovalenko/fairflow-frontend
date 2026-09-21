import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiDownloadDuotone,
    PiTrashDuotone,
    PiWarningDuotone,
    PiFileDuotone,
    PiClockCounterClockwiseDuotone,
    PiArrowsClockwiseDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import {
    apiGetDocument,
    apiCheckDrift,
    apiDeleteDocument,
    apiDownloadVersion,
    contextRecordRoute,
    CONTEXT_LABELS,
    GENERATED_VIA_LABELS,
    mimeShort,
    formatBytes,
    type DocumentVersion,
} from '@/services/DocumentsService'
import GenerateDialog from '@/components/shared/documents/GenerateDialog'
import { isPdfMime } from './documentPreview'
import { NoPermissionState, ErrorState, errMessage, httpStatus } from '@/components/shared/documents/shared'
import { qa } from './qa'

const DocumentDetails = () => {
    const { id: groupId } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate: globalMutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('documents', 'read')
    const canGenerate = can('documents.generate', 'execute')
    const canDelete = can('documents', 'delete')

    const [regenOpen, setRegenOpen] = useState(false)
    const [downloadingId, setDownloadingId] = useState<string | null>(null)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const swrKey =
        pid && groupId && canRead ? ['/documents', pid, groupId] : null

    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        async () => {
            const doc = await apiGetDocument(groupId!, { projectId: pid! })
            try {
                const drift = await apiCheckDrift(groupId!, { projectId: pid! })
                return { ...doc, drift }
            } catch {
                return doc
            }
        },
        { revalidateOnFocus: false },
    )

    const previewVersionId =
        data?.versions.find((v) => v.version === data.group.currentVersion)?.versionId ??
        data?.versions[0]?.versionId
    const previewMime =
        data?.versions.find((v) => v.version === data.group.currentVersion)?.mimeType ??
        data?.versions[0]?.mimeType
    const isPdfPreview = isPdfMime(previewMime)
    const previewSwrKey =
        pid && previewVersionId && isPdfPreview && canRead
            ? ['/documents/preview', pid, previewVersionId]
            : null
    const { data: previewData, isLoading: previewLoading } = useSWR(
        previewSwrKey,
        () => apiDownloadVersion(previewVersionId!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const previewUrl = previewData?.url ?? null

    // Ручка отдаёт JSON с presigned URL и требует Authorization, поэтому идём
    // через axios (apiDownloadVersion) и открываем уже полученный url — прямой
    // window.open на саму ручку давал 401/сырой JSON вместо файла.
    const handleDownload = async (versionId?: string) => {
        if (!pid) return
        const vId =
            versionId ??
            data?.versions.find((v) => v.version === data.group.currentVersion)
                ?.versionId ??
            data?.versions[0]?.versionId
        if (!vId) {
            toast.push('Нет доступной версии для скачивания')
            return
        }
        setDownloadingId(vId)
        try {
            const { url } = await apiDownloadVersion(vId, { projectId: pid })
            window.open(url, '_blank', 'noopener')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось скачать документ'))
        } finally {
            setDownloadingId(null)
        }
    }

    const confirmDelete = async () => {
        if (!groupId || !pid) return
        setDeleting(true)
        try {
            await apiDeleteDocument(groupId, { projectId: pid })
            toast.push('Документ удалён')
            setDeleteOpen(false)
            globalMutate((key) => Array.isArray(key) && key[0] === '/documents')
            navigate('/documents')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить документ'))
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

    // ── ST-1: первичная загрузка ──
    if (isLoading) {
        return (
            <Container>
                <div className="flex flex-col gap-4" {...qa('documents.detail.skeleton')}>
                    <Skeleton height={40} className="w-1/2 rounded-lg" />
                    <Skeleton height={120} className="rounded-lg" />
                    <Skeleton height={180} className="rounded-lg" />
                </div>
            </Container>
        )
    }

    // ── ST-9: not found / чужой проект / удалён ──
    if (error && httpStatus(error) === 404) {
        return (
            <Container>
                <div className="text-center py-16" {...qa('documents.detail.notFound')}>
                    <PiFileDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Документ не найден</p>
                    <p className="text-sm text-gray-400 mt-1">
                        Возможно, он удалён или относится к другому проекту.
                    </p>
                    <Button
                        size="sm"
                        variant="solid"
                        className="mt-4"
                        {...qa('documents.detail.backToList')}
                        onClick={() => navigate('/documents')}
                    >
                        ← К списку документов
                    </Button>
                </div>
            </Container>
        )
    }

    // ── ST-6: прочие ошибки загрузки ──
    if (error || !data) {
        return (
            <Container>
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить документ')}
                    onRetry={() => mutate()}
                />
            </Container>
        )
    }

    const { group, versions, drift } = data
    const fileType = mimeShort(versions[0]?.mimeType)
    const isGenerated = group.generatedVia !== 'upload'
    const entityRoute = contextRecordRoute(group.contextType, group.contextRecordId)
    const currentVer = versions.find((v) => v.version === group.currentVersion) ?? versions[0]

    return (
        <Container {...qa('documents.detail.root')}>
            <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <button
                        {...qa('documents.detail.back')}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => navigate('/documents')}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold">{group.name}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {fileType}
                            </Tag>
                            <Tag
                                className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                {...qa('documents.detail.generatedTag')}
                            >
                                {isGenerated ? 'Сгенерирован' : 'Загружен'}
                            </Tag>
                            <span className="text-sm text-gray-500">v{group.currentVersion}</span>
                            {currentVer && (
                                <span className="text-sm text-gray-500">
                                    {formatBytes(currentVer.sizeBytes)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="solid"
                            color="primary"
                            size="sm"
                            icon={<PiDownloadDuotone />}
                            loading={downloadingId === currentVer?.versionId}
                            {...qa('documents.detail.download')}
                            onClick={() => handleDownload()}
                        >
                            Скачать
                        </Button>
                        {/* ST-11: «Перегенерировать» скрыта без generate; ST-12 disabled при недоступном источнике */}
                        {canGenerate && isGenerated && (
                            <Button
                                variant="default"
                                size="sm"
                                icon={<PiArrowsClockwiseDuotone />}
                                disabled={!drift.sourceAvailable}
                                {...qa('documents.detail.regenerate')}
                                onClick={() => setRegenOpen(true)}
                            >
                                Перегенерировать
                            </Button>
                        )}
                        {canDelete && (
                            <Button
                                variant="solid"
                                color="red"
                                size="sm"
                                icon={<PiTrashDuotone />}
                                {...qa('documents.detail.delete')}
                                onClick={() => setDeleteOpen(true)}
                            >
                                Удалить
                            </Button>
                        )}
                    </div>
                </div>

                {/* ST-25: Drift-баннер «было → стало» */}
                {drift.hasDrift && (
                    <div
                        className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                        {...qa('documents.detail.driftBanner')}
                    >
                        <PiWarningDuotone className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-amber-800 dark:text-amber-200">
                                Реквизиты изменились с момента генерации
                            </div>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                {drift.changedValues && drift.changedValues.length > 0 ? (
                                    <span className="flex flex-col gap-1">
                                        {drift.changedValues.map((change) => (
                                            <span key={change.key}>
                                                <span className="font-medium">{change.key}</span>:{' '}
                                                {change.oldValue || '—'} → {change.newValue || '—'}
                                            </span>
                                        ))}
                                    </span>
                                ) : (
                                    <>
                                        Изменились поля:{' '}
                                        <span className="font-medium">
                                            {drift.changedKeys.join(', ') || 'неизвестно'}
                                        </span>
                                    </>
                                )}
                                . Рекомендуется перегенерировать документ.
                            </p>
                            {canGenerate && drift.sourceAvailable && (
                                <Button
                                    size="xs"
                                    variant="solid"
                                    color="primary"
                                    className="mt-2"
                                    {...qa('documents.detail.driftRegenerate')}
                                    onClick={() => setRegenOpen(true)}
                                    {...qa('documents.detail.driftRegenerate')}
                                >
                                    Перегенерировать
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {/* empty_required — стойкий индикатор незаполненных обязательных полей
                    текущей версии (BX-DOCS-6, §2.7/G6): раньше показывался только тостом. */}
                {currentVer && currentVer.emptyRequiredVars.length > 0 && (
                    <div
                        className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                        {...qa('documents.detail.emptyRequiredBanner')}
                    >
                        <PiWarningDuotone className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-red-800 dark:text-red-200">
                                Не заполнены обязательные поля
                            </div>
                            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                В документе остались пустыми:{' '}
                                <span className="font-medium">
                                    {currentVer.emptyRequiredVars.join(', ')}
                                </span>
                                . Заполните значения в записи-источнике и перегенерируйте документ.
                            </p>
                        </div>
                    </div>
                )}

                {/* ST-12: источник недоступен */}
                {!drift.sourceAvailable && (
                    <div
                        className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300"
                        {...qa('documents.detail.sourceUnavailable')}
                    >
                        <PiWarningDuotone className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        Источник данных недоступен (запись-контекст удалена или модуль выключен) —
                        перегенерация недоступна.
                    </div>
                )}

                {/* Информация */}
                <AdaptiveCard {...qa('documents.detail.info')}>
                    <h5 className="mb-4">Информация</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-gray-500">Сущность:</span>
                            {entityRoute ? (
                                <span
                                    className="ml-2 font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                                    {...qa('documents.detail.entityLink')}
                                    onClick={() => navigate(entityRoute)}
                                >
                                    {CONTEXT_LABELS[group.contextType]}: {group.contextRecordId}
                                </span>
                            ) : (
                                <span className="ml-2 text-gray-400">Без привязки</span>
                            )}
                        </div>
                        <div>
                            <span className="text-gray-500">Автор:</span>
                            <span className="ml-2 font-medium">{group.ownerId}</span>
                        </div>
                        <div>
                            <span className="text-gray-500">Создан:</span>
                            <span className="ml-2">
                                {dayjs(group.createdAt).format('DD.MM.YYYY HH:mm')}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-500">Обновлён:</span>
                            <span className="ml-2">
                                {dayjs(group.updatedAt).format('DD.MM.YYYY HH:mm')}
                            </span>
                        </div>
                        {group.templateId && (
                            <div>
                                <span className="text-gray-500">Шаблон:</span>
                                <span
                                    className="ml-2 font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                                    {...qa('documents.detail.templateLink')}
                                    onClick={() =>
                                        navigate(`/documents/templates/${group.templateId}/edit`)
                                    }
                                >
                                    {group.templateId}
                                    {currentVer?.templateRevision != null
                                        ? ` (ред. ${currentVer.templateRevision})`
                                        : ''}
                                </span>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                {/* Версии (только сгенерированные) */}
                {isGenerated && versions.length > 0 && (
                    <AdaptiveCard {...qa('documents.detail.versions')}>
                        <h5 className="mb-4">Версии</h5>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 font-semibold">Версия</th>
                                        <th className="text-left py-2 font-semibold">Дата</th>
                                        <th className="text-left py-2 font-semibold">Автор</th>
                                        <th className="text-left py-2 font-semibold">Способ</th>
                                        <th className="text-left py-2 font-semibold">Размер</th>
                                        <th className="w-12" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {versions.map((v: DocumentVersion) => (
                                        <tr key={v.versionId} className="border-b last:border-0">
                                            <td className="py-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Tag
                                                        className={
                                                            v.version === group.currentVersion
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                                        }
                                                    >
                                                        v{v.version}
                                                    </Tag>
                                                    {v.emptyRequiredVars.length > 0 && (
                                                        <Tooltip
                                                            title={`Не заполнены поля: ${v.emptyRequiredVars.join(', ')}`}
                                                        >
                                                            <PiWarningDuotone className="w-4 h-4 text-red-500" />
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2">
                                                {dayjs(v.createdAt).format('DD.MM.YYYY HH:mm')}
                                            </td>
                                            <td className="py-2">{v.generatedBy}</td>
                                            <td className="py-2 text-gray-600 dark:text-gray-400">
                                                {GENERATED_VIA_LABELS[v.generatedVia]}
                                            </td>
                                            <td className="py-2 text-gray-500">
                                                {formatBytes(v.sizeBytes)}
                                            </td>
                                            <td className="py-2">
                                                <button
                                                    type="button"
                                                    {...qa('documents.detail.versionDownload', {
                                                        version: v.versionId,
                                                    })}
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                                                    disabled={downloadingId === v.versionId}
                                                    onClick={() => handleDownload(v.versionId)}
                                                >
                                                    <PiDownloadDuotone className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </AdaptiveCard>
                )}

                {/* TODO-396: inline PDF preview через presigned URL */}
                <AdaptiveCard {...qa('documents.detail.preview')}>
                    <h5 className="mb-4">Предпросмотр</h5>
                    {isPdfPreview ? (
                        previewLoading ? (
                            <Skeleton height={480} className="rounded-lg" />
                        ) : previewUrl ? (
                            <iframe
                                title={`Предпросмотр ${group.name}`}
                                src={previewUrl}
                                className="h-[70vh] w-full rounded-lg border border-gray-200 dark:border-gray-700"
                                {...qa('documents.detail.pdfPreview')}
                            />
                        ) : (
                            <div className="flex items-center justify-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                                <p className="text-gray-500">Не удалось загрузить предпросмотр</p>
                            </div>
                        )
                    ) : (
                        <div className="flex items-center justify-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                            <div className="text-center" {...qa('documents.detail.previewPlaceholder')}>
                                <PiFileDuotone className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500">Скачайте для просмотра</p>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    color="primary"
                                    className="mt-3"
                                    icon={<PiDownloadDuotone />}
                                    loading={downloadingId === currentVer?.versionId}
                                    {...qa('documents.detail.previewDownload')}
                                    onClick={() => handleDownload()}
                                >
                                    Скачать файл
                                </Button>
                            </div>
                        </div>
                    )}
                </AdaptiveCard>

                {/* История (по версиям — таймлайн document.*) */}
                <AdaptiveCard>
                    <h5 className="mb-4 flex items-center gap-2">
                        <PiClockCounterClockwiseDuotone className="w-5 h-5" />
                        История
                    </h5>
                    <div className="space-y-3">
                        {versions.map((v) => (
                            <div key={v.versionId} className="flex items-start gap-3 text-sm">
                                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="text-gray-600 dark:text-gray-400">
                                        Версия v{v.version} — {GENERATED_VIA_LABELS[v.generatedVia]}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {v.generatedBy} ·{' '}
                                        {dayjs(v.createdAt).format('DD.MM.YYYY HH:mm')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </AdaptiveCard>
            </div>

            {/* GENERATE-DIALOG в режиме перегенерации */}
            {pid && groupId && (
                <GenerateDialog
                    isOpen={regenOpen}
                    onClose={() => setRegenOpen(false)}
                    projectId={pid}
                    regenerateGroupId={groupId}
                    driftChangedKeys={drift.changedKeys}
                    expectedVersion={group.currentVersion}
                    onDone={() => mutate()}
                />
            )}

            {/* ST-7 confirm удаления */}
            <Dialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                onRequestClose={() => setDeleteOpen(false)}
                {...qa('documents.detail.deleteDialog')}
            >
                <h5 className="mb-2">Удалить документ?</h5>
                <p className="text-sm text-gray-500 mb-6">
                    Документ «{group.name}» будет перемещён в корзину.
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => setDeleteOpen(false)}
                        {...qa('documents.detail.deleteCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        loading={deleting}
                        {...qa('documents.detail.deleteConfirm')}
                        onClick={confirmDelete}
                    >
                        Удалить
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default DocumentDetails
