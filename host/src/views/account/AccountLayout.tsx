import { ReactNode } from 'react'
import Container from '@/components/shared/Container'
import SettingsNav from './SettingsNav'
import { qa } from '@/shared/qa'

interface AccountLayoutProps {
    children: ReactNode
}

// Box single-tenant: единый плоский сайдбар настроек (личные + компания) —
// см. SettingsNav. Отдельного раздела «Организация»/«Компания» с drill-in нет.
const AccountLayout = ({ children }: AccountLayoutProps) => {
    return (
        <Container>
            <div className="flex gap-6 py-6">
                <aside className="w-60 flex-shrink-0" {...qa('host.accountLayout.sidebar')}>
                    <SettingsNav />
                </aside>
                <main className="flex-1 min-w-0" {...qa('host.accountLayout.main')}>
                    {children}
                </main>
            </div>
        </Container>
    )
}

export default AccountLayout
