import { useCallback } from 'react'
import classNames from '@/components/ui/utils/classNames'
import Dropdown from '@/components/ui/Dropdown'
import { PiCaretDownDuotone, PiXBold } from 'react-icons/pi'

export interface CheckboxSelectOption {
    value: string
    label: string
    icon?: React.ReactNode
}

export interface CheckboxSelectDropdownProps {
    placeholder?: string
    options: CheckboxSelectOption[]
    value: string[]
    onChange: (value: string[]) => void
    className?: string
    menuClass?: string
    /** Текст для множественного выбора, например "Выбраны {n} типа" */
    countLabel?: (n: number) => string
}

const CheckboxSelectDropdown = ({
    placeholder = 'Выбрать',
    options,
    value,
    onChange,
    className,
    menuClass,
    countLabel = (n) => `Выбраны ${n} типа`,
}: CheckboxSelectDropdownProps) => {
    const handleToggle = useCallback(
        (optValue: string, checked: boolean) => {
            if (checked) {
                onChange([...value, optValue])
            } else {
                onChange(value.filter((v) => v !== optValue))
            }
        },
        [value, onChange],
    )

    const triggerLabel =
        value.length === 0
            ? placeholder
            : value.length === 1
              ? options.find((o) => o.value === value[0])?.label ?? placeholder
              : countLabel(value.length)

    const handleClear = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            onChange([])
        },
        [onChange],
    )

    const triggerContent = (
        <div
            className={classNames(
                'select-control min-h-12 bg-gray-100 dark:bg-gray-700 flex items-center justify-between gap-2 px-3 py-2 cursor-pointer',
                'border border-gray-100 dark:border-gray-700 rounded-xl',
                'text-gray-800 dark:text-gray-100 font-semibold',
                value.length === 0 && 'text-gray-400 dark:text-gray-400',
                className,
            )}
        >
            <span className="truncate flex-1 min-w-0">{triggerLabel}</span>
            <div className="flex items-center shrink-0 gap-0.5">
                {value.length > 0 && (
                    <button
                        type="button"
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        aria-label="Очистить"
                        onClick={handleClear}
                    >
                        <PiXBold className="w-4 h-4" />
                    </button>
                )}
                <PiCaretDownDuotone className="text-2xl text-gray-500" />
            </div>
        </div>
    )

    return (
        <Dropdown
            renderTitle={triggerContent}
            placement="bottom-start"
            menuClass={classNames('!min-w-[180px] !p-1', menuClass)}
        >
            {options.map((opt, index) => {
                const isSelected = value.includes(opt.value)
                const isFirst = index === 0
                const isLast = index === options.length - 1
                return (
                    <Dropdown.Item
                        key={opt.value}
                        variant="custom"
                        className="!p-0"
                    >
                        <div
                            role="button"
                            tabIndex={0}
                            className={classNames(
                                'flex items-center gap-2 w-full px-3 py-2 cursor-pointer transition-colors',
                                isFirst && 'rounded-t-2xl',
                                isLast && 'rounded-b-2xl',
                                isSelected
                                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                            )}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleToggle(opt.value, !isSelected)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleToggle(opt.value, !isSelected)
                                }
                            }}
                        >
                            {opt.icon}
                            <span>{opt.label}</span>
                        </div>
                    </Dropdown.Item>
                )
            })}
        </Dropdown>
    )
}

export default CheckboxSelectDropdown
