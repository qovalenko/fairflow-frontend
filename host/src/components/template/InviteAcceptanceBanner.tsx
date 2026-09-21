import { useMemo, useState } from 'react'
import { PiCheckCircleDuotone, PiXBold } from 'react-icons/pi'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import {
    buildInviteAcceptanceMessage,
    clearInviteAcceptanceBanner,
    readInviteAcceptanceBanner,
} from '@/utils/inviteAcceptanceBanner'
import { qa } from '@/shared/qa'

/**
 * FR-PSET-660 / FR-ONB-19: after an existing user accepts an org invite and signs
 * in, show an explicit «Вы добавлены в …» banner. State is written on the public
 * accept screen and survives the sign-in redirect via sessionStorage.
 */
const InviteAcceptanceBanner = () => {
    const [state] = useState(() => readInviteAcceptanceBanner())
    const [visible, setVisible] = useState(() => readInviteAcceptanceBanner() !== null)
    const { projects } = useLiveProjects()

    const message = useMemo(() => {
        if (!state) return null
        const names = new Map(projects.map((p) => [p.id, p.name]))
        return buildInviteAcceptanceMessage(
            state.organizationName,
            state.projectIds,
            names,
        )
    }, [projects, state])

    if (!visible || !message) return null

    const dismiss = () => {
        clearInviteAcceptanceBanner()
        setVisible(false)
    }

    return (
        <div
            {...qa('host.inviteAcceptance.banner')}
            className="flex items-start gap-3 px-4 py-3 border-b bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-100 dark:border-emerald-800/40"
            role="status"
            aria-live="polite"
            {...qa('host.inviteAcceptanceBanner')}
        >
            <PiCheckCircleDuotone className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-sm">{message}</p>
            <button
                {...qa('host.inviteAcceptance.dismiss')}
                type="button"
                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-800/40"
                aria-label="Закрыть"
                onClick={dismiss}
            >
                <PiXBold className="w-4 h-4" />
            </button>
        </div>
    )
}

export default InviteAcceptanceBanner
