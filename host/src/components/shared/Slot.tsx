import { Suspense, lazy, useMemo } from 'react'
import PermissionCheck from '@/components/shared/PermissionCheck'
import RemoteModuleErrorBoundary from '@/components/shared/RemoteModuleErrorBoundary'
import useSlotContributions, {
    partitionSlotContributions,
} from '@/utils/hooks/useSlotContributions'
import { getSlotComponentLoader } from '@/utils/loadRemoteComponent'
import { qa } from '@/shared/qa'
import type { ComponentType } from 'react'
import type { MountSlotId } from '@/configs/slot-catalog.config'
import type { SlotContribution } from '@/utils/hooks/useSlotContributions'

/** E2e-якоря для federation-слотов карточки компании (каталог companies #77–78). */
const COMPANY_CARD_SLOT_QA: Partial<Record<MountSlotId, string>> = {
    'company.card.tab': 'companies.card.activitiesSlot',
    'company.card.sidebar': 'companies.card.sidebarSlot',
}

interface SlotProps {
    /** Slot id from the host SLOT_CATALOG (RFC-3). */
    id: MountSlotId
    /**
     * Context props the host passes to each contribution (RFC-3 §1.2 — e.g.
     * `{ dealId }`, `{ projectId, period }`). Forwarded verbatim to the mounted
     * remote component.
     */
    context?: Record<string, unknown>
    /** Wrapper class for the slot container (host layout). */
    className?: string
    /** Rendered when the slot has no (visible) contributions. */
    fallback?: React.ReactNode
    /**
     * Suspense fallback while a contribution chunk loads. Chrome slots
     * (`shell.header.action`, `nav.item.badge`, `account.menu.item`) pass
     * `null` so the header/menu does not jump with «Загрузка…».
     */
    pending?: React.ReactNode
    /**
     * Render ONLY the contribution with this `SlotContribution.key`
     * (`<moduleId>::<component>::<slot>`).
     *
     * Slots whose host layout places contributions individually rather than as a
     * stack (e.g. `project.settings.tab` — one settings TAB per module) enumerate
     * `useSlotContributions()` themselves for the labels and then mount each
     * contribution through its own `<Slot only={key} />`, keeping the permission
     * gate / error boundary / lazy-loading in exactly one place. Unset → all
     * contributions render (default behaviour).
     */
    only?: string
}

/**
 * `<Slot id="dashboard.widget" context={{ projectId, period }} />` (R4-E1-09 /
 * FR-SHELL-7a, RFC-3).
 *
 * Renders module contributions declared via `mountPoints[]` of the project's
 * enabled module cards into the named host slot:
 *  - contributions are collected + ordered + contract-validated by
 *    `useSlotContributions` (Contextual UI: disabled / not-available modules
 *    never contribute);
 *  - each contribution is permission-gated via `<PermissionCheck>` from its
 *    `requires` (R3-E1-10) — denied → not rendered (FR-SHELL-3);
 *  - each contribution is isolated by an error boundary + Suspense so one
 *    failing/loading remote never takes down the slot or the host (FR-SHELL-5);
 *  - the remote component is loaded lazily from its federated bundle.
 *
 * The host renders nothing (or `fallback`) when no contribution survives the
 * gates — slots of disabled / no-permission modules are invisible, not empty
 * placeholders.
 */
const Slot = (props: SlotProps) => {
    const { id, context, className, fallback = null, pending, only } = props
    const allContributions = useSlotContributions(id)
    const { contributions, overflowCount } = useMemo(
        () =>
            only === undefined
                ? partitionSlotContributions(allContributions)
                : {
                      contributions: allContributions,
                      overflowCount: 0,
                  },
        [allContributions, only],
    )
    const pendingFallback = pending === undefined ? <SlotLoading /> : pending

    const renderable = useMemo(
        () =>
            contributions.filter(
                (c) =>
                    c.wired &&
                    hasContext(c, context) &&
                    (only === undefined || c.key === only),
            ),
        [contributions, context, only],
    )

    if (renderable.length === 0 && overflowCount === 0) return <>{fallback}</>

    const slotQa = COMPANY_CARD_SLOT_QA[id]

    return (
        <div
            className={className}
            data-slot={id}
            {...(slotQa ? qa(slotQa) : {})}
        >
            {renderable.map((contribution) => (
                <SlotContributionView
                    key={contribution.key}
                    contribution={contribution}
                    context={context}
                    pending={pendingFallback}
                />
            ))}
            {only === undefined && overflowCount > 0 && (
                <p
                    className="text-xs text-gray-400 dark:text-gray-500 py-1"
                    data-testid="slot-contributors-overflow"
                >
                    + ещё {overflowCount}
                </p>
            )}
        </div>
    )
}

/** A contribution renders only when all `requiresContext` props are present. */
function hasContext(
    contribution: SlotContribution,
    context?: Record<string, unknown>,
): boolean {
    const required = contribution.requiresContext
    if (!required || required.length === 0) return true
    return required.every(
        (k) => context != null && context[k] !== undefined && context[k] !== null,
    )
}

interface SlotContributionViewProps {
    contribution: SlotContribution
    context?: Record<string, unknown>
    pending: React.ReactNode
}

const SlotContributionView = ({
    contribution,
    context,
    pending,
}: SlotContributionViewProps) => {
    const { moduleId, component, requires } = contribution

    // Lazy MF component, memoized per (moduleId, component) so it isn't recreated
    // on every render (which would remount and refetch the remote).
    const RemoteComponent = useMemo<ComponentType<Record<string, unknown>>>(() => {
        const loader = getSlotComponentLoader(moduleId, component)
        if (!loader) {
            const Empty: ComponentType<Record<string, unknown>> = () => null
            return Empty
        }
        return lazy(loader)
    }, [moduleId, component])

    const body = (
        <RemoteModuleErrorBoundary moduleName={moduleId}>
            <Suspense fallback={pending}>
                <RemoteComponent {...(context ?? {})} />
            </Suspense>
        </RemoteModuleErrorBoundary>
    )

    // Permission gate (R3-E1-10): split `subject:action`. No `requires` → ungated.
    if (requires) {
        const [subject, action] = requires.split(':')
        if (subject && action) {
            return (
                <PermissionCheck subject={subject} action={action} mode="hide">
                    {body}
                </PermissionCheck>
            )
        }
    }

    return body
}

const SlotLoading = () => (
    <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
        Загрузка…
    </div>
)

export default Slot
