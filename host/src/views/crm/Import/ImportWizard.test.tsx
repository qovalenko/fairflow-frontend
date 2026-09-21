import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportWizard from './ImportWizard'

/**
 * TODO-171 — мастер импорта принимал .xlsx/.xls «на разбор бэкендом», которого
 * нет: `contact.grpc.controller.ts` читает `file_content.toString('utf8')` и
 * режет по [,;], то есть zip-контейнер xlsx превращался в мусор, а импорт
 * «проходил» с нулевым результатом. Мастер обязан отсекать бинарь на входе.
 */
vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
const apiImportContacts = vi.fn(
    (_fd: FormData, _params?: { projectId?: string }, _idempotencyKey?: string) =>
        Promise.resolve({ created: 1 }),
)

vi.mock('@/services/CrmService', () => ({
    apiImportContacts: (fd: FormData, params?: { projectId?: string }, key?: string) =>
        apiImportContacts(fd, params, key),
    newIdempotencyKey: () => `key-${++keySeq}`,
}))

let keySeq = 0

const fileInput = (container: HTMLElement) =>
    container.querySelector('#import-file') as HTMLInputElement

const uploadFile = (container: HTMLElement, name: string, content: string) => {
    const input = fileInput(container)
    const file = new File([content], name, { type: 'text/plain' })
    // jsdom не реализует Blob#text() — мастер читает файл именно им.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) })
    fireEvent.change(input, { target: { files: [file] } })
    return file
}

describe('ImportWizard — приём файлов (TODO-171)', () => {
    it('принимает только .csv в accept и не обещает Excel в подсказке', () => {
        const { container } = render(<ImportWizard entityType="contacts" />)

        expect(fileInput(container).accept).toBe('.csv,text/csv')
        expect(container.textContent).not.toMatch(/xlsx/i)
        expect(container.textContent).not.toMatch(/Excel/i)
    })

    it('.xlsx отклоняется с понятной ошибкой и не пускает на шаг «Соответствие колонок»', async () => {
        const { container } = render(<ImportWizard entityType="contacts" />)

        uploadFile(container, 'contacts.xlsx', 'PKbinary')

        await waitFor(() =>
            expect(screen.getByText(/Формат Excel не поддерживается/i)).toBeInTheDocument(),
        )
        // Кнопка «Далее» не уводит с шага «Файл» (Button рисует disabled стилем,
        // поэтому проверяем поведение, а не атрибут).
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        expect(screen.getByRole('heading', { name: 'Загрузите файл' })).toBeInTheDocument()
        expect(
            screen.queryByRole('heading', { name: 'Соответствие колонок' }),
        ).not.toBeInTheDocument()
    })

    it('корректный CSV парсится и открывает шаг «Далее»', async () => {
        const { container } = render(<ImportWizard entityType="contacts" />)

        uploadFile(container, 'contacts.csv', 'firstName,lastName\nИван,Иванов\n')

        await waitFor(() => expect(screen.getByText(/Строк данных: 1/)).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        expect(
            screen.getByRole('heading', { name: 'Соответствие колонок' }),
        ).toBeInTheDocument()
    })

    it('шаг «Соответствие колонок» предлагает только поля из серверного allowlist', async () => {
        // Мастер обязан предлагать ровно то, что примет сервер: gateway
        // `IMPORT_MAPPABLE_CONTACT_FIELDS` = домен `IMPORTABLE_CONTACT_FIELDS`.
        // Лишнее поле — приманка: пользователь его размечает, а домен отклоняет
        // ВЕСЬ файл (так было с `companyName`, которого у контакта нет —
        // связь с компанией это `companyIds`).
        const ALLOWED = [
            'firstName',
            'lastName',
            'middleName',
            'phone',
            'email',
            'position',
            'source',
            'notes',
            'tags',
        ]
        const { container } = render(<ImportWizard entityType="contacts" />)
        uploadFile(container, 'contacts.csv', 'firstName,lastName\nИван,Иванов\n')
        await waitFor(() => expect(screen.getByText(/Строк данных: 1/)).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

        const offered = Array.from(container.querySelectorAll('label'))
            .map((el) => el.textContent?.trim() ?? '')
            .filter((t) => /^[a-zA-Z]+$/.test(t))
        expect(offered.length).toBeGreaterThan(0)
        expect(offered).not.toContain('companyName')
        expect(offered.filter((f) => !ALLOWED.includes(f))).toEqual([])
    })

    it('TODO-176: повтор импорта того же файла переиспользует ключ идемпотентности', async () => {
        apiImportContacts.mockRejectedValueOnce(new Error('network'))

        const { container } = render(<ImportWizard entityType="contacts" />)
        uploadFile(container, 'contacts.csv', 'firstName,lastName\nИван,Иванов\n')
        await waitFor(() => expect(screen.getByText(/Строк данных: 1/)).toBeInTheDocument())

        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

        const run = screen.getByRole('button', { name: 'Запустить импорт' })
        fireEvent.click(run)
        await waitFor(() => expect(apiImportContacts).toHaveBeenCalledTimes(1))
        fireEvent.click(run)
        await waitFor(() => expect(apiImportContacts).toHaveBeenCalledTimes(2))

        const firstKey = apiImportContacts.mock.calls[0][2]
        const secondKey = apiImportContacts.mock.calls[1][2]
        expect(firstKey).toBeTruthy()
        expect(secondKey).toBe(firstKey)
    })
})
