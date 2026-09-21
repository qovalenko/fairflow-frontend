import HorizontalMenuContent from './HorizontalMenuContent'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useSessionUser } from '@/store/authStore'
import appConfig from '@/configs/app.config'
import { useNavigationConfigWithState } from '@/utils/hooks/useNavigationConfig'
import Loading from '@/components/shared/Loading'

const HorizontalNav = ({
    translationSetup = appConfig.activeNavTranslation,
}: {
    translationSetup?: boolean
}) => {
    const currentRouteKey = useRouteKeyStore((state) => state.currentRouteKey)

    const userAuthority = useSessionUser((state) => state.user.authority)

    const { tree: navigationTree, isLoading: navLoading } =
        useNavigationConfigWithState()

    if (navLoading) {
        return (
            <div className="flex items-center px-4">
                <Loading loading={true} />
            </div>
        )
    }

    return (
        <HorizontalMenuContent
            navigationTree={navigationTree}
            routeKey={currentRouteKey}
            userAuthority={userAuthority || []}
            translationSetup={translationSetup}
        />
    )
}

export default HorizontalNav
