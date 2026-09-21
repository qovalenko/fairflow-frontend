import { useState, useEffect } from 'react'
import { useSessionUser } from '@/store/authStore'

/**
 * Хук для отслеживания статуса гидратации Zustand-хранилища сессии.
 * Позволяет избежать гонки состояний при первоначальной загрузке приложения,
 * когда данные из localStorage еще не считаны.
 */
export function useSessionHydrated(): boolean {
    const [hydrated, setHydrated] = useState<boolean>(false)

    useEffect(() => {
        const hasHydrated = useSessionUser.persist.hasHydrated()
        if (hasHydrated) {
            setHydrated(true)
            return
        }

        const unsub = useSessionUser.persist.onFinishHydration(() => {
            setHydrated(true)
        })

        return () => {
            unsub()
        }
    }, [])

    return hydrated
}

export default useSessionHydrated
