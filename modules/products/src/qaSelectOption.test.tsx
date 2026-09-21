import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { ClearIndicatorProps, GroupBase, OptionProps } from 'react-select'
import { makeQaClearIndicator, makeQaSelectOption } from './qaSelectOption'

type Option = { value: string; label: string }

const baseOptionProps = (): OptionProps<Option, false, GroupBase<Option>> =>
    ({
        data: { value: 'CRM', label: 'CRM' },
        innerProps: { id: 'opt-crm', tabIndex: -1, onClick: () => {}, onMouseMove: () => {}, onMouseOver: () => {} },
        innerRef: () => {},
        isDisabled: false,
        isFocused: false,
        isSelected: false,
        label: 'CRM',
        type: 'option',
        selectProps: {},
        getStyles: () => ({}),
        getClassNames: () => ({}),
        getValue: () => [],
        hasValue: false,
        isMulti: false,
        isRtl: false,
        options: [],
        clearValue: () => {},
        cx: () => '',
        setValue: () => {},
        theme: {} as never,
    }) as unknown as OptionProps<Option, false, GroupBase<Option>>

const baseClearProps = (): ClearIndicatorProps<Option, false, GroupBase<Option>> =>
    ({
        innerProps: { ref: () => {}, onMouseDown: () => {}, onTouchEnd: () => {} },
        selectProps: {},
        getStyles: () => ({}),
        getClassNames: () => ({}),
        getValue: () => [],
        hasValue: true,
        isMulti: false,
        isRtl: false,
        options: [],
        clearValue: () => {},
        cx: () => '',
        setValue: () => {},
        theme: {} as never,
    }) as unknown as ClearIndicatorProps<Option, false, GroupBase<Option>>

describe('qaSelectOption helpers', () => {
    it('makeQaSelectOption добавляет data-qa-id на option', () => {
        const QaOption = makeQaSelectOption('products.list.categoryOption', 'category')
        const { container } = render(<QaOption {...baseOptionProps()} />)

        const option = container.querySelector('[data-qa-id="products.list.categoryOption"]')
        expect(option).toHaveAttribute('data-qa-category', 'CRM')
    })

    it('makeQaClearIndicator добавляет data-qa-id на clear', () => {
        const QaClear = makeQaClearIndicator('products.edit.orderTypeClear')
        const { container } = render(<QaClear {...baseClearProps()} />)

        expect(
            container.querySelector('[data-qa-id="products.edit.orderTypeClear"]'),
        ).toBeInTheDocument()
    })
})
