import { Suspense, lazy } from 'react'
import OnboardingChecklist from '@/views/onboarding/OnboardingChecklist'
import OnboardingChecklistBoundary from '@/views/onboarding/OnboardingChecklist/OnboardingChecklistBoundary'
import { lazyRemote } from '@/utils/loadRemoteModule'
import { qa } from '@/shared/qa'

/**
 * Дашборд — системный host-экран (RFC-3 §1.4, FR-SHELL-20a).
 *
 * Каркас принадлежит host; наполнение — mount-point'ы модулей через `<HostSlot>`
 * внутри federated `statistics` (FR-STAT-170). Host больше не дублирует слоты
 * `dashboard.*` вокруг remote — единая точка сборки в `Dashboard.tsx`.
 */
const StatisticsRemote = lazy(lazyRemote('statistics'))

const DashboardHost = () => {
    return (
        <div className="space-y-4" {...qa('host.dashboard.root')}>
            {/* SCR-ONB-CHECKLIST — host-only kernel "first steps" widget (FR-ONB-14). */}
            <OnboardingChecklistBoundary>
                <OnboardingChecklist />
            </OnboardingChecklistBoundary>
            <Suspense fallback={null}>
                <StatisticsRemote />
            </Suspense>
        </div>
    )
}

export default DashboardHost
