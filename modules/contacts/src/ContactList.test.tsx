import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Contact } from '@/@types/crm'

/**
 * TODO-173 — колонка «Компания» и CSV читали `contact.companyName`, которого BFF
 * не отдаёт (`mapContact` даёт только companyId/companyIds) → всегда «-».
 * EXTRA-CONTACTS-1 — кнопка экспорта клеила CSV из уже загруженной страницы
 * (10 строк), хотя `GET /v1/contacts/export` существует.
 * TODO-370 — список не проверял `contacts:read`, который требует сервер.
 * TODO-378 — «Поставить задачу» ставила задачу по ПЕРВОМУ выбранному, а выбор
 * сбрасывала целиком.
 */
const apiGetContacts = vi.fn()
const apiGetCompanies = vi.fn()
const apiExportContacts = vi.fn()
const apiCreateContact = vi.fn()
const apiGetMembers = vi.fn()
let keySeq = 0

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    Link: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: ({
        isOpen,
        taskInitialData,
    }: {
        isOpen?: boolean
        taskInitialData?: { contactIds?: string[] }
    }) =>
        isOpen ? (
            <div>
                Форма задачи открыта:{' '}
                {taskInitialData?.contactIds?.slice().sort().join(',') ?? 'без контактов'}
            </div>
        ) : null,
}))
const notifyError = vi.fn()
vi.mock('./contactsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifyError: (m: string) => notifyError(m),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContacts: (...a: unknown[]) => apiGetContacts(...a),
    apiGetCompanies: (...a: unknown[]) => apiGetCompanies(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    apiGetDealSources: () => Promise.resolve([]),
    apiCreateContact: (...a: unknown[]) => apiCreateContact(...a),
    apiFindContactDuplicates: vi.fn(),
    apiExportContacts: (...a: unknown[]) => apiExportContacts(...a),
    newIdempotencyKey: () => `key-${++keySeq}`,
}))

import ContactList from './ContactList'

const contact = (over: Partial<Contact> = {}): Contact => ({
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    // BFF по контакту отдаёт только companyId — названия компании в ответе НЕТ.
    companyId: 'co1',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

/** Свежий SWR-кэш на каждый рендер — иначе тест видит данные предыдущего кейса. */
const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('ContactList', () => {
    beforeEach(() => {
        permissions = new Set([
            'contacts:read',
            'contacts:write',
            'contacts:export',
            'contacts:manage',
        ])
        apiGetContacts.mockResolvedValue({ list: [contact()], total: 1 })
        apiGetCompanies.mockResolvedValue({
            list: [{ id: 'co1', name: 'ООО Ромашка' }],
            total: 1,
        })
        apiExportContacts.mockReset()
        apiExportContacts.mockResolvedValue(new Blob(['csv']))
        apiGetMembers.mockReset()
        apiGetMembers.mockResolvedValue([{ id: 'u1', name: 'Пётр Петров' }])
        apiCreateContact.mockReset()
        apiCreateContact.mockResolvedValue({ id: 'c9' })
        keySeq = 0
        notifyError.mockClear()
        // Экспорт скачивает файл кликом по <a download href="blob:…">. jsdom не
        // умеет download и трактует это как НАВИГАЦИЮ, которую планирует таймером:
        // «Not implemented: navigation» прилетает уже во время следующего теста и
        // роняет его на разрушенном document (флак «container is not defined» на
        // загруженной машине). Клик по якорю — граница браузера, глушим её.
        // restoreMocks: true в host/testing/vitest.shared.ts вернёт оригинал.
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    })

    /**
     * Ревью круга 2: apiGetMembers звался вообще без параметров, а BFF
     * (`crm-bff.controller.ts` → members) читает `@Query('projectId')` и при пустом
     * значении отдаёт `{ list: [] }` — фильтр «Ответственный» и селект владельца
     * были гарантированно пустыми.
     */
    it('участники запрашиваются с projectId (иначе BFF отдаёт пустой список)', async () => {
        render(<ContactList />)

        await waitFor(() => expect(apiGetMembers).toHaveBeenCalledWith({ projectId: 'p1' }))
    })

    /**
     * TODO-176: заголовок Idempotency-Key ехал, но ключ генерировался заново на
     * каждый вызов — повтор после таймаута заводил ВТОРОЙ контакт. Ключ обязан
     * жить попытку пользователя (открытый drawer), а не вызов функции.
     */
    it('TODO-176: повтор создания после ошибки шлёт ТОТ ЖЕ ключ, новая попытка — новый', async () => {
        render(<ContactList />)
        await screen.findByText('ООО Ромашка')

        // Drawer рисуется в портале — ищем по документу, а не по container.
        const q = (id: string) =>
            document.querySelector(`[data-qa-id="${id}"]`) as HTMLElement | null
        const openForm = async () => {
            fireEvent.click(q('contacts.list.create')!)
            await waitFor(() => expect(q('contacts.create.firstName')).toBeTruthy())
        }
        const fill = (first: string, last: string, email: string) => {
            fireEvent.change(q('contacts.create.firstName')!, { target: { value: first } })
            fireEvent.change(q('contacts.create.lastName')!, { target: { value: last } })
            fireEvent.change(q('contacts.create.email')!, { target: { value: email } })
        }

        await openForm()
        fill('Иван', 'Иванов', 'i@example.com')

        // Первая попытка падает (сеть/таймаут) — drawer остаётся открытым.
        apiCreateContact.mockRejectedValueOnce(new Error('timeout'))
        fireEvent.click(q('contacts.create.submit')!)
        await waitFor(() => expect(apiCreateContact).toHaveBeenCalledTimes(1))

        // Ретрай той же попытки — тот же ключ, домен реиграет ответ.
        fireEvent.click(q('contacts.create.submit')!)
        await waitFor(() => expect(apiCreateContact).toHaveBeenCalledTimes(2))
        const firstKey = apiCreateContact.mock.calls[0][2]
        expect(firstKey).toBeTruthy()
        expect(apiCreateContact.mock.calls[1][2]).toBe(firstKey)

        // Успех закрыл drawer → следующее создание это ДРУГАЯ попытка, ключ новый.
        await waitFor(() => expect(q('contacts.create.firstName')).toBeNull())
        await openForm()
        fill('Пётр', 'Петров', 'p@example.com')
        fireEvent.click(q('contacts.create.submit')!)

        await waitFor(() => expect(apiCreateContact).toHaveBeenCalledTimes(3))
        expect(apiCreateContact.mock.calls[2][2]).not.toBe(firstKey)
    }, 20_000)

    it('TODO-173: резолвит companyId в название компании в колонке «Компания»', async () => {
        render(<ContactList />)

        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
    })

    it('EXTRA-CONTACTS-1: без выделения экспорт уходит на сервер с текущим поиском', async () => {
        const createObjectURL = vi.fn(() => 'blob:x')
        const revokeObjectURL = vi.fn()
        Object.assign(URL, { createObjectURL, revokeObjectURL })

        const { container } = render(<ContactList />)
        await screen.findByText('ООО Ромашка')

        const exportBtn = container.querySelector(
            '[data-qa-id="contacts.list.exportAll"]',
        ) as HTMLElement
        expect(exportBtn).toBeTruthy()
        fireEvent.click(exportBtn)

        await waitFor(() =>
            expect(apiExportContacts).toHaveBeenCalledWith({
                projectId: 'p1',
                format: 'csv',
                query: undefined,
            }),
        )
        expect(createObjectURL).toHaveBeenCalled()
    })

    /**
     * Доработка EXTRA-CONTACTS-1: экспорт больше не режется молча — если выборка
     * больше потолка выгрузки, сервер отвечает 400 с причиной, и она обязана
     * доехать до пользователя (иначе кнопка снова «ничего не сказала»).
     */
    it('EXTRA-CONTACTS-1: причина отказа сервера показывается пользователем, а не глотается', async () => {
        apiExportContacts.mockRejectedValueOnce({
            response: {
                status: 400,
                data: { error: { message: 'под выгрузку попало 50001 контактов' } },
            },
        })

        const { container } = render(<ContactList />)
        await screen.findByText('ООО Ромашка')
        fireEvent.click(
            container.querySelector('[data-qa-id="contacts.list.exportAll"]') as HTMLElement,
        )

        await waitFor(() =>
            expect(notifyError).toHaveBeenCalledWith('под выгрузку попало 50001 контактов'),
        )
    })

    it('TODO-370: без contacts:read рисует экран «нет доступа» и не грузит список', async () => {
        permissions = new Set(['contacts:write'])

        render(<ContactList />)

        expect(await screen.findByText(/Раздел «Контакты» недоступен/)).toBeInTheDocument()
        expect(apiGetContacts).not.toHaveBeenCalled()
    })

    it('EXTRA-CONTACTS-3 зеркало: ссылка на импорт видна только с contacts:import', async () => {
        render(<ContactList />)
        await screen.findByText('ООО Ромашка')

        expect(screen.queryByTitle('Импорт контактов')).not.toBeInTheDocument()
    })

    it('TODO-378: массовая задача — drawer открывается и получает ВСЕ выбранные contactIds', async () => {
        apiGetContacts.mockResolvedValue({
            list: [contact(), contact({ id: 'c2', lastName: 'Петров' })],
            total: 2,
        })

        const { container } = render(<ContactList />)
        // Ждём отрисовки двух строк (по чекбоксам: заголовочный + две строки).
        const checkboxes = await waitFor(() => {
            const boxes = container.querySelectorAll('input[type="checkbox"]')
            if (boxes.length < 3) throw new Error('rows not rendered yet')
            return boxes
        })

        // Выделяем обе строки заголовочным чекбоксом.
        fireEvent.click(checkboxes[0])

        const taskBtn = await waitFor(() => {
            const el = container.querySelector('[data-qa-id="contacts.list.createTask"]')
            if (!el) throw new Error('task button not rendered')
            return el as HTMLElement
        })
        fireEvent.click(taskBtn)
        // Одна задача со связями на ОБА контакта — а не по первому и не «кнопка заблокирована».
        expect(await screen.findByText(/Форма задачи открыта: c1,c2/)).toBeInTheDocument()
    })
})
