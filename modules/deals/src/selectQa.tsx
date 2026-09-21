import DefaultOption from '@/components/ui/Select/Option'
import { qa } from './qa'
import type { OptionProps as ReactSelectOptionProps } from 'react-select'

/** Attach `data-qa-id` to react-select dropdown options for e2e (T-028). */
export function makeSelectOption(qaBase: string) {
    return function QaSelectOption(
        props: ReactSelectOptionProps<{ value: string; label: string }>,
    ) {
        return (
            <DefaultOption
                {...props}
                innerProps={{
                    ...props.innerProps,
                    ...(qa(`${qaBase}.option`, { value: props.data.value }) as Record<
                        string,
                        string
                    >),
                }}
            />
        )
    }
}
