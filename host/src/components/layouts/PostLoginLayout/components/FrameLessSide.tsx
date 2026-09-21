import { Link } from 'react-router'
import SideNav from '@/components/template/SideNav'
import Header from '@/components/template/Header'
import Logo from '@/components/template/Logo'
import HeaderBackButton from '@/components/template/HeaderBackButton'
import FrameLessGap from '@/components/template/FrameLessGap'
import SideNavToggle from '@/components/template/SideNavToggle'
import MobileNav from '@/components/template/MobileNav'
import UserProfileDropdown from '@/components/template/UserProfileDropdown'
import ProjectSelector from '@/components/template/ProjectSelector'
import CreateDropdown from '@/components/template/CreateDropdown'
import ShellHeaderActions from '@/components/template/ShellHeaderActions'
import ChatDropdown from '@/components/template/ChatDropdown'
import LayoutBase from '@/components/template/LayoutBase'
import classNames from '@/utils/classNames'
import useScrollTop from '@/utils/hooks/useScrollTop'
import useResponsive from '@/utils/hooks/useResponsive'
import useHasActiveProject from '@/utils/hooks/useHasActiveProject'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import { LAYOUT_FRAMELESS_SIDE } from '@/constants/theme.constant'
import type { CommonProps } from '@/@types/common'
import type { FooterPageContainerType } from '@/components/template/Footer'

const FrameLessSide = ({ children }: CommonProps) => {
    const { isSticky } = useScrollTop()
    const { larger, smaller } = useResponsive()
    const hasActiveProject = useHasActiveProject()
    const minimalChrome = !hasActiveProject
    const enabledModules = useChromeModuleKeys()

    return (
        <LayoutBase
            adaptiveCardActive
            type={LAYOUT_FRAMELESS_SIDE}
            className="app-layout-frameless-side flex flex-auto flex-col bg-gray-950"
            pageContainerReassemble={({
                pageContainerType,
                pageBackgroundType: _pageBackgroundType,
                pageContainerGutterClass,
                children,
                footer,
                header,
                defaultClass,
                pageContainerDefaultClass,
                PageContainerBody,
                PageContainerFooter,
                PageContainerHeader,
            }) => (
                <div
                    className={classNames(
                        defaultClass,
                        'bg-white dark:bg-gray-900 rounded-b-2xl',
                        !minimalChrome &&
                            'rounded-t-2xl border border-gray-200/80 dark:border-transparent',
                    )}
                >
                    <main className="h-full">
                        <div
                            className={classNames(
                                pageContainerDefaultClass,
                                pageContainerType !== 'gutterless' &&
                                    pageContainerGutterClass,
                                pageContainerType === 'contained' &&
                                    'container mx-auto',
                                !footer && 'pb-0 sm:pb-0 md:pb-0',
                            )}
                        >
                            <PageContainerHeader
                                {...header}
                                gutterLess={pageContainerType === 'gutterless'}
                            />
                            <PageContainerBody
                                pageContainerType={pageContainerType}
                            >
                                {children}
                            </PageContainerBody>
                        </div>
                    </main>
                    <PageContainerFooter
                        footer={footer}
                        pageContainerType={
                            pageContainerType as FooterPageContainerType
                        }
                    />
                </div>
            )}
        >
            <div className="flex flex-auto min-w-0">
                {!minimalChrome && (
                    <SideNav
                        background={false}
                        className={classNames('hidden lg:flex contrast-dark pt-6 ml-1.5')}
                        contentClass="h-[calc(100vh-8rem)]"
                        mode="dark"
                        simplifyCollapse={false}
                    />
                )}
                <FrameLessGap
                    className={classNames(
                        'min-h-screen min-w-0 relative w-full',
                        minimalChrome && 'flex-1',
                        !minimalChrome && 'lg:!pl-1.5',
                    )}
                >
                    <div className="bg-gray-50 dark:bg-gray-900 flex flex-col flex-1 h-full rounded-2xl">
                        <Header
                            className={classNames(
                                'rounded-t-2xl dark:bg-gray-900',
                                isSticky && 'shadow-sm',
                            )}
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
                </FrameLessGap>
            </div>
        </LayoutBase>
    )
}

export default FrameLessSide
