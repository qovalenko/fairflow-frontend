import {
    PiCheckCircleDuotone,
    PiInfoDuotone,
    PiWarningDuotone,
    PiXCircleDuotone,
} from 'react-icons/pi'
import type { TypeAttributes, CommonProps } from '../@types/common'
import type { ReactNode, JSX } from 'react'

export interface StatusIconProps extends CommonProps {
    type: TypeAttributes.Status
    custom?: ReactNode | JSX.Element
    iconColor?: string
}

const ICONS: Record<
    TypeAttributes.Status,
    {
        color: string
        icon: JSX.Element
    }
> = {
    success: {
        color: 'text-success',
        icon: <PiCheckCircleDuotone />,
    },
    info: {
        color: 'text-info',
        icon: <PiInfoDuotone />,
    },
    warning: {
        color: 'text-warning',
        icon: <PiWarningDuotone />,
    },
    danger: {
        color: 'text-error',
        icon: <PiXCircleDuotone />,
    },
}

const StatusIcon = (props: StatusIconProps) => {
    const { type = 'info', custom, iconColor } = props

    const icon = ICONS[type]

    return (
        <span className={`text-2xl ${iconColor || icon.color}`}>
            {custom || icon.icon}
        </span>
    )
}

export default StatusIcon
