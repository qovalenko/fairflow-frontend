import { useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import {
    PiArrowLeftDuotone,
    PiUsersThreeDuotone,
    PiWarningCircleDuotone,
    PiGitMergeDuotone,
} from 'react-icons/pi'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import { apiGetContactDuplicateQueue } from '@/services/CrmService'
import { qa } from './qa'

const PAGE_SIZE = 25

const ContactDuplicateQueue = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // Гейт ≥Manager / contacts:manage (FR-MCON-15).
    const canManage = can('contacts', 'manage')

    const [pageIndex, setPageIndex] = useState(0)

    const { data, isLoading, error, mutate } = useSWR(
        pid && canManage ? ['/v1/contacts/duplicate-queue', pid, pageIndex] : null,
        () => apiGetContactDuplicateQueue({ projectId: pid!, pageIndex, pageSize: PAGE_SIZE }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const pairs = data?.pairs ?? []
    const total = data?.total ?? 0
    const hasMore = (pageIndex + 1) * PAGE_SIZE < total

    // ST-10 No-permission (route-guard).
    if (!canManage) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <p className="text-gray-500">Раздел недоступен</p>
                        <p className="text-gray-400 text-sm mt-1">
                            Очередь дублей доступна руководителям и администраторам
                        </p>
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
                        {...qa('contacts.duplicates.heading')}
                    >
                        <PiUsersThreeDuotone className="w-6 h-6 text-gray-500" /> Очередь дублей
                    </h3>
                    {total > 0 && <Tag className="bg-amber-100 text-amber-700">{total}</Tag>}
                </div>

                <AdaptiveCard>
                    {isLoading ? (
                        // ST-1 Loading.
                        <Loading loading={true} />
                    ) : error ? (
                        // ST-6 Error + retry.
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                            <PiWarningCircleDuotone className="w-12 h-12 text-red-400" />
                            <p className="text-gray-600 dark:text-gray-300">
                                Не удалось загрузить очередь дублей
                            </p>
                            <Button variant="solid" onClick={() => mutate()} {...qa('contacts.duplicates.retry')}>
                                Повторить
                            </Button>
                        </div>
                    ) : pairs.length === 0 ? (
                        // ST-3 Empty (позитивное состояние).
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                            <PiUsersThreeDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                            <p className="font-semibold">Дублей не найдено</p>
                            <p className="text-gray-500 text-sm">
                                Все контакты уникальны в рамках вашей видимости
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {pairs.map((pair, idx) => (
                                <div
                                    key={`${pair.left.contactId}-${pair.right.contactId}-${idx}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                                    {...qa('contacts.duplicates.pair', {
                                        left: pair.left.contactId,
                                        right: pair.right.contactId,
                                    })}
                                >
                                    <div className="flex-1 min-w-0">
                                        <button
                                            type="button"
                                            className="text-primary font-medium truncate block text-left"
                                            onClick={() => navigate(`/contacts/${pair.left.contactId}`)}
                                            {...qa('contacts.duplicates.nameLink', {
                                                contact: pair.left.contactId,
                                            })}
                                        >
                                            {pair.left.displayName}
                                        </button>
                                        <span className="text-xs text-gray-400">
                                            {pair.left.maskedValue}
                                        </span>
                                    </div>
                                    <Tag className="bg-amber-100 text-amber-700 whitespace-nowrap">
                                        {pair.matchedOn === 'email' ? 'email' : 'телефон'}
                                    </Tag>
                                    <div className="flex-1 min-w-0 text-right">
                                        <button
                                            type="button"
                                            className="text-primary font-medium truncate block w-full text-right"
                                            onClick={() => navigate(`/contacts/${pair.right.contactId}`)}
                                            {...qa('contacts.duplicates.nameLink', {
                                                contact: pair.right.contactId,
                                            })}
                                        >
                                            {pair.right.displayName}
                                        </button>
                                        <span className="text-xs text-gray-400">
                                            {pair.right.maskedValue}
                                        </span>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        color="primary"
                                        icon={<PiGitMergeDuotone />}
                                        onClick={() =>
                                            navigate(
                                                `/contacts/merge?source=${pair.left.contactId}&target=${pair.right.contactId}`,
                                            )
                                        }
                                        {...qa('contacts.duplicates.merge', {
                                            left: pair.left.contactId,
                                            right: pair.right.contactId,
                                        })}
                                    >
                                        Слить
                                    </Button>
                                </div>
                            ))}

                            {/* ST-5 Pagination. */}
                            {(pageIndex > 0 || hasMore) && (
                                <div className="flex justify-between items-center pt-2">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={pageIndex === 0}
                                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                                        {...qa('contacts.duplicates.pagePrev')}
                                    >
                                        Назад
                                    </Button>
                                    <span className="text-xs text-gray-400">
                                        {pageIndex * PAGE_SIZE + 1}–
                                        {Math.min((pageIndex + 1) * PAGE_SIZE, total)} из {total}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        disabled={!hasMore}
                                        onClick={() => setPageIndex((p) => p + 1)}
                                        {...qa('contacts.duplicates.pageNext')}
                                    >
                                        Далее
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default ContactDuplicateQueue
