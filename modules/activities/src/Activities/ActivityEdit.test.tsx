import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'

const apiGetActivity = vi.fn()
const apiCreateActivity = vi.fn()
const apiUpdateActivity = vi.fn()
const apiCompleteActivity = vi.fn()
const apiGetMembers = vi.fn()
const navigate = vi.fn()

const paramsRef = vi.hoisted(() => ({ id: undefined as string | undefined }))

let permissions = new Set<string>()

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
        useParams: () => ({ id: paramsRef.id }),
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({
        options: [{ value: 'd1', label: 'Отдел продаж' }],
        unavailable: false,
    }),
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string } }) => unknown) =>
        sel({ user: { userId: 'u1' } }),
}))
vi.mock('@/store/projectStore', () => ({
    useProjectStore: (sel: (s: { currentProject?: { moduleConfigs?: unknown[] } }) => unknown) =>
        sel({ currentProject: { moduleConfigs: [] } }),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetActivity: (...a: unknown[]) => apiGetActivity(...a),
    apiCreateActivity: (...a: unknown[]) => apiCreateActivity(...a),
    apiUpdateActivity: (...a: unknown[]) => apiUpdateActivity(...a),
    apiCompleteActivity: (...a: unknown[]) => apiCompleteActivity(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    newIdempotencyKey: () => 'create-key-1',
}))

import ActivityEdit from './ActivityEdit'

async function pickSelectOption(qaId: string, optionLabel: string) {
    const container = document.querySelector(`[data-qa-id="${qaId}"]`) as HTMLElement
    const input = container.querySelector('input.select__input') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' })
    const option = await waitFor(() => {
        const found = Array.from(document.querySelectorAll('[role="option"]')).find(
            (el) => el.textContent === optionLabel,
        )
        if (!found) throw new Error(`option ${optionLabel} not found`)
        return found
    })
    fireEvent.click(option)
}

const renderEdit = (route = '/activities/new') =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[route]}>
                <ActivityEdit />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ActivityEdit — создание', () => {
    beforeEach(() => {
        paramsRef.id = undefined
        permissions = new Set(['activities:write'])
        navigate.mockClear()
        apiGetMembers.mockResolvedValue([{ id: 'u1', name: 'Пётр Петров' }])
        apiCreateActivity.mockResolvedValue({ id: 'a-new', type: 'task', title: 'Новая задача' })
    })

    it('без activities:write показывает экран «Недостаточно прав»', () => {
        permissions = new Set(['activities:read'])
        renderEdit()

        expect(screen.getByText('Недостаточно прав')).toBeInTheDocument()
    })

    it('валидация: без названия не уходит в API', async () => {
        renderEdit()
        await screen.findByText('Новая активность')
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).not.toHaveBeenCalled())
    })

    it('создание задачи отправляет payload и переходит в карточку', async () => {
        renderEdit()

        await screen.findByText('Новая активность')
        const titleInput = screen.getAllByRole('textbox')[0]
        fireEvent.change(titleInput, { target: { value: 'Созвониться' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(apiCreateActivity.mock.calls[0][0]).toMatchObject({
            projectId: 'p1',
            type: 'task',
            title: 'Созвониться',
            assigneeId: 'u1',
        })
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/activities/a-new'))
    })

    it('?dueDate= из календаря предзаполняет срок задачи', async () => {
        renderEdit('/activities/new?dueDate=2026-08-25')

        await screen.findByText('Новая активность')
        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
        expect(dateInput.value).toBe('2026-08-25')
    })

    it('создание звонка отправляет type call и direction', async () => {
        renderEdit()
        await screen.findByText('Новая активность')

        await pickSelectOption('activities.edit.type', 'Звонок')
        const titleInput = screen.getAllByRole('textbox')[0]
        fireEvent.change(titleInput, { target: { value: 'Перезвонить' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(apiCreateActivity.mock.calls[0][0]).toMatchObject({
            type: 'call',
            title: 'Перезвонить',
            direction: 'outbound',
        })
    })

    it('создание заметки отправляет description без title', async () => {
        renderEdit()
        await screen.findByText('Новая активность')

        await pickSelectOption('activities.edit.type', 'Заметка')
        const noteArea = document.querySelector(
            '[data-qa-id="activities.edit.noteText"]',
        ) as HTMLTextAreaElement
        fireEvent.change(noteArea, { target: { value: 'Важная заметка' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(apiCreateActivity.mock.calls[0][0]).toMatchObject({
            type: 'note',
            description: 'Важная заметка',
        })
    })

    it('ошибка создания не уводит со страницы формы', async () => {
        apiCreateActivity.mockRejectedValue(new Error('fail'))
        renderEdit()
        await screen.findByText('Новая активность')

        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Задача' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(navigate).not.toHaveBeenCalled()
        expect(screen.getByText('Новая активность')).toBeInTheDocument()
    })

    it('валидация встречи: окончание раньше начала не уходит в API', async () => {
        renderEdit()
        await screen.findByText('Новая активность')

        await pickSelectOption('activities.edit.type', 'Встреча')
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Синк' } })
        fireEvent.change(
            document.querySelector('[data-qa-id="activities.edit.meetingStart"]') as HTMLInputElement,
            { target: { value: '2026-08-25T10:00' } },
        )
        fireEvent.change(
            document.querySelector('[data-qa-id="activities.edit.meetingEnd"]') as HTMLInputElement,
            { target: { value: '2026-08-25T09:00' } },
        )
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).not.toHaveBeenCalled())
    })

    it('встреча с участниками отправляет participants в payload', async () => {
        apiGetMembers.mockResolvedValue([
            { id: 'u1', name: 'Пётр Петров' },
            { id: 'u2', name: 'Анна Смирнова' },
        ])
        renderEdit()
        await screen.findByText('Новая активность')

        await pickSelectOption('activities.edit.type', 'Встреча')
        fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Синк' } })
        fireEvent.change(
            document.querySelector('[data-qa-id="activities.edit.meetingStart"]') as HTMLInputElement,
            { target: { value: '2026-08-25T10:00' } },
        )
        fireEvent.change(
            document.querySelector('[data-qa-id="activities.edit.meetingEnd"]') as HTMLInputElement,
            { target: { value: '2026-08-25T11:00' } },
        )

        const participantsContainer = document.querySelector(
            '[data-qa-id="activities.edit.participants"]',
        ) as HTMLElement
        const participantsInput = participantsContainer.querySelector(
            'input.select__input',
        ) as HTMLInputElement
        fireEvent.focus(participantsInput)
        fireEvent.keyDown(participantsInput, { key: 'ArrowDown', code: 'ArrowDown' })
        fireEvent.click(
            await waitFor(() => {
                const found = Array.from(document.querySelectorAll('[role="option"]')).find(
                    (el) => el.textContent === 'Анна Смирнова',
                )
                if (!found) throw new Error('participant option not found')
                return found
            }),
        )

        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiCreateActivity).toHaveBeenCalled())
        expect(apiCreateActivity.mock.calls[0][0]).toMatchObject({
            type: 'meeting',
            participants: ['u2'],
        })
    })
})

describe('ActivityEdit — редактирование', () => {
    beforeEach(() => {
        paramsRef.id = 'a1'
        permissions = new Set(['activities:write'])
        navigate.mockClear()
        apiGetMembers.mockResolvedValue([{ id: 'u1', name: 'Пётр Петров' }])
        apiGetActivity.mockResolvedValue({
            id: 'a1',
            type: 'task',
            title: 'Старая задача',
            status: 'planned',
            priority: 'medium',
            assigneeId: 'u1',
            createdAt: 0,
            updatedAt: 0,
        })
        apiUpdateActivity.mockResolvedValue({ id: 'a1' })
    })

    it('загружает существующую активность в форму', async () => {
        renderEdit('/activities/a1/edit')

        expect(await screen.findByDisplayValue('Старая задача')).toBeInTheDocument()
        expect(screen.getByText('Редактирование активности')).toBeInTheDocument()
    })

    it('ошибка загрузки — ST-6', async () => {
        apiGetActivity.mockRejectedValue(new Error('fail'))
        renderEdit('/activities/a1/edit')

        expect(await screen.findByText('Не удалось загрузить активности')).toBeInTheDocument()
    })

    it('loading — форма не показывается до ответа API', () => {
        apiGetActivity.mockReturnValue(new Promise(() => {}))
        const { unmount } = renderEdit('/activities/a1/edit')

        expect(screen.queryByText('Редактирование активности')).not.toBeInTheDocument()
        expect(screen.queryByDisplayValue('Старая задача')).not.toBeInTheDocument()

        unmount()
    })

    it('активность не найдена — кнопка возврата к списку', async () => {
        apiGetActivity.mockResolvedValue(null)
        renderEdit('/activities/a1/edit')

        expect(await screen.findByText('Активность не найдена')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к списку' }))
        expect(navigate).toHaveBeenCalledWith('/activities')
    })

    it('смена статуса на «Завершено» вызывает complete API', async () => {
        renderEdit('/activities/a1/edit')
        await screen.findByDisplayValue('Старая задача')

        await pickSelectOption('activities.edit.status', 'Завершено')
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(apiUpdateActivity).toHaveBeenCalled())
        await waitFor(() =>
            expect(apiCompleteActivity).toHaveBeenCalledWith('a1', {}, 'p1', 'create-key-1'),
        )
    })

    it('показывает блок результата для завершённой активности', async () => {
        apiGetActivity.mockResolvedValue({
            id: 'a1',
            type: 'task',
            title: 'Старая задача',
            status: 'completed',
            priority: 'medium',
            assigneeId: 'u1',
            result: 'Клиент согласился',
            createdAt: 0,
            updatedAt: 0,
        })
        renderEdit('/activities/a1/edit')

        expect(await screen.findByText('Результат')).toBeInTheDocument()
        expect(screen.getByText('Клиент согласился')).toBeInTheDocument()
    })

    it('несохранённые изменения — «Назад» спрашивает подтверждение', async () => {
        const confirmSpy = vi.spyOn(window, 'confirm')
        confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true)

        renderEdit('/activities/a1/edit')
        await screen.findByDisplayValue('Старая задача')

        fireEvent.change(screen.getAllByRole('textbox')[0], {
            target: { value: 'Изменённая задача' },
        })
        fireEvent.click(screen.getByTitle('Назад'))
        expect(navigate).not.toHaveBeenCalled()

        fireEvent.click(screen.getByTitle('Назад'))
        expect(navigate).toHaveBeenCalledWith(-1)

        confirmSpy.mockRestore()
    })
})
