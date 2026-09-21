import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiPlusDuotone, PiPencilDuotone, PiTrashDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetPipelines, apiDeletePipeline } from '@/services/CrmService'
import type { Pipeline } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from '../Deals/dealUtils'
import { qa } from '../qa'

/**
 * SCR-DEALS-PIPELINES — list of project pipelines.
 * Read = `deals:read`; create/edit/delete = `deals:manage` (FR-MDEAL-20).
 */
const PipelineList = () => {
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('deals', 'manage')

    const { data, isLoading, error, mutate } = useSWR(
        ['/api/v1/pipelines'],
        () => apiGetPipelines<Pipeline[] | { list: Pipeline[] }>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const pipelines: Pipeline[] = Array.isArray(data)
        ? data
        : (data as { list?: Pipeline[] })?.list ?? []

    const handleDelete = async (e: React.MouseEvent, pipeline: Pipeline) => {
        e.stopPropagation()
        if (!window.confirm(`Удалить воронку «${pipeline.name}»?`)) return
        try {
            await apiDeletePipeline(pipeline.id)
            notifySuccess('Воронка удалена')
            mutate()
        } catch (err) {
            // 409 FAILED_PRECONDITION — stage/pipeline has active deals (FR-MDEAL-21).
            notifyError(extractError(err, 'Не удалось удалить воронку'))
        }
    }

    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    if (error) {
        return (
            <Container>
                <div className="text-center py-10">
                    <p className="text-gray-500">Не удалось загрузить воронки</p>
                    <Button variant="solid" color="primary" className="mt-4" onClick={() => mutate()}>
                        Повторить
                    </Button>
                </div>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4" {...qa('deals.pipelines.root')}>
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Воронки</h2>
                    {canManage && (
                        <Button
                            variant="solid"
                            icon={<PiPlusDuotone />}
                            onClick={() => navigate(`/deals/pipelines/new`)}
                            {...qa('deals.pipelines.create')}
                        >
                            Создать воронку
                        </Button>
                    )}
                </div>

                {pipelines.length === 0 ? (
                    <div className="text-center py-10">
                        <p className="text-gray-500 mb-1">Воронок пока нет</p>
                        {canManage && (
                            <Button
                                variant="solid"
                                color="primary"
                                className="mt-3"
                                icon={<PiPlusDuotone />}
                                onClick={() => navigate(`/deals/pipelines/new`)}
                            >
                                Создать первую
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {pipelines.map((pipeline) => (
                            <AdaptiveCard
                                key={pipeline.id}
                                className={
                                    canManage
                                        ? 'cursor-pointer hover:shadow-md transition-shadow'
                                        : ''
                                }
                                onClick={
                                    canManage
                                        ? () => navigate(`/deals/pipelines/${pipeline.id}/edit`)
                                        : undefined
                                }
                                {...qa('deals.pipelines.card', { pipeline: pipeline.id })}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <h5 className="font-semibold">{pipeline.name}</h5>
                                    <div className="flex gap-1 items-center">
                                        {pipeline.isDefault && (
                                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs">
                                                По умолчанию
                                            </Tag>
                                        )}
                                        {canManage && (
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                icon={<PiPencilDuotone />}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    navigate(`/deals/pipelines/${pipeline.id}/edit`)
                                                }}
                                                {...qa('deals.pipelines.edit', { pipeline: pipeline.id })}
                                            />
                                        )}
                                        {canManage && !pipeline.isDefault && (
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                className="text-red-500"
                                                icon={<PiTrashDuotone />}
                                                onClick={(e) => handleDelete(e, pipeline)}
                                                {...qa('deals.pipelines.delete', { pipeline: pipeline.id })}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 flex-wrap mb-2" {...qa('deals.pipelines.stages', { pipeline: pipeline.id })}>
                                    {pipeline.stages.map((stage) => (
                                        <span
                                            key={stage.id}
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: stage.color }}
                                            title={stage.name}
                                            {...qa('deals.pipelines.stageDot', { pipeline: pipeline.id, stage: stage.id })}
                                        />
                                    ))}
                                </div>
                                <p className="text-sm text-gray-500">
                                    Стадий: {pipeline.stages.length}
                                </p>
                            </AdaptiveCard>
                        ))}
                    </div>
                )}
            </div>
        </Container>
    )
}

export default PipelineList
