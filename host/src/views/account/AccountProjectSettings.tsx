import { useParams } from 'react-router'
import AccountLayout from './AccountLayout'
import Settings from '@/views/crm/Settings'

const AccountProjectSettings = () => {
    const { projectId } = useParams<{ projectId: string }>()
    if (!projectId) return null
    return (
        <AccountLayout>
            <Settings />
        </AccountLayout>
    )
}

export default AccountProjectSettings
