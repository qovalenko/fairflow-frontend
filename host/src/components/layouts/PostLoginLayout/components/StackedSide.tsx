import { Link } from 'react-router'
import StackedSideNav from '@/components/template/StackedSideNav'
import Header from '@/components/template/Header'
import Logo from '@/components/template/Logo'
import HeaderBackButton from '@/components/template/HeaderBackButton'
import ProjectSelector from '@/components/template/ProjectSelector'
import MobileNav from '@/components/template/MobileNav'
import UserProfileDropdown from '@/components/template/UserProfileDropdown'
import CreateDropdown from '@/components/template/CreateDropdown'
import ShellHeaderActions from '@/components/template/ShellHeaderActions'
import ChatDropdown from '@/components/template/ChatDropdown'
import LayoutBase from '@/components/template/LayoutBase'
import useResponsive from '@/utils/hooks/useResponsive'
import useHasActiveProject from '@/utils/hooks/useHasActiveProject'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import { LAYOUT_STACKED_SIDE } from '@/constants/theme.constant'
import type { CommonProps } from '@/@types/common'

const StackedSide = ({ children }: CommonProps) => {
    const { larger, smaller } = useResponsive()
    const hasActiveProject = useHasActiveProject()
    const minimalChrome = !hasActiveProject
    const enabledModules = useChromeModuleKeys()

    return (
        <LayoutBase
            type={LAYOUT_STACKED_SIDE}
            className="app-layout-stacked-side flex flex-auto flex-col"
        >
            <div className="flex flex-auto min-w-0">
                {larger.lg && !minimalChrome && <StackedSideNav />}
                <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
                    <Header
                        className="shadow-sm dark:shadow-2xl"
                        headerStart={
                            minimalChrome ? (
                                <Link
                                    to="/"
                                    className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                                    aria-label="На главную"
                                >
                                    <Logo
                                        type="full"
                                        mode="dark"
                                        logoWidth={140}
                                        imgClass="max-h-8 w-auto object-contain object-left"
                                    />
                                </Link>
                            ) : (
                                <>
                                    {smaller.lg && <MobileNav />}
                                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                                        <HeaderBackButton />
                                    </div>
                                    <ProjectSelector hoverable={false} />
                                </>
                            )
                        }
                        headerEnd={
                            minimalChrome ? (
                                <UserProfileDropdown hoverable={false} />
                            ) : (
                                <>
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

export default StackedSide
