import { useNavigate } from 'react-router'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { PiUsersDuotone } from 'react-icons/pi'
import { apiGetCompanyContacts } from '@/services/CrmService'
import type { Contact } from '@/@types/crm'
import { qa } from './qa'

export type CompanyCardContactsTabProps = {
    companyId?: string
}

const CompanyCardContactsTab = (props: CompanyCardContactsTabProps) => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('contacts', 'read')
    const companyId = props.companyId

    const { data, isLoading, error } = useSWR(
        pid && companyId && canRead ? ['/v1/companies/contacts', pid, companyId] : null,
        () => apiGetCompanyContacts(companyId!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    if (!canRead) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Контакты недоступны (contacts:read).</p>
            </Card>
        )
    }

    if (!companyId) {
        return null
    }

    const list = (data?.list ?? []) as Contact[]

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col"
            {...qa('contacts.companyTab.root')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiUsersDuotone className="w-5 h-5 text-gray-500" />
                        <h4 className="text-base font-semibold">Контакты компании</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner />
                </div>
            ) : error ? (
                <p className="text-sm text-red-500 py-4">Не удалось загрузить контакты.</p>
            ) : list.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">Нет связанных контактов.</p>
            ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                    {list.map((c) => {
                        const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.id
                        const link = c.companyLinks?.find((l) => l.companyId === companyId)
                        const meta = [link?.role, link?.isPrimary ? 'основной' : '']
                            .filter(Boolean)
                            .join(' · ')
                        return (
                            <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <button
                                        type="button"
                                        className="text-primary text-sm font-medium hover:underline text-left"
                                        onClick={() => navigate(`/contacts/${c.id}`)}
                                        {...qa('contacts.companyTab.row', { contact: c.id })}
                                    >
                                        {name}
                                    </button>
                                    {meta ? (
                                        <div className="text-xs text-gray-500 truncate">{meta}</div>
                                    ) : null}
                                </div>
                                <span className="text-xs text-gray-500 truncate">{c.phone || c.email}</span>
                            </li>
                        )
                    })}
                </ul>
            )}
            {data?.truncated && (
                <p className="text-xs text-amber-600 mt-2" {...qa('contacts.companyTab.truncated')}>
                    Показана часть списка — слишком много связей.
                </p>
            )}
            {list.length > 0 && (
                <div className="mt-3">
                    <Button size="sm" variant="plain" onClick={() => navigate('/contacts')}>
                        Все контакты
                    </Button>
                </div>
            )}
        </Card>
    )
}

export default CompanyCardContactsTab
