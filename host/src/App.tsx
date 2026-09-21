import { BrowserRouter } from 'react-router'
import Theme from '@/components/template/Theme'
import Layout from '@/components/layouts'
import { AuthProvider } from '@/auth'
import { LiveProjectsProvider } from '@/utils/hooks/useLiveProjects'
import Views from '@/views'
import ThinHostRouter from '@/components/route/ThinHostRouter'
import PublicConfigGate from '@/components/route/PublicConfigGate'
import ManifestBootstrapGate from '@/components/route/ManifestBootstrapGate'
import Slot from '@/components/shared/Slot'
import UserProfileDrawerHost from '@/components/template/UserProfileDrawerHost'
import { registerHostSlot } from '@/components/shared/hostSlotBridge'
import GlobalEntityDrawer from '@/components/template/GlobalEntityDrawer'

/**
 * Publish the host slot renderer for views that live in federated remotes — the
 * entity card screens mount `contact|company|deal|order.card.tab` through
 * `<HostSlot>` (see `components/shared/hostSlotBridge.ts`). Must run at module
 * scope, i.e. before the first render: `main.tsx` imports this file before it
 * calls `createRoot(...).render(...)`, so any `<HostSlot>` deeper in the tree
 * already sees the implementation. Host-owned views keep importing `<Slot>`.
 */
registerHostSlot(Slot)

function App() {
    if (import.meta.env.VITE_HOST_THIN_ROUTER === 'true') {
        return (
            <Theme>
                <BrowserRouter>
                    <ThinHostRouter />
                </BrowserRouter>
            </Theme>
        )
    }

    return (
        <Theme>
            <BrowserRouter>
                <PublicConfigGate>
                    <ManifestBootstrapGate>
                    <AuthProvider>
                        <LiveProjectsProvider>
                            <UserProfileDrawerHost>
                                <Layout>
                                    <Views />
                                    <GlobalEntityDrawer />
                                </Layout>
                            </UserProfileDrawerHost>
                        </LiveProjectsProvider>
                    </AuthProvider>
                    </ManifestBootstrapGate>
                </PublicConfigGate>
            </BrowserRouter>
        </Theme>
    )
}

export default App
