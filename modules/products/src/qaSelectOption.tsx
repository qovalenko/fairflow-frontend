import { components, type ClearIndicatorProps, type GroupBase, type OptionProps } from 'react-select'
import { qa } from './qa'

/** react-select Option with stable data-qa-id per option value (e2e selectors). */
export function makeQaSelectOption<Option extends { value: string; label: string }>(
    qaId: string,
    dataKey: string,
) {
    return function QaSelectOption(
        props: OptionProps<Option, false, GroupBase<Option>>,
    ) {
        const extra = qa(qaId, { [dataKey]: props.data.value })
        return (
            <components.Option
                {...props}
                innerProps={{ ...props.innerProps, ...extra }}
            />
        )
    }
}

/** react-select ClearIndicator with a stable data-qa-id (no class-name selectors). */
export function makeQaClearIndicator(qaId: string) {
    return function QaClearIndicator<Option>(
        props: ClearIndicatorProps<Option, false, GroupBase<Option>>,
    ) {
        const extra = qa(qaId)
        return (
            <components.ClearIndicator
                {...props}
                innerProps={{ ...props.innerProps, ...extra }}
            />
        )
    }
}
