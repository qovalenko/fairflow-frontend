import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { qa } from '../qa'

export type CompanyQuickCreateFormState = {
    name: string
    inn: string
    phone: string
    email: string
    industry: string
    assigneeId: string
}

export type CompanyQuickCreatePanelProps = {
    entityType?: string
    companyForm?: CompanyQuickCreateFormState
    setCompanyForm?: React.Dispatch<React.SetStateAction<CompanyQuickCreateFormState>>
    memberOptions?: { value: string; label: string }[]
}

/**
 * SCR-COMPANIES-QUICK-CREATE — mount-point `global.drawer.entity` (FR-COMPANIES-450).
 * Form body for the global «+» drawer when creating a company.
 */
const CompanyQuickCreatePanel = ({
    entityType,
    companyForm,
    setCompanyForm,
    memberOptions = [],
}: CompanyQuickCreatePanelProps) => {
    if (entityType !== 'company' || !companyForm || !setCompanyForm) return null

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium mb-1">Название *</label>
                <Input
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
                    {...qa('companies.quickCreate.name')}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">ИНН</label>
                <Input
                    value={companyForm.inn}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, inn: e.target.value }))}
                    {...qa('companies.quickCreate.inn')}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Телефон</label>
                <Input
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, phone: e.target.value }))}
                    {...qa('companies.quickCreate.phone')}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))}
                    {...qa('companies.quickCreate.email')}
                />
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Отрасль</label>
                <Input
                    value={companyForm.industry}
                    onChange={(e) => setCompanyForm((p) => ({ ...p, industry: e.target.value }))}
                    {...qa('companies.quickCreate.industry')}
                />
            </div>
            <div {...qa('companies.quickCreate.assignee')}>
                <label className="block text-sm font-medium mb-1">Ответственный</label>
                <Select
                    isClearable
                    placeholder="Выберите ответственного"
                    options={memberOptions}
                    value={memberOptions.find((o) => o.value === companyForm.assigneeId) || null}
                    onChange={(o) =>
                        setCompanyForm((p) => ({ ...p, assigneeId: o?.value || '' }))
                    }
                />
            </div>
        </div>
    )
}

export default CompanyQuickCreatePanel
