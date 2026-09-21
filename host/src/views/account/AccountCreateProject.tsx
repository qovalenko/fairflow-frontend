import SystemSettingsLayout from './System/SystemSettingsLayout'
import CreateProject from '@/views/global/CreateProject'

/**
 * box single-tenant: проект создаётся в единственной Системе, поэтому мастер
 * открывается под разделом Системы (пункт «Проекты» подсвечен, «Назад» ведёт в
 * список проектов). Выбора владельца/orgId нет — владельца проставляет backend.
 */
const AccountCreateProject = () => {
    return (
        <SystemSettingsLayout activePath="/projects" showBack backTo="/account/projects">
            <CreateProject />
        </SystemSettingsLayout>
    )
}

export default AccountCreateProject
