import { PiListBulletsDuotone } from 'react-icons/pi'
import type { CommonProps } from '@/@types/common'

export interface NavToggleProps extends CommonProps {
    toggled?: boolean
}

const NavToggle = ({ toggled: _toggled, className }: NavToggleProps) => {
    return (
        <div className={className}>
            <PiListBulletsDuotone />
        </div>
    )
}

export default NavToggle
