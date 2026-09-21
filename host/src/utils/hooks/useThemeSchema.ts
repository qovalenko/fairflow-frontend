import { useLayoutEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'
import presetThemeSchemaConfig from '@/configs/preset-theme-schema.config'

export type ThemeVariables = Record<
    'primary' | 'primaryDeep' | 'primaryMild' | 'primarySubtle' | 'neutral',
    string
>

export interface MappedTheme {
    [key: string]: string
}

export const mapTheme = (variables: ThemeVariables): MappedTheme => {
    return {
        '--primary': variables.primary || '',
        '--primary-deep': variables.primaryDeep || '',
        '--primary-mild': variables.primaryMild || '',
        '--primary-subtle': variables.primarySubtle || '',
        '--neutral': variables.neutral || '',
    }
}

export function applyThemeSchema(theme: string, mode: string): void {
    const schemaConfig = presetThemeSchemaConfig[theme]
    if (!schemaConfig?.[mode as 'light' | 'dark']) return

    const themeObject = mapTheme(schemaConfig[mode as 'light' | 'dark'])
    if (!themeObject) return

    const root = document.documentElement
    for (const property in themeObject) {
        if (property !== 'name') {
            root.style.setProperty(property, themeObject[property])
        }
    }
}

function useThemeSchema() {
    const themeSchema = useThemeStore((state) => state.themeSchema)
    const mode = useThemeStore((state) => state.mode)

    useLayoutEffect(() => {
        if (themeSchema) {
            applyThemeSchema(themeSchema, mode)
        }
    }, [themeSchema, mode])
}

export default useThemeSchema
