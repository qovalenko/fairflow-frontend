import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiFileDuotone,
    PiDownloadDuotone,
    PiSparkleDuotone,
    PiUploadDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiListDocuments,
    apiUploadDocument,
    GENERATED_VIA_BADGE,
    type DocContextType,
} from '@/services/DocumentsService'
import GenerateDialog from './GenerateDialog'
import { errMessage } from './shared'
import { qa } from '@/shared/qa'

/**
 * SCR-DOCUMENTS-TAB — врезка «Документы» в карточку записи (слот `<entity>.card.tab`).
 * Host передаёт context: { contextType, recordId } (или dealId/orderId/...).
 */
interface DocumentsTabProps {
    contextType?: DocContextType
    recordId?: string
    // host может прокинуть конкретные id-поля
    dealId?: string
    orderId?: string
    contactId?: string
    companyId?: string
}

function resolveContext(props: DocumentsTabProps): {
    contextType?: DocContextType
    recordId?: string
} {
    if (props.contextType && props.recordId)
        return { contextType: props.contextType, recordId: props.recordId }
    if (props.dealId) return { contextType: 'deal', recordId: props.dealId }
    if (props.orderId) return { contextType: 'order', recordId: props.orderId }
    if (props.contactId) return { contextType: 'contact', recordId: props.contactId }
    if (props.companyId) return { contextType: 'company', recordId: props.companyId }
    return {}
}

const DocumentsTab = (props: DocumentsTabProps) => {
    const { contextType, recordId } = resolveContext(props)
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate: globalMutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('documents', 'read')
    const canGenerate = can('documents.generate', 'execute')

    const [genOpen, setGenOpen] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const swrKey =
        pid && recordId && contextType && canRead
            ? ['/documents', pid, { contextType, recordId }]
            : null
    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        () =>
            apiListDocuments({
                projectId: pid!,
                contextType,
                recordId,
                pageSize: 100,
            }),
        { revalidateOnFocus: false },
    )

    if (!canRead) {
        return (
            <p className="text-sm text-gray-400 py-4" {...qa('documents.tab.noPermission')}>
                Нет прав на просмотр документов.
            </p>
        )
    }
    if (!contextType || !recordId) {
        return <p className="text-sm text-gray-400 py-4">Контекст записи не определён.</p>
    }

    const docs = data?.list ?? []

    const handleUpload = async (file: File) => {
        if (!pid) return
        const form = new FormData()
        form.append('file', file)
        form.append('name', file.name)
        form.append('contextType', contextType)
        form.append('recordId', recordId)
        try {
            await apiUploadDocument(form, { projectId: pid })
            toast.push('Документ загружён')
            mutate()
            globalMutate((key) => Array.isArray(key) && key[0] === '/documents')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось загрузить документ'))
        }
    }

    return (
        <div className="flex flex-col gap-3" {...qa('documents.tab.root')}>
            <input
                ref={fileInputRef}
                type="file"
                {...qa('documents.tab.uploadInput')}
                aria-label="Загрузить документ к записи"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.target.value = ''
                }}
            />
            <div className="flex items-center justify-between">
                <h6 className="font-semibold">Документы</h6>
                {canGenerate && (
                    <div className="flex gap-2">
                        <Button
                            size="xs"
                            variant="default"
                            icon={<PiUploadDuotone />}
                            {...qa('documents.tab.upload')}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            Загрузить
                        </Button>
                        <Button
                            size="xs"
                            variant="solid"
                            color="primary"
                            icon={<PiSparkleDuotone />}
                            {...qa('documents.tab.generate')}
                            onClick={() => setGenOpen(true)}
                        >
                            Сгенерировать
                        </Button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} height={36} className="rounded-lg" />
                    ))}
                </div>
            ) : error ? (
                <p className="text-sm text-red-500 py-2" {...qa('documents.tab.error')}>
                    {errMessage(error, 'Не удалось загрузить документы')}
                </p>
            ) : docs.length === 0 ? (
                <div className="text-center py-8" {...qa('documents.tab.empty')}>
                    <PiFileDuotone className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">По этой записи документов пока нет.</p>
                </div>
            ) : (
                <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
                    {docs.map((d) => (
                        <div
                            key={d.groupId}
                            {...qa('documents.tab.row', { group: d.groupId })}
                            className="flex items-center gap-3 py-2.5"
                        >
                            <PiFileDuotone className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div
                                className="flex-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                onClick={() => navigate(`/documents/${d.groupId}`)}
                            >
                                <div className="text-sm font-medium flex items-center gap-2">
                                    {d.name}
                                    {d.driftStale && (
                                        <PiWarningDuotone
                                            className="w-4 h-4 text-amber-500"
                                            {...qa('documents.tab.drift', { group: d.groupId })}
                                        />
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">
                                    v{d.currentVersion} ·{' '}
                                    {dayjs(d.createdAt).format('DD.MM.YYYY')}
                                </div>
                            </div>
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {GENERATED_VIA_BADGE[d.generatedVia]}
                            </Tag>
                            <button
                                type="button"
                                {...qa('documents.tab.open', { group: d.groupId })}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                onClick={() => navigate(`/documents/${d.groupId}`)}
                            >
                                <PiDownloadDuotone className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {pid && (
                <GenerateDialog
                    isOpen={genOpen}
                    onClose={() => setGenOpen(false)}
                    projectId={pid}
                    contextType={contextType}
                    recordId={recordId}
                    onDone={() => mutate()}
                />
            )}
        </div>
    )
}

export default DocumentsTab
