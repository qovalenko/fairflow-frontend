import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { PiSignOutDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import { useAuth } from '@/auth'
import { qa } from '@/shared/qa'

/**
 * SCR-MPROF-LOGOUT-FORCED — принудительный выход / re-auth (ST-21, FR-MPROF-17a).
 * Materialises `401 SESSION_REVOKED` (jti deny-list): clears the session and
 * routes the user back to sign-in with a reason. Public-ish page (no sidebar).
 */
const REASONS: Record<string, string> = {
    password_changed:
        'Пароль был изменён на другом устройстве — войдите заново.',
    session_revoked: 'Сессия была завершена. Пожалуйста, войдите снова.',
    signed_out: 'Вы вышли из системы.',
    account_removed: 'Учётная запись недоступна.',
    token_expired: 'Срок действия сессии истёк — войдите заново.',
}

const LogoutForced = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { signOut } = useAuth()
    const reason = searchParams.get('reason') || 'session_revoked'
    const [cleared, setCleared] = useState(false)

    useEffect(() => {
        // Clear local session once on mount; do not redirect automatically so
        // the user reads why they were logged out (US-AUTH-26).
        try {
            signOut()
        } finally {
            setCleared(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard
                    className="max-w-md w-full"
                    {...qa('host.logoutForced.root', cleared ? { cleared: 'true' } : undefined)}
                >
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <PiSignOutDuotone className="w-16 h-16 text-amber-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">
                            Сессия завершена
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            {REASONS[reason] || REASONS.session_revoked}
                        </p>
                        <Button
                            block
                            variant="solid"
                            color="primary"
                            disabled={!cleared}
                            onClick={() =>
                                navigate(`/auth/signin?reason=${reason}`)
                            }
                            {...qa('host.logoutForced.signIn')}
                        >
                            Войти снова
                        </Button>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default LogoutForced
