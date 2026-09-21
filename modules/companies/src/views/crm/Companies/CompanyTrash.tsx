import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR, { useSWRConfig } from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiArrowCounterClockwiseDuotone,
    PiWarningCircleDuotone,
    PiTrashDuotone,
    PiMagnifyingGlassDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Dialog from '@/components/ui/Dialog'
import toast from '@/components/ui/toast'
import type { ColumnDef } from '@/components/shared/DataTable'
import type { Company } from '@/@types/crm'
import { apiGetCompaniesTrash, apiRestoreCompany, apiPurgeCompany } from '@/services/CrmService'
import RestoreCollisionDialog, {
    parseRestoreCollision,
    type RestoreCollision,
    type RestoreStrategy,
} from './RestoreCollisionDialog'
import { qa, QA_IDS_ENABLED } from '../../../qa'

const CompanyTrash = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const { mutate } = useSWRConfig()
    const can = usePermission()
    const canRead = can('companies', 'read')
    const canWrite = can('companies', 'write')
    const canDelete = can('companies', 'delete')

    const [query, setQuery] = useState('')
    const [pageIndex, setPageIndex] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [purgeTarget, setPurgeTarget] = useState<Company | null>(null)
    const [purging, setPurging] = useState(false)
    const [collision, setCollision] = useState<
        (RestoreCollision & { company: Company }) | null
    >(null)
    const [chosenStrategy, setChosenStrategy] = useState<RestoreStrategy | null>(null)

    const swrKey =
        pid && canRead ? ['/v1/companies/trash', pid, { query, pageIndex, pageSize }] : null

    const { data, isLoading, error } = useSWR(
        swrKey,
        () =>
            apiGetCompaniesTrash<{ list: Company[]; total: number }, Record<string, unknown>>({
                projectId: pid!,
                query,
                pageIndex: pageIndex - 1,
                pageSize,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false }
    )

    const list = data?.list ?? []
    const total = data?.total ?? 0

    const handleRestore = async (company: Company, strategy?: RestoreStrategy) => {
        setRestoringId(company.id)
        try {
            await apiRestoreCompany<Company>(
                company.id,
                strategy ? { strategy } : undefined,
                { projectId: pid },
            )
            setCollision(null)
            toast.push(
                strategy === 'merge'
                    ? `«${company.name}» объединена с активным дублем`
                    : `«${company.name}» восстановлена`,
            )
            mutate(swrKey)
            mutate((key) => Array.isArray(key) && key[0] === '/v1/companies', undefined, { revalidate: true })
        } catch (e) {
            // Коллизия ключа идентичности → домен присылает список стратегий;
            // раньше показывался только toast и восстановление было тупиком.
            const conflict = parseRestoreCollision(e)
            if (conflict) {
                setCollision({ ...conflict, company })
                setChosenStrategy(conflict.options[0] ?? null)
            } else {
                const err = e as { response?: { data?: { error?: { message?: string } } } }
                toast.push(err?.response?.data?.error?.message ?? 'Не удалось восстановить')
            }
        } finally {
            setRestoringId(null)
        }
    }

    const handlePurge = async () => {
        if (!purgeTarget) return
        setPurging(true)
        try {
            await apiPurgeCompany<{ ok?: boolean }>(purgeTarget.id, { projectId: pid })
            toast.push(`«${purgeTarget.name}» удалена навсегда`)
            setPurgeTarget(null)
            mutate(swrKey)
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            toast.push(err?.response?.data?.error?.message ?? 'Не удалось удалить навсегда')
        } finally {
            setPurging(false)
        }
    }

    const columns: ColumnDef<Company>[] = [
        {
            id: 'name',
            header: 'Название',
            accessorKey: 'name',
            cell: ({ row }) => (
                <span {...qa('companies.trash.row', { company: row.original.id })}>
                    {row.original.name}
                </span>
            ),
        },
        { id: 'inn', header: 'ИНН', accessorKey: 'inn', cell: ({ row }) => <span>{row.original.inn || '-'}</span> },
        {
            id: 'deletedAt',
            header: 'Удалена',
            accessorKey: 'deletedAt',
            cell: ({ row }) => (
                <span>
                    {row.original.deletedAt
                        ? dayjs.unix(row.original.deletedAt).format('DD.MM.YYYY HH:mm')
                        : '-'}
                </span>
            ),
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <div className="flex items-center justify-end gap-1">
                    {canWrite && (
                        <Button
                            variant="plain"
                            size="sm"
                            icon={<PiArrowCounterClockwiseDuotone />}
                            loading={restoringId === row.original.id}
                            onClick={() => handleRestore(row.original)}
                            {...qa('companies.trash.restore', { company: row.original.id })}
                        >
                            Восстановить
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            variant="plain"
                            size="sm"
                            className="text-red-500"
                            icon={<PiTrashDuotone />}
                            onClick={() => setPurgeTarget(row.original)}
                            {...qa('companies.trash.purge', { company: row.original.id })}
                        >
                            Удалить навсегда
                        </Button>
                    )}
                </div>
            ),
        },
    ]

    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.trash.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Раздел недоступен</h4>
                        <p className="text-gray-500">У вас нет доступа к корзине компаний.</p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <Link to="/companies" {...qa('companies.trash.back')}>
                            <button
                                type="button"
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                title="К списку"
                            >
                                <PiArrowLeftDuotone className="w-5 h-5" />
                            </button>
                        </Link>
                        <h3>Корзина компаний</h3>
                    </div>

                    <div className="max-w-sm">
                        <Input
                            placeholder="Поиск в корзине..."
                            prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value)
                                setPageIndex(1)
                            }}
                            {...qa('companies.trash.search')}
                        />
                    </div>

                    {error ? (
                        <div
                            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                            {...qa('companies.trash.error')}
                        >
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-500">Не удалось загрузить корзину</p>
                            <Button
                                variant="solid"
                                size="sm"
                                onClick={() => mutate(swrKey)}
                                {...qa('companies.trash.retry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : !isLoading && list.length === 0 ? (
                        <div
                            className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                            {...qa('companies.trash.empty')}
                        >
                            <PiTrashDuotone className="w-12 h-12 text-gray-300" />
                            <h5>Корзина пуста</h5>
                            <p className="text-gray-500">Удалённые компании появятся здесь и могут быть восстановлены.</p>
                        </div>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={list}
                            loading={isLoading}
                            qaScope={QA_IDS_ENABLED ? 'companies.trash' : undefined}
                            pagingData={{ total, pageIndex, pageSize }}
                            onPaginationChange={setPageIndex}
                            onSelectChange={(size) => {
                                setPageSize(size)
                                setPageIndex(1)
                            }}
                            onRowClick={(company) => navigate(`/companies/${company.id}`)}
                        />
                    )}
                </div>
            </AdaptiveCard>

            {/* DLG: коллизия ключа идентичности при восстановлении (company.md §3.11).
                Домен возвращает FAILED_PRECONDITION + details.options; пользователь
                выбирает стратегию, и запрос повторяется с ней. */}
            <RestoreCollisionDialog
                isOpen={!!collision}
                companyName={collision?.company.name}
                collision={collision}
                value={chosenStrategy}
                submitting={!!restoringId}
                onChange={setChosenStrategy}
                onConfirm={() => {
                    if (collision && chosenStrategy) {
                        void handleRestore(collision.company, chosenStrategy)
                    }
                }}
                onClose={() => setCollision(null)}
            />

            {/* DLG: hard-delete (purge) — EL-TRASH-4, FR-MCOM-2 */}
            <Dialog
                isOpen={!!purgeTarget}
                onClose={() => setPurgeTarget(null)}
                onRequestClose={() => setPurgeTarget(null)}
            >
                <h5 className="mb-2" {...qa('companies.trash.purgeDialog')}>
                    Удалить навсегда?
                </h5>
                <p className="text-gray-500">
                    «{purgeTarget?.name}» будет удалена безвозвратно. Связи с контактами, сделками и продажами
                    могут быть нарушены. Это действие нельзя отменить.
                </p>
                <div className="flex justify-end gap-2 mt-6">
                    <Button
                        variant="plain"
                        onClick={() => setPurgeTarget(null)}
                        disabled={purging}
                        {...qa('companies.trash.purgeCancel')}
                    >
                        Отмена
                    </Button>
                    <Button
                        variant="solid"
                        color="red"
                        onClick={handlePurge}
                        loading={purging}
                        {...qa('companies.trash.purgeConfirm')}
                    >
                        Удалить навсегда
                    </Button>
                </div>
            </Dialog>
        </Container>
    )
}

export default CompanyTrash
