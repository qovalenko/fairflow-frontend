import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import CompanyQuickCreatePanel, {
    type CompanyQuickCreateFormState,
} from './CompanyQuickCreatePanel'

describe('CompanyQuickCreatePanel', () => {
    it('не рендерится для другого entityType', () => {
        const { container } = render(
            <CompanyQuickCreatePanel entityType="contact" companyForm={undefined} setCompanyForm={undefined} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('редактирует поля формы быстрого создания', async () => {
        const user = userEvent.setup()
        const Wrapper = () => {
            const [form, setForm] = useState<CompanyQuickCreateFormState>({
                name: '',
                inn: '',
                phone: '',
                email: '',
                industry: '',
                assigneeId: '',
            })
            return (
                <CompanyQuickCreatePanel
                    entityType="company"
                    companyForm={form}
                    setCompanyForm={setForm}
                    memberOptions={[{ value: 'u1', label: 'Пётр' }]}
                />
            )
        }
        render(<Wrapper />)
        const inputs = screen.getAllByRole('textbox')
        await user.type(inputs[0], 'ООО Альфа')
        await user.type(inputs[1], '7700000001')
        expect(screen.getByDisplayValue('ООО Альфа')).toBeInTheDocument()
        expect(screen.getByDisplayValue('7700000001')).toBeInTheDocument()
    })
})
