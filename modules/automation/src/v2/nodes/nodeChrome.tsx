import type { ReactNode } from 'react'
import { qa } from '../../qa'

/** Общая «рамка» кастомной ноды: акцент при selected, красная при error. */
export function NodeShell({
    selected,
    error,
    accent,
    icon,
    title,
    children,
    qaId,
    qaData,
}: {
    selected?: boolean
    error?: string
    /** tailwind-классы цветовой темы border/bg хедера. */
    accent: string
    icon: ReactNode
    title: string
    children?: ReactNode
    qaId?: string
    qaData?: Record<string, string>
}) {
    const ring = error
        ? 'border-red-400 ring-2 ring-red-200 dark:ring-red-900'
        : selected
          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
          : 'border-gray-200 dark:border-gray-700'
    return (
        <div
            className={`rounded-lg border bg-white dark:bg-gray-800 shadow-sm w-[220px] overflow-hidden ${ring}`}
            {...(qaId ? qa(qaId, qaData) : {})}
        >
            <div
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${accent}`}
            >
                {icon}
                <span className="truncate">{title}</span>
            </div>
            <div className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 min-h-[28px]">
                {children}
            </div>
            {error && (
                <div
                    className="px-3 pb-2 text-[11px] text-red-500 leading-tight"
                    {...qa('automation.v2editor.nodeError')}
                >
                    {error}
                </div>
            )}
        </div>
    )
}
