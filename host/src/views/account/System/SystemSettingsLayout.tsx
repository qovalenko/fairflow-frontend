import { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { PiArrowLeftBold } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import SettingsNav from '../SettingsNav'

interface SystemSettingsLayoutProps {
    children: ReactNode
    /** Показать кнопку «Назад» (по умолчанию нет — сайдбар и так плоский). */
    showBack?: boolean
    /** Куда ведёт «Назад» (если показана). По умолчанию — в профиль. */
    backTo?: string
    /** Принудительно активный подпуть настроек системы (когда layout вне раздела). */
    activePath?: string
}

// Box single-tenant: сайдбар вынесен в общий SettingsNav (единый плоский список
// личных пунктов + пунктов системы). «Назад» на страницах настроек не нужна
// (навигация через сайдбар) — показывается только по showBack (мастер проекта).
const SystemSettingsLayout = ({
    children,
    showBack = false,
    backTo = '/account/profile',
    activePath,
}: SystemSettingsLayoutProps) => {
    const navigate = useNavigate()

    return (
        <Container>
            {showBack && (
                <button
                    type="button"
                    className="flex items-center gap-2 pt-6 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                    onClick={() => navigate(backTo)}
                >
                    <PiArrowLeftBold /> Назад
                </button>
            )}
            <div className={`flex gap-6 pb-6 ${showBack ? 'pt-4' : 'pt-6'}`}>
                <aside className="w-60 flex-shrink-0">
                    <SettingsNav activePath={activePath} />
                </aside>
                <main className="flex-1 min-w-0">{children}</main>
            </div>
        </Container>
    )
}

export default SystemSettingsLayout
