import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Выбор опции react-select по индексу combobox на странице или в контейнере. */
export async function pickReactSelectOption(
    user: ReturnType<typeof userEvent.setup>,
    comboboxIndex: number,
    optionLabel: string,
    container?: HTMLElement,
) {
    const scope = container ? within(container) : screen
    const comboboxes = scope.getAllByRole('combobox')
    await user.click(comboboxes[comboboxIndex]!)
    const target = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[id*="option"]')).find(
            (el) => el.textContent === optionLabel,
        )
        if (!found) throw new Error(`option "${optionLabel}" not rendered`)
        return found
    })
    await user.click(target)
}

/** Выбор опции react-select поля с `<label>`. */
export async function pickLabeledSelectOption(
    user: ReturnType<typeof userEvent.setup>,
    labelText: string,
    optionLabel: string,
) {
    const label = screen.getByText(labelText, { selector: 'label' })
    const input = label.parentElement!.querySelector('input')!
    await user.click(input)
    const target = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[id*="option"]')).find(
            (el) => el.textContent === optionLabel,
        )
        if (!found) throw new Error(`option "${optionLabel}" not rendered`)
        return found
    })
    await user.click(target)
}
