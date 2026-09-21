import { Link } from 'react-router'
import SideNav from '@/components/template/SideNav'
import Header from '@/components/template/Header'
import Logo from '@/components/template/Logo'
import HeaderBackButton from '@/components/template/HeaderBackButton'
import SideNavToggle from '@/components/template/SideNavToggle'
import MobileNav from '@/components/template/MobileNav'
import UserProfileDropdown from '@/components/template/UserProfileDropdown'
import ProjectSelector from '@/components/template/ProjectSelector'
import CreateDropdown from '@/components/template/CreateDropdown'
import ShellHeaderActions from '@/components/template/ShellHeaderActions'
import VisibilityScopeIndicator from '@/components/template/VisibilityScopeIndicator'
import ChatDropdown from '@/components/template/ChatDropdown'
import LayoutBase from '@/components/template/LayoutBase'
import useResponsive from '@/utils/hooks/useResponsive'
import useHasActiveProject from '@/utils/hooks/useHasActiveProject'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import { LAYOUT_COLLAPSIBLE_SIDE } from '@/constants/theme.constant'
import { qa } from '@/shared/qa'
import type { CommonProps } from '@/@types/common'

const CollapsibleSide = ({ children }: CommonProps) => {
    const { larger, smaller } = useResponsive()
    const hasActiveProject = useHasActiveProject()
    const minimalChrome = !hasActiveProject
    const enabledModules = useChromeModuleKeys()

    return (
        <LayoutBase
            type={LAYOUT_COLLAPSIBLE_SIDE}
            className="app-layout-collapsible-side flex flex-auto flex-col"
            {...qa('host.chrome.root', { mode: minimalChrome ? 'minimal' : 'full' })}
        >
            <div className="flex flex-auto min-w-0">
                {larger.lg && !minimalChrome && <SideNav />}
                <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
                    <Header
                        className="shadow-sm dark:shadow-2xl"
                        headerStart={
                            minimalChrome ? (
                                <>
                                    <MobileNav />
                                    <Link
                                    to="/"
                                    className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                                    aria-label="На главную"
                                    {...qa('host.chrome.logo')}
                                >
                                    <Logo
                                        type="full"
                                        mode="dark"
                                        logoWidth={140}
                                        imgClass="max-h-8 w-auto object-contain object-left"
                                    />
                                </Link>
                                </>
                            ) : (
                                <>
                                    {larger.lg && <SideNavToggle />}
                                    {smaller.lg && <MobileNav />}
                                    <HeaderBackButton />
                                    <ProjectSelector hoverable={false} />
                                </>
                            )
                        }
                        headerEnd={
                            minimalChrome ? (
                                <UserProfileDropdown hoverable={false} />
                            ) : (
                                <>
                                    <VisibilityScopeIndicator />
                                    <CreateDropdown />
                                    <ShellHeaderActions />
                                    {enabledModules.includes('chat') && <ChatDropdown />}
                                    <UserProfileDropdown hoverable={false} />
                                </>
                            )
                        }
                    />
                    <div className="h-full flex flex-auto flex-col">
                        {children}
                    </div>
                </div>
            </div>
        </LayoutBase>
    )
}

export default CollapsibleSide
