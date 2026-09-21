import classNames from 'classnames'
import { PiCaretLeftDuotone } from 'react-icons/pi'
import type { CommonProps } from '../@types/common'
import type { MouseEvent } from 'react'

interface PrevProps extends CommonProps {
    currentPage: number
    pagerClass: {
        default: string
        inactive: string
        active: string
        disabled: string
    }
    qaId?: string
    onPrev: (e: MouseEvent<HTMLSpanElement>) => void
}

const Prev = (props: PrevProps) => {
    const { currentPage, pagerClass, qaId, onPrev } = props

    const disabled = currentPage <= 1

    const onPrevClick = (e: MouseEvent<HTMLSpanElement>) => {
        if (disabled) {
            return
        }
        onPrev(e)
    }

    const pagerPrevClass = classNames(
        pagerClass.default,
        'pagination-pager-prev',
        disabled ? pagerClass.disabled : pagerClass.inactive,
    )

    return (
        <span
            className={pagerPrevClass}
            role="presentation"
            data-qa-id={qaId}
            onClick={onPrevClick}
        >
            <PiCaretLeftDuotone />
        </span>
    )
}

export default Prev
