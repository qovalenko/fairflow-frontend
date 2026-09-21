import Button from '@/components/ui/Button'
import { PiDotsThreeDuotone } from 'react-icons/pi'
import type { ButtonProps } from '@/components/ui/Button'

type EllipsisButtonProps = ButtonProps

const EllipsisButton = (props: EllipsisButtonProps) => {
    const { shape = 'circle', variant = 'plain', size = 'xs' } = props

    return (
        <Button
            shape={shape}
            variant={variant}
            size={size}
            icon={<PiDotsThreeDuotone />}
            {...props}
        />
    )
}

export default EllipsisButton
