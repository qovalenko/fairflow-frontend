import Button from '../Button'
import classNames from '../utils/classNames'
import { PiCaretRightDuotone } from 'react-icons/pi'
import { useCarousel } from './context'
import type { ComponentPropsWithoutRef } from 'react'

export type CarouselNextProps = Omit<
    ComponentPropsWithoutRef<typeof Button>,
    'icon' | 'shape' | 'aria-label'
>

const CarouselNext = (props: CarouselNextProps) => {
    const { className, variant = 'default', size = 'sm', ...rest } = props
    const { orientation, scrollNext, canScrollNext } = useCarousel()

    const buttonClass = classNames(
        orientation === 'vertical' && 'rotate-90',
        className,
    )

    return (
        <Button
            variant={variant}
            size={size}
            className={buttonClass}
            disabled={!canScrollNext}
            shape="circle"
            aria-label="Следующий слайд"
            icon={<PiCaretRightDuotone />}
            onClick={scrollNext}
            {...rest}
        />
    )
}

export default CarouselNext
