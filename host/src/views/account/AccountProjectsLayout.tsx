import { ReactNode } from 'react'
import AccountLayout from './AccountLayout'

interface AccountProjectsLayoutProps {
    children: ReactNode
}

const AccountProjectsLayout = ({ children }: AccountProjectsLayoutProps) => {
    return (
        <AccountLayout>
            <div className="flex flex-col flex-1 min-w-0">
                <main className="flex-1 min-w-0">
                    {children}
                </main>
            </div>
        </AccountLayout>
    )
}

export default AccountProjectsLayout
