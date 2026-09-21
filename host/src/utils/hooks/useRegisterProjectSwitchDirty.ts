import { useEffect } from 'react'
import { useProjectSwitchDirtyStore } from '@/store/projectSwitchDirtyStore'

/** FR-SHELL-190 — register unsaved edits that must block project switch. */
export default function useRegisterProjectSwitchDirty(key: string, dirty: boolean) {
    const registerDirty = useProjectSwitchDirtyStore((s) => s.registerDirty)

    useEffect(() => {
        registerDirty(key, dirty)
        return () => registerDirty(key, false)
    }, [key, dirty, registerDirty])
}
