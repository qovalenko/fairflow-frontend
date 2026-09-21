import { PiCheckDuotone } from 'react-icons/pi'
import type { GroupBase, OptionProps } from 'react-select'
import { qa } from './qa'

/** react-select Option with stable data-qa-id per option value (e2e). */
export function QaSelectOption<Option extends { value: string }>(
    props: OptionProps<Option, false, GroupBase<Option>>,
) {
    const { innerProps, label, isSelected, isDisabled, data } = props
    const value = (data as { value: string }).value
    const cls = [
        'select-option',
        !isDisabled && !isSelected && 'hover:text-gray-800 dark:hover:text-gray-100',
        isSelected && 'text-primary bg-primary-subtle',
        isDisabled && 'opacity-50 cursor-not-allowed',
    ]
        .filter(Boolean)
        .join(' ')

    return (
        <div className={cls} {...innerProps} {...qa('automation.form.selectOption', { value })}>
            <span className="ml-2">{label}</span>
            {isSelected && <PiCheckDuotone className="text-xl" />}
        </div>
    )
}
