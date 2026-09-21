/**
 * Общие vi.mock для host UI-kit deps, которых нет в deals node_modules
 * (react-select, @tanstack/react-table, @floating-ui/react, toast icons).
 */
import { vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/components/shared/DataTable', () => ({
    default: ({
        data,
        columns,
    }: {
        data?: Array<Record<string, unknown>>
        columns?: Array<{
            header?: string
            cell?: (ctx: { row: { original: Record<string, unknown> } }) => ReactNode
        }>
    }) => (
        <div data-testid="data-table">
            {(data ?? []).map((row, i) => (
                <div key={i} data-testid="data-table-row">
                    {(columns ?? []).map((col, j) => (
                        <span key={j}>{col.cell?.({ row: { original: row } })}</span>
                    ))}
                </div>
            ))}
        </div>
    ),
}))

vi.mock('@/components/ui/toast', () => ({
    default: { push: vi.fn() },
}))

vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/Select', () => ({
    default: ({
        options = [],
        value,
        onChange,
        placeholder,
        isDisabled,
    }: {
        options?: Array<{ value: string; label: string }>
        value?: { value: string; label: string } | null
        onChange?: (opt: { value: string; label: string } | null) => void
        placeholder?: string
        isDisabled?: boolean
    }) => (
        <select
            aria-label={placeholder ?? 'select'}
            disabled={isDisabled}
            value={value?.value ?? ''}
            onChange={(e) => {
                const opt = options.find((o) => o.value === e.target.value) ?? null
                onChange?.(opt)
            }}
        >
            <option value="">{placeholder ?? '—'}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}))
