import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiBuildingsDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useCompanyNames from '@/utils/hooks/useCompanyNames'
import { apiGetContact } from '@/services/CrmService'
import type { Contact } from '@/@types/crm'
import { qa, qaWithAlias } from '../qa'

export type ContactCompaniesTabProps = {
    contactId?: string
}

/**
 * SCR-COMPANIES-CONTACT-TAB — mount-point `contact.card.tab` (FR-COMPANIES-450).
 * Linked companies for the open contact card.
 */
const ContactCompaniesTab = ({ contactId }: ContactCompaniesTabProps) => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const canRead = usePermission('companies', 'read')
    const { data: contact, isLoading } = useSWR<Contact | null>(
        contactId && pid && canRead ? [`/v1/contacts/${contactId}`, pid, 'companies-tab'] : null,
        () => apiGetContact<Contact>(contactId!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )
    const { companyName: resolveCompanyName } = useCompanyNames(pid ?? undefined)

    const companies = useMemo(() => {
        if (!contact) return []
        const ids =
            contact.companyIds && contact.companyIds.length > 0
                ? contact.companyIds
                : contact.companyId
                  ? [contact.companyId]
                  : []
        return ids
            .map((id) => ({
                id,
                name: resolveCompanyName(id) ?? contact.companyName ?? id,
            }))
            .filter((c) => c.id)
    }, [contact, resolveCompanyName])

    if (!canRead) {
        return (
            <Card className="w-full">
                <div
                    className="py-6 text-center text-sm text-gray-500"
                    {...qaWithAlias(
                        'companies.contactTab.noAccess',
                        'companies.mp.contact.noAccess',
                    )}
                >
                    Нет доступа к компаниям
                </div>
            </Card>
        )
    }

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0"
            {...qa('companies.contactTab.panel')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiBuildingsDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Компании</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="py-8 flex justify-center" {...qa('companies.contactTab.loading')}>
                    <Spinner />
                </div>
            ) : companies.length === 0 ? (
                <div
                    className="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    {...qaWithAlias('companies.contactTab.empty', 'companies.mp.contact.empty')}
                >
                    Нет связанных компаний
                </div>
            ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                    {companies.map((c) => (
                        <li key={c.id}>
                            <button
                                type="button"
                                className="w-full text-left px-1 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded-lg transition-colors"
                                onClick={() => navigate(`/companies/${c.id}`)}
                                {...qaWithAlias(
                                    'companies.contactTab.companyRow',
                                    'companies.mp.contact.link',
                                    { company: c.id },
                                )}
                            >
                                <span className="font-medium text-primary">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    )
}

export default ContactCompaniesTab
