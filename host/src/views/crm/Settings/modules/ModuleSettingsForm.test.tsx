import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import ModuleSettingsForm from './ModuleSettingsForm'
import { pickReactSelectOption } from '../../../../../testing/reactSelectHelpers'

function FormHarness({
    schema,
    initial = {},
}: {
    schema: unknown
    initial?: Record<string, unknown>
}) {
    const [value, setValue] = useState<Record<string, unknown>>(initial)
    const [errors, setErrors] = useState<Record<string, string>>({})

    return (
        <>
            <ModuleSettingsForm
                schema={schema}
                value={value}
                onChange={setValue}
                onValidityChange={setErrors}
            />
            {Object.entries(errors).map(([key, message]) => (
                <div key={key} data-testid={`error-${key}`}>
                    {message}
                </div>
            ))}
            <pre data-testid="value-json">{JSON.stringify(value)}</pre>
        </>
    )
}

describe('ModuleSettingsForm (SCR-PRJSET-MODULE-SETTINGS)', () => {
    it('shows empty-schema placeholder when there is no data', () => {
        render(<FormHarness schema={{}} />)

        expect(
            screen.getByText('Эта группа настроек не описана схемой.'),
        ).toBeInTheDocument()
    })

    it('renders JSON textarea fallback for unstructured settings', () => {
        render(<FormHarness schema={{}} initial={{ legacyKey: 'keep-me' }} />)

        const textarea = screen.getByRole('textbox')
        expect(textarea).toHaveValue(JSON.stringify({ legacyKey: 'keep-me' }, null, 2))

        fireEvent.change(textarea, {
            target: { value: JSON.stringify({ legacyKey: 'updated' }, null, 2) },
        })

        expect(screen.getByTestId('value-json')).toHaveTextContent('"updated"')
    })

    it('renders schema fields, validates required values, and updates controls', async () => {
        const user = userEvent.setup()
        const schema = {
            type: 'object',
            required: ['quota'],
            properties: {
                quota: { type: 'integer', minimum: 1, title: 'Квота' },
                enabled: { type: 'boolean', title: 'Включено' },
                layout: { type: 'string', enum: ['list', 'grid'], title: 'Макет' },
            },
        }

        render(<FormHarness schema={schema} initial={{ enabled: true, layout: 'list' }} />)

        expect(screen.getByText('Квота')).toBeInTheDocument()
        expect(screen.getByText('Включено')).toBeInTheDocument()
        expect(await screen.findByTestId('error-quota')).toHaveTextContent('Обязательное поле')

        await user.type(screen.getByRole('spinbutton'), '0')
        expect(screen.getByTestId('error-quota')).toHaveTextContent('Минимум 1')

        await user.clear(screen.getByRole('spinbutton'))
        await user.type(screen.getByRole('spinbutton'), '5')
        expect(screen.queryByTestId('error-quota')).not.toBeInTheDocument()

        await pickReactSelectOption(user, 0, 'Grid')
        expect(screen.getByTestId('value-json')).toHaveTextContent('"grid"')

        await user.click(screen.getByRole('checkbox'))
        expect(screen.getByTestId('value-json')).toHaveTextContent('"enabled":false')
    })
})
