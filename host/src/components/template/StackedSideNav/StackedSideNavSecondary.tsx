import ScrollBar from '@/components/ui/ScrollBar'
import classNames from '@/utils/classNames'
import { HEADER_HEIGHT, DIR_LTR, DIR_RTL } from '@/constants/theme.constant'
import VerticalMenuContent from '@/components/template/VerticalMenuContent'
import ProjectSelector from '@/components/template/ProjectSelector'
import { PiCaretLeftDuotone, PiCaretRightDuotone } from 'react-icons/pi'
import type { NavigationTree } from '@/@types/navigation'
import type { Direction } from '@/@types/theme'

type StackedSideNavSecondaryProps = {
    className?: string
    title: string
    menuKey?: string
    menu?: NavigationTree[]
    routeKey: string
    onCollapse: () => void
    direction?: Direction
    translationSetup?: boolean
    userAuthority: string[]
    hasProject?: boolean
}

const StackedSideNavSecondary = (props: StackedSideNavSecondaryProps) => {
    const {
        className,
        title,
        menuKey,
        menu,
        routeKey,
        onCollapse,
        direction,
        translationSetup,
        userAuthority,
        hasProject = true,
        ...rest
    } = props

    const handleCollpase = () => {
        onCollapse()
    }

    const showProjectSelector = menuKey === 'portfolio' || menuKey === 'projects'

    return (
        <div className={classNames('h-full flex flex-col', className)} {...rest}>
            <div
                className={`flex items-center justify-between gap-4 pl-6 pr-4 flex-shrink-0`}
                style={{ height: HEADER_HEIGHT }}
            >
                <h5 className="font-bold">{title}</h5>
                <button
                    type="button"
                    className="close-button"
                    onClick={handleCollpase}
                >
                    {direction === DIR_LTR && <PiCaretLeftDuotone />}
                    {direction === DIR_RTL && <PiCaretRightDuotone />}
                </button>
            </div>
            {showProjectSelector && (
                <div className="flex-shrink-0 px-4 pb-3">
                    <ProjectSelector hoverable={false} className="w-full" />
                </div>
            )}
            <ScrollBar
                autoHide
                className="flex-1 min-h-0"
                direction={direction}
            >
                <VerticalMenuContent
                    routeKey={routeKey}
                    navigationTree={menu}
                    translationSetup={translationSetup}
                    userAuthority={userAuthority}
                    hasProject={hasProject}
                />
            </ScrollBar>
        </div>
    )
}

export default StackedSideNavSecondary
