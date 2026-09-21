import { Suspense, lazy, useMemo, type ComponentType } from 'react'
import Tabs from '@/components/ui/Tabs'
import PermissionCheck from '@/components/shared/PermissionCheck'
import RemoteModuleErrorBoundary from '@/components/shared/RemoteModuleErrorBoundary'
import useSlotContributions from '@/utils/hooks/useSlotContributions'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import useChromeModuleKeys from '@/utils/hooks/useChromeModuleKeys'
import { getSlotComponentLoader } from '@/utils/loadRemoteComponent'
import { qa } from '@/shared/qa'
import type { SlotContribution } from '@/utils/hooks/useSlotContributions'

const { TabNav, TabContent } = Tabs

/** Tab key for a module slot contribution (FR-PSET-230 deep-link `?tab=`). */
export function moduleTabValue(moduleId: string, component?: string): string {
    return component
        ? `module:${moduleId}:${component.replace(/^\.\//, '')}`
        : `module:${moduleId}`
}

export function isModuleTab(tab: string): boolean {
    return tab.startsWith('module:')
}

/** Legacy `slot:<id>` deep-links from the ui-shell wave — still accepted on read. */
const SLOT_TAB_PREFIX = 'slot:'

export function slotTabValue(moduleId: string): string {
    return `${SLOT_TAB_PREFIX}${moduleId}`
}

export function isSlotTab(value: string): boolean {
    return value.startsWith(SLOT_TAB_PREFIX)
}

function parseRequires(
    requires?: string,
): { subject: string; action: string } | null {
    if (!requires) return null
    const [subject, action] = requires.split(':')
    return subject && action ? { subject, action } : null
}

interface SettingsSlotTabsProps {
    projectId?: string
    activeTab: string
    variant: 'nav' | 'panels'
}

/**
 * Dynamic project-settings tabs from manifest `mountPoints` in slot
 * `project.settings.tab` (TODO-103 / FR-SHELL-320).
 */
export default function SettingsSlotTabs({
    projectId,
    activeTab,
    variant,
}: SettingsSlotTabsProps) {
    const contributions = useSlotContributions('project.settings.tab')
    const { cards } = usePlatformModules()

    const wired = useMemo(
        () => contributions.filter((c) => c.wired),
        [contributions],
    )

    if (wired.length === 0) return null

    const cardLabel = (moduleId: string) =>
        cards.find((c) => c.id === moduleId)?.displayName ?? moduleId

    const tabLabel = (contribution: SlotContribution) =>
        contribution.title ?? cardLabel(contribution.moduleId)

    const tabValue = (contribution: SlotContribution) =>
        moduleTabValue(contribution.moduleId, contribution.component)

    if (variant === 'nav') {
        return (
            <>
                {wired.map((contribution) => {
                    const tab = (
                        <TabNav
                            key={contribution.key}
                            value={tabValue(contribution)}
                            {...qa('host.projectSettings.tab', {
                                tab: tabValue(contribution),
                            })}
                        >
                            {tabLabel(contribution)}
                        </TabNav>
                    )
                    // ST-12 element-gating: the tab itself hides with the same
                    // `requires` gate as its panel — no empty tab for a viewer
                    // without the permission.
                    const gate = parseRequires(contribution.requires)
                    if (!gate) return tab
                    return (
                        <PermissionCheck
                            key={contribution.key}
                            subject={gate.subject}
                            action={gate.action}
                            mode="hide"
                        >
                            {tab}
                        </PermissionCheck>
                    )
                })}
            </>
        )
    }

    return (
        <>
            {wired.map((contribution) => {
                const value = tabValue(contribution)
                return (
                    <TabContent
                        key={contribution.key}
                        value={value}
                        {...qa('host.projectSettings.tabContent', { tab: value })}
                    >
                        {activeTab === value ? (
                            <SettingsSlotContribution
                                contribution={contribution}
                                projectId={projectId}
                            />
                        ) : null}
                    </TabContent>
                )
            })}
        </>
    )
}

function SettingsSlotContribution({
    contribution,
    projectId,
}: {
    contribution: SlotContribution
    projectId?: string
}) {
    const { moduleId, component, requires } = contribution
    const enabledModules = useChromeModuleKeys()
    const moduleDisabled = !enabledModules.includes(moduleId)

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
            <Suspense
                fallback={
                    <div
                        {...qa('host.projectSettings.moduleSlot.loading', { module: moduleId })}
                        className="py-4 text-center text-xs text-gray-400"
                    >
                        Загрузка…
                    </div>
                }
            >
                <RemoteComponent
                    projectId={projectId}
                    moduleDisabled={moduleDisabled}
                    {...qa('host.projectSettings.moduleSlot.panel', { module: moduleId })}
                />
            </Suspense>
        </RemoteModuleErrorBoundary>
    )

    const gate = parseRequires(requires)
    if (gate) {
        return (
            <PermissionCheck
                subject={gate.subject}
                action={gate.action}
                mode="hide"
            >
                {body}
            </PermissionCheck>
        )
    }

    return body
}
