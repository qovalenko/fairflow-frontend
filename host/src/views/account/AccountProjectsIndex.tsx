import AccountProjectsLayout from './AccountProjectsLayout'
import ProjectsList from '@/views/global/ProjectsList'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'

/**
 * box single-tenant: одна Система. Раздел «Проекты» показывает плоский список
 * проектов Системы и создаёт их (владельца проставляет backend).
 */
const AccountProjectsIndex = () => {
    const { systemId } = useWorkspaceRole()
    return (
        <AccountProjectsLayout>
            <ProjectsList skipContainer filterOwnerId={systemId} />
        </AccountProjectsLayout>
    )
}

export default AccountProjectsIndex
