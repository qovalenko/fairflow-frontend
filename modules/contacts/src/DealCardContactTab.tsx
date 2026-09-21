import { useNavigate } from 'react-router'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { PiUserDuotone } from 'react-icons/pi'
import { apiGetContact, apiGetDeal } from '@/services/CrmService'
import type { Contact, Deal } from '@/@types/crm'
import { qa } from './qa'

export type DealCardContactTabProps = {
    dealId?: string
    contactId?: string
}

const DealCardContactTab = (props: DealCardContactTabProps) => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('contacts', 'read')
    const dealId = props.dealId

    const { data: deal } = useSWR<Deal>(
        pid && dealId && !props.contactId ? ['/v1/deals', dealId, pid] : null,
        () => apiGetDeal<Deal>(dealId!, pid!),
        { revalidateOnFocus: false },
    )

    const contactId = props.contactId || deal?.contactId

    const { data: contact, isLoading, error } = useSWR<Contact>(
        pid && contactId && canRead ? ['/v1/contacts', contactId, pid] : null,
        () => apiGetContact<Contact>(contactId!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    if (!canRead) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Контакт недоступен (contacts:read).</p>
            </Card>
        )
    }

    if (!contactId) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Сделка без связанного контакта.</p>
            </Card>
        )
    }

    const fullName = contact
        ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
        : ''

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col"
            {...qa('contacts.dealTab.root')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiUserDuotone className="w-5 h-5 text-gray-500" />
                        <h4 className="text-base font-semibold">Контакт сделки</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="flex justify-center py-8">
                    <Spinner />
                </div>
            ) : error || !contact ? (
                <p className="text-sm text-red-500 py-4">Не удалось загрузить контакт.</p>
            ) : (
                <div className="flex flex-col gap-2 text-sm">
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{fullName || contact.id}</div>
                    {contact.position && (
                        <div className="text-gray-500">{contact.position}</div>
                    )}
                    {contact.phone && <div>{contact.phone}</div>}
                    {contact.email && <div>{contact.email}</div>}
                    <Button
                        size="sm"
                        variant="plain"
                        className="mt-2"
                        onClick={() => navigate(`/contacts/${contact.id}`)}
                        {...qa('contacts.dealTab.openCard')}
                    >
                        Открыть карточку
                    </Button>
                </div>
            )}
        </Card>
    )
}

export default DealCardContactTab
