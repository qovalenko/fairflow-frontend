/**
 * F3-settings (U4 / E1-04) — auto-generated module settings form.
 *
 * Renders UI fields with validation from a normalized `settingsSchema`
 * (see ./settingsSchema.ts), replacing the raw "Personal/Integration
 * settings JSON" textareas. Falls back to a read-only JSON view when the
 * schema is empty so unstructured/legacy settings stay editable.
 */
import { useEffect, useMemo } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import {
    parseSettingsSchema,
    validateSettings,
    arrayToText,
    textToArray,
    type SettingsField,
} from './settingsSchema'
import { qa } from '@/shared/qa'

type SettingsValue = Record<string, unknown>

type SelectOption = { value: string; label: string }

type Props = {
    /** Raw settingsSchema from the module manifest/registry. */
    schema: unknown
    /** Current per-project settings values. */
    value: SettingsValue
    onChange: (next: SettingsValue) => void
    /** Surfaced to the parent so Save can be blocked while invalid. */
    onValidityChange?: (errors: Record<string, string>) => void
    /** Empty-schema fallback heading. */
    emptyLabel?: string
    /** Prefix for data-qa-id on fields (e2e). */
    qaScope?: string
}

const FieldLabel = ({ field }: { field: SettingsField }) => (
    <label className="block text-sm font-medium mb-1">
        {field.title}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
)

const ModuleSettingsForm = ({
    schema,
    value,
    onChange,
    onValidityChange,
    emptyLabel = 'Эта группа настроек не описана схемой.',
    qaScope,
}: Props) => {
    const fields = useMemo(() => parseSettingsSchema(schema), [schema])
    const errors = useMemo(() => validateSettings(fields, value), [fields, value])

    // Report validity to parent whenever the error set changes.
    const errorsKey = JSON.stringify(errors)
    useEffect(() => {
        onValidityChange?.(errors)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [errorsKey])

    const setField = (key: string, next: unknown) => {
        onChange({ ...value, [key]: next })
    }

    // Empty schema → no structured fields. Keep raw JSON editing so legacy /
    // unstructured settings are not lost (graceful degradation).
    if (fields.length === 0) {
        const hasData = value && Object.keys(value).length > 0
        return (
            <div>
                {hasData ? (
                    <Input
                        textArea
                        rows={5}
                        value={JSON.stringify(value, null, 2)}
                        onChange={(e) => {
                            try {
                                onChange(JSON.parse(e.target.value) as SettingsValue)
                            } catch {
                                /* ignore until valid JSON */
                            }
                        }}
                    />
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {fields.map((field) => {
                const err = errors[field.key]
                const raw = value[field.key]

                let control: React.ReactNode

                if (field.type === 'boolean') {
                    control = (
                        <Switcher
                            checked={Boolean(raw)}
                            onChange={(checked) => setField(field.key, checked)}
                        />
                    )
                } else if (field.type === 'enum') {
                    const options: SelectOption[] = field.options ?? []
                    const selected =
                        options.find((o) => o.value === String(raw)) ?? null
                    control = (
                        <Select<SelectOption>
                            isClearable={!field.required}
                            placeholder="Не выбрано"
                            options={options}
                            value={selected}
                            onChange={(opt) => setField(field.key, opt ? opt.value : undefined)}
                        />
                    )
                } else if (field.type === 'array') {
                    control = (
                        <Input
                            textArea
                            rows={3}
                            placeholder="По одному значению на строку"
                            value={arrayToText(raw)}
                            onChange={(e) => setField(field.key, textToArray(e.target.value))}
                        />
                    )
                } else if (field.type === 'number' || field.type === 'integer') {
                    control = (
                        <Input
                            type="number"
                            {...(qaScope ? qa(`${qaScope}.field`, { key: field.key }) : {})}
                            value={raw === undefined || raw === null ? '' : String(raw)}
                            onChange={(e) => {
                                const v = e.target.value
                                setField(field.key, v === '' ? undefined : Number(v))
                            }}
                        />
                    )
                } else {
                    control = (
                        <Input
                            value={typeof raw === 'string' ? raw : raw === undefined ? '' : String(raw)}
                            onChange={(e) => setField(field.key, e.target.value)}
                        />
                    )
                }

                return (
                    <div key={field.key} {...(qaScope ? qa(`${qaScope}.fieldGroup`, { key: field.key }) : {})}>
                        {field.type !== 'boolean' ? (
                            <>
                                <FieldLabel field={field} />
                                {control}
                            </>
                        ) : (
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{field.title}</div>
                                    {field.description && (
                                        <div className="text-xs text-gray-500">
                                            {field.description}
                                        </div>
                                    )}
                                </div>
                                {control}
                            </div>
                        )}
                        {field.type !== 'boolean' && field.description && (
                            <p className="mt-1 text-xs text-gray-500">{field.description}</p>
                        )}
                        {err && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{err}</p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

export default ModuleSettingsForm
