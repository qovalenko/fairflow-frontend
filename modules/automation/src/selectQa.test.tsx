import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GroupBase, OptionProps } from 'react-select'
import { QaSelectOption } from './selectQa'

type TestOption = { value: string; label: string }

const mkProps = (
    over: Partial<OptionProps<TestOption, false, GroupBase<TestOption>>> = {},
): OptionProps<TestOption, false, GroupBase<TestOption>> => ({
    innerProps: {
        onClick: () => {},
        onMouseMove: () => {},
        onMouseOver: () => {},
        tabIndex: -1,
    },
    label: 'Сделка создана',
    isSelected: false,
    isDisabled: false,
    data: { value: 'crm.deal.created', label: 'Сделка создана' },
    ...over,
} as OptionProps<TestOption, false, GroupBase<TestOption>>)

describe('QaSelectOption', () => {
    it('рендерит подпись и data-qa-id по value опции', () => {
        render(<QaSelectOption {...mkProps()} />)
        const row = screen.getByText('Сделка создана').closest('[data-qa-id="automation.form.selectOption"]')
        expect(row).toBeInTheDocument()
        expect(row).toHaveAttribute('data-qa-value', 'crm.deal.created')
    })

    it('выбранная опция показывает иконку галочки', () => {
        render(<QaSelectOption {...mkProps({ isSelected: true })} />)
        expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('disabled опция помечена как недоступная', () => {
        render(<QaSelectOption {...mkProps({ isDisabled: true })} />)
        const row = screen
            .getByText('Сделка создана')
            .closest('[data-qa-id="automation.form.selectOption"]')
        expect(row).toHaveClass('cursor-not-allowed')
        expect(row).toHaveClass('opacity-50')
    })
})
