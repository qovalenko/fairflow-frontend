import { useMemo } from 'react'
import usePlatformModules from '@/utils/hooks/usePlatformModules'

/**
 * Enabled module keys for chrome widgets (chat, notifications, …).
 * Same authoritative source as nav and CreateDropdown (FR-SHELL-030 / TODO-518).
 */
export default function useChromeModuleKeys(): string[] {
    const { enabledCards } = usePlatformModules()
    return useMemo(() => enabledCards.map((c) => c.id), [enabledCards])
}
