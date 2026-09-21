import { useLayoutEffect } from 'react'
import { THEME_ENUM } from '@/constants/theme.constant'
import { useThemeStore } from '@/store/themeStore'
import { applyThemeSchema } from './useThemeSchema'
import type { Mode } from '@/@types/theme'

const { MODE_DARK, MODE_LIGHT } = THEME_ENUM
const THEME_SWITCHING_CLASS = 'theme-switching'

function applyModeClass(dark: boolean) {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement
    root.classList.remove(dark ? MODE_LIGHT : MODE_DARK)
    root.classList.add(dark ? MODE_DARK : MODE_LIGHT)
}

function disableTransitionsTemporarily() {
    if (typeof window === 'undefined') return
    const root = window.document.documentElement
    root.classList.add(THEME_SWITCHING_CLASS)

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            root.classList.remove(THEME_SWITCHING_CLASS)
        })
    })
}

function useDarkMode(): [
    isEnabled: boolean,
    onModeChange: (mode: Mode) => void,
] {
    const mode = useThemeStore((state) => state.mode)
    const setMode = useThemeStore((state) => state.setMode)
    const themeSchema = useThemeStore((state) => state.themeSchema)

    const isEnabled = mode === MODE_DARK

    const onModeChange = (nextMode: Mode) => {
        disableTransitionsTemporarily()
        applyModeClass(nextMode === MODE_DARK)
        if (themeSchema) {
            applyThemeSchema(themeSchema, nextMode)
        }
        setMode(nextMode)
    }

    useLayoutEffect(() => {
        applyModeClass(isEnabled)
    }, [isEnabled])

    return [isEnabled, onModeChange]
}

export default useDarkMode
