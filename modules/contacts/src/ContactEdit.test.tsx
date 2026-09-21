import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Contact } from '@/@types/crm'

/**
 * TODO-177 — в форме редактирования стоял рабочий на вид Select «Ответственный»:
 * gateway честно передавал `assignee_id`, но домен его демонстративно не мапит
 * (`contact.grpc.controller.ts`), а `contacts.service.ts` вычёркивает `ownerId`
 * из update (STRIPPED_UPDATE_FIELDS, FR-MCON-24) — значение молча терялось.
 * Единственный рабочий путь — `POST /v1/contacts/reassign` (contacts:manage).
 */
const apiUpdateContact = vi.fn()
const apiReassignContacts = vi.fn()

let permissions = new Set(['contacts:read', 'contacts:write', 'contacts:manage'])

vi.mock('react-router', () => ({
    useParams: () => ({ id: 'c1' }),
    useNavigate: () => vi.fn(),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContact: () => Promise.resolve(contact),
    apiUpdateContact: (...a: unknown[]) => apiUpdateContact(...a),
    apiGetCompanies: () => Promise.resolve({ list: [] }),
    apiGetMembers: () => Promise.resolve([{ id: 'u1', name: 'Пётр Петров' }, { id: 'u2', name: 'Анна Смирнова' }]),
    apiGetDealSources: () => Promise.resolve([]),
    apiReassignContacts: (...a: unknown[]) => apiReassignContacts(...a),
    apiGetDepartments: () =>
        Promise.resolve([
            { id: 'd1', organizationId: 'o1', name: 'Отдел продаж', parentId: null, leaderUserId: null },
            { id: 'd2', organizationId: 'o1', name: 'Отдел маркетинга', parentId: null, leaderUserId: null },
        ]),
}))

import ContactEdit from './ContactEdit'

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    departmentId: 'd1',
    createdAt: 0,
    updatedAt: 0,
}

/** Выбор опции в react-select последнего (диалогового) селекта на странице. */
const pickInLastSelect = async (label: string) => {
    const inputs = document.querySelectorAll('input.select__input')
    const dialogInput = inputs[inputs.length - 1]
    fireEvent.focus(dialogInput)
    fireEvent.keyDown(dialogInput, { key: 'ArrowDown', code: 'ArrowDown' })
    const option = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[role="option"]')).find(
            (el) => el.textContent === label,
        )
        if (!found) throw new Error('option not rendered yet')
        return found
    })
    fireEvent.click(option)
}

describe('ContactEdit — ответственный (TODO-177)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write', 'contacts:manage'])
        apiUpdateContact.mockResolvedValue(contact)
        apiReassignContacts.mockResolvedValue({ reassigned: 1 })
    })

    it('сохранение формы НЕ отправляет assigneeId (домен его всё равно вычёркивает)', async () => {
        render(<ContactEdit />)
        const position = await screen.findByPlaceholderText('Через запятую')

        fireEvent.change(position, { target: { value: 'vip' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiUpdateContact).toHaveBeenCalled())
        const payload = apiUpdateContact.mock.calls[0][1] as Record<string, unknown>
        expect(payload).not.toHaveProperty('assigneeId')
    })

    it('показывает текущего ответственного только для чтения', async () => {
        render(<ContactEdit />)

        const field = (await screen.findByDisplayValue('Пётр Петров')) as HTMLInputElement
        expect(field.readOnly).toBe(true)
    })

    it('«Сменить» зовёт reassign-ручку, а не update', async () => {
        render(<ContactEdit />)
        await screen.findByDisplayValue('Пётр Петров')

        fireEvent.click(screen.getByRole('button', { name: 'Сменить' }))
        // Выбор нового ответственного в диалоге: react-select раскрывается по
        // ArrowDown на combobox-инпуте, опции — role="option". Диалог рендерится
        // порталом последним, поэтому берём последний select на странице.
        const inputs = document.querySelectorAll('input.select__input')
        const dialogInput = inputs[inputs.length - 1]
        fireEvent.focus(dialogInput)
        fireEvent.keyDown(dialogInput, { key: 'ArrowDown', code: 'ArrowDown' })

        const option = await waitFor(() => {
            const found = Array.from(document.querySelectorAll('[role="option"]')).find(
                (el) => el.textContent === 'Анна Смирнова',
            )
            if (!found) throw new Error('option not rendered yet')
            return found
        })
        fireEvent.click(option)
        fireEvent.click(screen.getAllByRole('button', { name: 'Сменить' }).pop() as HTMLElement)

        await waitFor(() =>
            expect(apiReassignContacts).toHaveBeenCalledWith(
                { contactIds: ['c1'], newOwnerId: 'u2' },
                { projectId: 'p1' },
            ),
        )
        expect(apiUpdateContact).not.toHaveBeenCalled()
    })

    it('без contacts:manage кнопки смены ответственного нет', async () => {
        permissions = new Set(['contacts:read', 'contacts:write'])

        render(<ContactEdit />)
        await screen.findByDisplayValue('Пётр Петров')

        expect(screen.queryByRole('button', { name: 'Сменить' })).not.toBeInTheDocument()
    })

    it('TODO-370: без contacts:read экран не читает контакт', async () => {
        permissions = new Set(['contacts:write'])

        render(<ContactEdit />)

        expect(await screen.findByText(/Контакт недоступен/)).toBeInTheDocument()
    })
})

/**
 * W-6 — отдел-владелец контакта. Домен вычёркивает departmentId из update ровно
 * так же, как ownerId (`contacts.service.ts` STRIPPED_UPDATE_FIELDS), поэтому
 * поле в форме read-only, а смена идёт через `POST /v1/contacts/reassign` с
 * `newDepartmentId` — и РОВНО с ним: домен требует одно поле из двух.
 */
describe('ContactEdit — отдел (W-6)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write', 'contacts:manage'])
        apiUpdateContact.mockResolvedValue(contact)
        apiReassignContacts.mockResolvedValue({ reassigned: 1 })
    })

    it('показывает текущий отдел контакта только для чтения', async () => {
        render(<ContactEdit />)

        const field = (await screen.findByDisplayValue('Отдел продаж')) as HTMLInputElement
        expect(field.readOnly).toBe(true)
    })

    it('«Сменить отдел» зовёт reassign с newDepartmentId, без newOwnerId', async () => {
        render(<ContactEdit />)
        await screen.findByDisplayValue('Отдел продаж')

        fireEvent.click(screen.getByRole('button', { name: 'Сменить отдел' }))
        await pickInLastSelect('Отдел маркетинга')
        fireEvent.click(screen.getAllByRole('button', { name: 'Сменить' }).pop() as HTMLElement)

        await waitFor(() =>
            expect(apiReassignContacts).toHaveBeenCalledWith(
                { contactIds: ['c1'], newDepartmentId: 'd2' },
                { projectId: 'p1' },
            ),
        )
        expect(apiUpdateContact).not.toHaveBeenCalled()
    })

    it('сохранение формы НЕ отправляет departmentId', async () => {
        render(<ContactEdit />)
        const tags = await screen.findByPlaceholderText('Через запятую')

        fireEvent.change(tags, { target: { value: 'vip' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiUpdateContact).toHaveBeenCalled())
        const payload = apiUpdateContact.mock.calls[0][1] as Record<string, unknown>
        expect(payload).not.toHaveProperty('departmentId')
    })

    it('без contacts:manage кнопки смены отдела нет', async () => {
        permissions = new Set(['contacts:read', 'contacts:write'])

        render(<ContactEdit />)
        await screen.findByDisplayValue('Отдел продаж')

        expect(screen.queryByRole('button', { name: 'Сменить отдел' })).not.toBeInTheDocument()
    })
})
