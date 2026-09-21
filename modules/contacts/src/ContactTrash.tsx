import { useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiTrashDuotone,
    PiArrowCounterClockwiseDuotone,
    PiWarningCircleDuotone,
} from 'react-icons/pi'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import {
    apiGetTrashedContacts,
    apiRestoreContact,
    type RestoreOutcome,
    type DuplicateCandidate,
} from '@/services/CrmService'
import type { Contact } from '@/@types/crm'
import { extractApiError, notifySuccess, notifyError } from './contactsUi'
import { qa } from './qa'

const PAGE_SIZE_OPTIONS = [
    { value: 25, label: '25 / стр.' },
    { value: 50, label: '50 / стр.' },
    { value: 100, label: '100 / стр.' },
]

const fullName = (c: Contact) =>
    `${c.firstName} ${c.lastName}${c.middleName ? ` ${c.middleName}` : ''}`.trim()

const remainingLabel = (purgeAt?: number | null): string => {
    if (!purgeAt) return '—'
    const days = dayjs.unix(purgeAt).diff(dayjs(), 'day')
    if (days < 0) return 'истекает'
    if (days === 0) return 'сегодня'
    return `через ${days} дн.`
}

const ContactTrash = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('contacts', 'read')
    const canWrite = can('contacts', 'write')
    const canManage = can('contacts', 'manage')

    // TODO-372: корзина была зашита на первую страницу из 100 записей — всё, что
    // дальше, пользователь не видел и восстановить не мог. Сервер отдаёт честный
    // total (gateway GET /v1/contacts?state=trashed → ListTrash), клиент
    // apiGetTrashedContacts уже принимает pageIndex/pageSize.
    const [pageIndex, setPageIndex] = useState(0)
    const [pageSize, setPageSize] = useState(25)
    const [restoringId, setRestoringId] = useState<string | null>(null)
    const [collision, setCollision] = useState<{
        contact: Contact
        candidates: DuplicateCandidate[]
        options: ('merge' | 'clear_keys')[]
    } | null>(null)

    const { data, isLoading, error, mutate } = useSWR(
        pid && canRead ? ['/v1/contacts', 'trash', pid, pageIndex, pageSize] : null,
        () => apiGetTrashedContacts({ projectId: pid!, pageIndex, pageSize }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const list = data?.list ?? []
    const total = data?.total ?? 0
    const pageCount = Math.max(1, Math.ceil(total / pageSize))

    // Восстановление последней записи страницы не должно оставлять пустую страницу.
    const goToPage = (next: number) => setPageIndex(Math.min(Math.max(next, 0), pageCount - 1))

    const doRestore = async (
        contact: Contact,
        collisionResolution?: 'merge' | 'clear_keys',
    ) => {
        if (!pid) return
        setRestoringId(contact.id)
        try {
            const outcome: RestoreOutcome = await apiRestoreContact(
                contact.id,
                collisionResolution ? { collisionResolution } : undefined,
                { projectId: pid },
            )
            if (outcome?.outcome === 'collision' && outcome.collision) {
                // ST-24: ключ занят живым — развилка merge / clear_keys (FR-MCON-10).
                setCollision({
                    contact,
                    candidates: outcome.collision.candidates ?? [],
                    options: outcome.collision.options ?? ['clear_keys'],
                })
                return
            }
            notifySuccess('Контакт восстановлен')
            setCollision(null)
            await mutate()
            const restoredId = outcome?.contact?.id ?? contact.id
            navigate(`/contacts/${restoredId}`)
        } catch (err) {
            const { code, message } = extractApiError(err)
            if (code === 'RESTORE_COLLISION') {
                const details = (err as { response?: { data?: { error?: { details?: unknown } } } })
                    ?.response?.data?.error?.details as
                    | { candidates?: DuplicateCandidate[]; options?: ('merge' | 'clear_keys')[] }
                    | undefined
                setCollision({
                    contact,
                    candidates: details?.candidates ?? [],
                    options: details?.options ?? ['clear_keys'],
                })
                return
            }
            notifyError(message)
        } finally {
            setRestoringId(null)
        }
    }

    // ST-10 No-permission (route-guard).
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Раздел недоступен</p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            К контактам
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => navigate('/contacts')}
                        title="Назад"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3
                        className="text-2xl font-bold flex items-center gap-2"
                        {...qa('contacts.trash.heading')}
                    >
                        <PiTrashDuotone className="w-6 h-6 text-gray-500" /> Корзина
                    </h3>
                </div>

                <AdaptiveCard>
                    {isLoading ? (
                        // ST-1 Loading.
                        <Loading loading={true} />
                    ) : error ? (
                        // ST-6 Error + retry.
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">Не удалось загрузить корзину</p>
                            <Button variant="solid" onClick={() => mutate()} {...qa('contacts.trash.retry')}>
                                Повторить
                            </Button>
                        </div>
                    ) : list.length === 0 ? (
                        // ST-3 Empty.
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                            <PiTrashDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Корзина пуста</p>
                            <p className="text-gray-500 text-sm">Удалённые контакты появятся здесь</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                        <th className="py-2 px-3">Имя</th>
                                        <th className="py-2 px-3">Email / телефон</th>
                                        <th className="py-2 px-3">Удалён</th>
                                        <th className="py-2 px-3">Срок</th>
                                        <th className="py-2 px-3 text-right">Действие</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.map((c) => (
                                        <tr
                                            key={c.id}
                                            className="border-b border-gray-100 dark:border-gray-800"
                                        >
                                            <td className="py-2 px-3 font-medium">{fullName(c)}</td>
                                            <td className="py-2 px-3 text-gray-500">
                                                {c.email || c.phone || '—'}
                                            </td>
                                            <td className="py-2 px-3 text-gray-500">
                                                {c.deletedAt
                                                    ? dayjs.unix(c.deletedAt).format('DD.MM.YYYY HH:mm')
                                                    : '—'}
                                                {c.deletedByName ? ` · ${c.deletedByName}` : ''}
                                            </td>
                                            <td className="py-2 px-3 text-gray-500">
                                                {remainingLabel(c.purgeAt)}
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    icon={<PiArrowCounterClockwiseDuotone />}
                                                    loading={restoringId === c.id}
                                                    disabled={!canWrite || restoringId === c.id}
                                                    onClick={() => doRestore(c)}
                                                    {...qa('contacts.trash.restore', { contact: c.id })}
                                                >
                                                    Восстановить
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* TODO-372: пагинация по честному total из ListTrash. */}
                            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                                <span className="text-sm text-gray-500">Всего: {total}</span>
                                <div className="flex items-center gap-3">
                                    <div className="w-[110px]">
                                        <Select
                                            size="sm"
                                            isSearchable={false}
                                            options={PAGE_SIZE_OPTIONS}
                                            value={
                                                PAGE_SIZE_OPTIONS.find(
                                                    (o) => o.value === pageSize,
                                                ) ?? null
                                            }
                                            onChange={(opt) => {
                                                setPageSize(opt?.value ?? 25)
                                                setPageIndex(0)
                                            }}
                                            {...qa('contacts.trash.pageSize')}
                                        />
                                    </div>
                                    <div {...qa('contacts.trash.pagination')}>
                                        <Pagination
                                            currentPage={pageIndex + 1}
                                            total={total}
                                            pageSize={pageSize}
                                            onChange={(page) => goToPage(page - 1)}
                                            qaScope="contacts.trash.pagination"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </AdaptiveCard>
            </div>

            {/* ST-24 Restore-collision fork (FR-MCON-10): merge / clear_keys / запросить. */}
            <Dialog
                isOpen={!!collision}
                onClose={() => setCollision(null)}
                onRequestClose={() => setCollision(null)}
                {...qa('contacts.trash.collisionDialog')}
            >
                <h5 className="mb-3" {...qa('contacts.trash.collisionHeading')}>
                    Ключ занят активным контактом
                </h5>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Email или телефон восстанавливаемого контакта уже используется другим активным
                    контактом. Выберите, как поступить.
                </p>
                {collision && collision.candidates.length > 0 && (
                    <ul className="mt-3 text-sm space-y-1">
                        {collision.candidates.map((cand) => (
                            <li key={cand.contactId} className="flex items-center justify-between gap-2">
                                <span>
                                    {cand.displayName} ({cand.maskedValue})
                                </span>
                                <button
                                    type="button"
                                    className="text-primary underline"
                                    onClick={() => navigate(`/contacts/${cand.contactId}`)}
                                >
                                    Открыть
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex flex-wrap justify-end gap-2 mt-6">
                    <Button variant="plain" onClick={() => setCollision(null)}>
                        Отмена
                    </Button>
                    {collision?.options.includes('clear_keys') && (
                        <Button
                            variant="default"
                            disabled={!canWrite}
                            loading={restoringId === collision?.contact.id}
                            onClick={() => collision && doRestore(collision.contact, 'clear_keys')}
                            {...qa('contacts.trash.collisionClearKeys')}
                        >
                            Восстановить без email/телефона
                        </Button>
                    )}
                    {collision?.options.includes('merge') &&
                        (canManage ? (
                            <Button
                                variant="solid"
                                color="primary"
                                loading={restoringId === collision?.contact.id}
                                onClick={() => collision && doRestore(collision.contact, 'merge')}
                                {...qa('contacts.trash.collisionMerge')}
                            >
                                Слить с активным
                            </Button>
                        ) : (
                            <Button
                                variant="default"
                                disabled
                                title="Требуется роль Manager"
                                {...qa('contacts.trash.collisionRequestMerge')}
                            >
                                Запросить слияние
                            </Button>
                        ))}
                </div>
            </Dialog>
        </Container>
    )
}

export default ContactTrash
