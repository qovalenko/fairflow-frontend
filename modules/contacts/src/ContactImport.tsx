import { useNavigate } from 'react-router'
import ImportWizard from '@/views/crm/Import/ImportWizard'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'

export default function ContactImport() {
    const navigate = useNavigate()
    const can = usePermission()

    // ST-10 No-permission (EXTRA-CONTACTS-3): экран гейтится ровно тем же правом,
    // что проверяет сервер — `contacts:import` (gateway `crm-bff.controller.ts`
    // POST /v1/contacts/import, @RequirePermission('contacts','import')) и тем же,
    // по которому список показывает ссылку (ContactList: canImport). Раньше здесь
    // стоял `write`: роль с import без write упиралась в заглушку, а роль с write
    // без import проходила мастер и получала 403 на сабмите.
    if (!can('contacts', 'import')) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10">
                        <p className="text-gray-500">Импорт контактов недоступен</p>
                        <Button variant="solid" className="mt-4" onClick={() => navigate('/contacts')}>
                            К списку контактов
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return <ImportWizard entityType="contacts" />
}
