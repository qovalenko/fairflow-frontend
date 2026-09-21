import useSWR from 'swr'
import Badge from '@/components/ui/Badge'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { apiListDlq, dlqNavBadgeCount } from '@/services/AutomationService'
import { qa } from './qa'

interface NavDlqBadgeProps {
    moduleId?: string
}

/**
 * SCR-AUTOMATION-NAV-BADGE — mount-point `nav.item.badge` for automation module.
 * Renders only on the automation nav item (`moduleId === 'automation'`).
 */
const NavDlqBadge = ({ moduleId }: NavDlqBadgeProps) => {
  const projectId = useCurrentProjectId()
  const enabled = moduleId === 'automation' && Boolean(projectId)
  const { data } = useSWR(
    enabled ? ['/api/v1/automation/dlq/nav-badge', projectId] : null,
    () =>
      apiListDlq({
        projectId: projectId!,
        pageIndex: 0,
        pageSize: 1,
      }),
    { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 60000 },
  )

  if (moduleId !== 'automation') return null
  const count = dlqNavBadgeCount(data?.counts)
  if (count <= 0) return null

  return (
    <Badge
      content={count}
      className="ml-auto shrink-0 bg-red-500 text-white text-xs min-w-[1.25rem]"
      {...qa('automation.nav.dlqBadge', { count })}
    />
  )
}

export default NavDlqBadge
