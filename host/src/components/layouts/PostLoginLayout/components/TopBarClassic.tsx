import { Link } from 'react-router'
import Header from '@/components/template/Header'
import HeaderBackButton from '@/components/template/HeaderBackButton'
import Logo from '@/components/template/Logo'
import UserProfileDropdown from '@/components/template/UserProfileDropdown'
import ProjectSelector from '@/components/template/ProjectSelector'
import CreateDropdown from '@/components/template/CreateDropdown'
import ShellHeaderActions from '@/components/template/ShellHeaderActions'
import ChatDropdown from '@/components/template/ChatDropdown'
import HeaderLogo from '@/components/template/HeaderLogo'
import MobileNav from '@/components/template/MobileNav'
import HorizontalNav from '@/components/template/HorizontalNav'
import LayoutBase from '@/components/template/LayoutBase'
import useResponsive from '@/utils/hooks/useResponsive'
import useHasActiveProject from '@/utils/hooks/useHasActiveProject'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import { LAYOUT_TOP_BAR_CLASSIC } from '@/constants/theme.constant'
import type { CommonProps } from '@/@types/common'

const TopBarClassic = ({ children }: CommonProps) => {
    const { larger, smaller } = useResponsive()
    const hasActiveProject = useHasActiveProject()
    const minimalChrome = !hasActiveProject
    const enabledModules = useChromeModuleKeys()

    return (
        <LayoutBase
            type={LAYOUT_TOP_BAR_CLASSIC}
            className="app-layout-top-bar-classic flex flex-auto flex-col min-h-screen"
        >
            <div className="flex flex-auto min-w-0">
                <div className="flex flex-col flex-auto min-h-screen min-w-0 relative w-full">
                    <Header
                        container
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
                                    <HeaderBackButton />
                                    <HeaderLogo />
                                    <ProjectSelector hoverable={false} />
                                </>
                            )
                        }
                        headerMiddle={
                            <>{larger.lg && !minimalChrome && <HorizontalNav />}</>
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
                    {children}
                </div>
            </div>
        </LayoutBase>
    )
}

export default TopBarClassic
