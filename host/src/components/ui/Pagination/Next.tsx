import classNames from 'classnames'
import { PiCaretRightDuotone } from 'react-icons/pi'
import type { CommonProps } from '../@types/common'
import type { MouseEvent } from 'react'
import { qa } from '@/shared/qa'

interface NextProps extends CommonProps {
    currentPage: number
    pageCount: number
    pagerClass: {
        default: string
        inactive: string
        active: string
        disabled: string
    }
    qaId?: string
    onNext: (e: MouseEvent<HTMLSpanElement>) => void
    qaPrefix?: string
}

const Next = (props: NextProps) => {
    const { currentPage, pageCount, pagerClass, qaId, onNext, qaPrefix, ...rest } = props

    const disabled = currentPage === pageCount || pageCount === 0

    const onNextClick = (e: MouseEvent<HTMLSpanElement>) => {
        e.preventDefault()
        if (disabled) {
            return
        }
        onNext(e)
    }

    const pagerNextClass = classNames(
        pagerClass.default,
        'pagination-pager-next',
        disabled ? pagerClass.disabled : pagerClass.inactive,
    )

    return (
        <span
            {...rest}
            className={pagerNextClass}
            role="presentation"
            data-qa-id={qaId}
            onClick={onNextClick}
            {...(qaPrefix ? qa(`${qaPrefix}.next`) : {})}
        >
            <PiCaretRightDuotone />
        </span>
    )
}

export default Next
