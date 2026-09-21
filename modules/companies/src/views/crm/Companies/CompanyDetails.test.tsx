import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

/**
 * Карточка компании: связанные сущности берутся ОДНИМ композитом (TODO-155,
 * FR-MCOM-2 / контракт §3.3).
 *
 * Регресс, который пинуется: экран тянул четыре списка проекта целиком
 * (`/v1/contacts`, `/v1/deals`, `/v1/orders`, `/v1/activities` с pageSize:1000)
 * и фильтровал их по company.id в памяти — трафик всего проекта на каждую
 * карточку, потолок в 1000 записей и счётчики «по длине выдачи». Композит
 * GET /v1/companies/:id/card на gateway уже существовал и не использовался.
 *
 * Проверяем оба конца: (1) шлём ровно один запрос карточки с projectId из
 * контекста проекта; (2) всё, что пришло в ответе, доезжает до виджетов, а
 * счётчики шапки берутся из `stats` домена, а не из длины отданных списков.
 */
const apiGetCompany = vi.fn()
const apiGetCompanyCard = vi.fn()
const apiGetMembers = vi.fn()
const apiGetContacts = vi.fn()
const apiGetDeals = vi.fn()
const apiGetOrders = vi.fn()
const apiGetActivities = vi.fn()
const apiGetCompanyHistory = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetCompany: (...args: unknown[]) => apiGetCompany(...args),
    apiGetCompanyCard: (...args: unknown[]) => apiGetCompanyCard(...args),
    apiGetMembers: (...args: unknown[]) => apiGetMembers(...args),
    apiDeleteCompany: vi.fn(),
    apiRestoreCompany: vi.fn(),
    apiReassignCompanyOwner: vi.fn(),
    apiFindCompanyDuplicates: vi.fn(),
    // Легаси-пути: не должны дёргаться вообще (иначе двойная загрузка).
    apiGetContacts: (...args: unknown[]) => apiGetContacts(...args),
    apiGetDeals: (...args: unknown[]) => apiGetDeals(...args),
    apiGetOrders: (...args: unknown[]) => apiGetOrders(...args),
    apiGetActivities: (...args: unknown[]) => apiGetActivities(...args),
    apiGetCompanyHistory: (...args: unknown[]) => apiGetCompanyHistory(...args),
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => 'proj-1',
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'companies' && (action === 'read' || action === 'write'),
}))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({
    default: () => null,
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: () => null,
}))
/** Прозрачный дублёр виджета активностей — проверяем фильтрацию в CompanyDetails. */
vi.mock('@fairflow/shared-ui', () => ({
    CompanyActivitiesWidget: ({
        activities,
    }: {
        activities: Array<{ id: string; title: string }>
    }) => (
        <ul>
            {activities.map((a) => (
                <li key={a.id}>{a.title}</li>
            ))}
        </ul>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useParams: () => ({ id: 'c1' }), useNavigate: () => vi.fn() }
})

const { default: CompanyDetails } = await import('./CompanyDetails')

const company = {
    id: 'c1',
    name: 'ООО Ромашка',
    inn: '7700000001',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

/** Ответ композита: списки СПЕЦИАЛЬНО короче, чем счётчики в stats. */
const card = {
    company,
    contacts: [
        {
            id: 'ct1',
            firstName: 'Иван',
            lastName: 'Петров',
            companyIds: ['c1', 'c9'],
            createdAt: 0,
            updatedAt: 0,
        },
    ],
    deals: [
        { id: 'd1', name: 'Сделка А', amount: 100, currency: 'RUB', stageName: 'Новая', result: 'won' },
        { id: 'd2', name: 'Сделка Б', amount: 50, currency: 'RUB', stageName: 'Работа' },
    ],
    orders: [{ id: 'o1', number: 'ORD-7', typeName: 'Поставка', stageName: 'Оформление', status: 'active' }],
    activities: [
        { id: 'a1', type: 'task', title: 'Позвонить клиенту', status: 'planned', dueDate: 1_700_000_100 },
        { id: 'a2', type: 'task', title: 'Закрытая задача', status: 'completed', dueDate: 1_700_000_200 },
    ],
    history: [
        {
            id: 'h1',
            type: 'company.updated',
            userId: 'u1',
            userName: 'Мария',
            timestamp: 1_700_000_000,
            summary: 'Компания изменена',
            changedFields: [{ field: 'name', old: 'Старое', new: 'ООО Ромашка' }],
        },
    ],
    stats: { dealsTotal: 7, dealsWon: 4, ordersTotal: 3, contactsCount: 5 },
}

const renderDetails = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies/c1']}>
                <CompanyDetails />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyDetails — композит карточки', () => {
    beforeEach(() => {
        apiGetCompany.mockReset().mockResolvedValue(company)
        apiGetCompanyCard.mockReset().mockResolvedValue(card)
        apiGetMembers.mockReset().mockResolvedValue([])
        apiGetContacts.mockReset()
        apiGetDeals.mockReset()
        apiGetOrders.mockReset()
        apiGetActivities.mockReset()
        apiGetCompanyHistory.mockReset()
    })

    it('делает один запрос карточки и не тянет списки проекта', async () => {
        renderDetails()

        expect(await screen.findByText('Сделка А')).toBeInTheDocument()

        expect(apiGetCompanyCard).toHaveBeenCalledTimes(1)
        expect(apiGetCompanyCard).toHaveBeenCalledWith('c1', { projectId: 'proj-1' })
        // Ни одного «списка на 1000 с фильтром в памяти» и отдельного запроса истории.
        expect(apiGetContacts).not.toHaveBeenCalled()
        expect(apiGetDeals).not.toHaveBeenCalled()
        expect(apiGetOrders).not.toHaveBeenCalled()
        expect(apiGetActivities).not.toHaveBeenCalled()
        expect(apiGetCompanyHistory).not.toHaveBeenCalled()
    })

    it('раскладывает блоки ответа по виджетам (связи, задачи, история)', async () => {
        renderDetails()

        // Сделки и продажи — как пришли, без клиентской фильтрации.
        expect(await screen.findByText('Сделка А')).toBeInTheDocument()
        expect(screen.getByText('Сделка Б')).toBeInTheDocument()
        expect(screen.getByText('ORD-7')).toBeInTheDocument()
        // Контакт из M:M-связи (companyIds содержит c1).
        expect(screen.getByText(/Иван Петров/)).toBeInTheDocument()
        // Активности: показываются только незавершённые.
        expect(screen.getByText('Позвонить клиенту')).toBeInTheDocument()
        expect(screen.queryByText('Закрытая задача')).not.toBeInTheDocument()
        // История приехала тем же композитом.
        // (summary попадает и в заголовок события, и в описание — потому AllBy)
        expect(screen.getAllByText('Компания изменена').length).toBeGreaterThan(0)
    })

    it('берёт счётчики шапки из stats домена, а не из длины списков', async () => {
        const { container } = renderDetails()

        expect(await screen.findByText('Сделка А')).toBeInTheDocument()

        const statValue = (label: string) => {
            const labelEl = Array.from(container.querySelectorAll('div')).find(
                (el) => el.textContent === label,
            )
            return labelEl?.parentElement?.querySelector('div.text-lg')?.textContent ?? ''
        }

        // stats.dealsTotal = 7 при двух отданных сделках, stats.ordersTotal = 3 при одной.
        expect(statValue('Сделок')).toBe('7')
        expect(statValue('Продаж')).toBe('3')
        // Суммы считаются по отданным сделкам: 100 + 50 и 100 (won).
        expect(statValue('Сумма сделок').replace(/\s/g, '')).toContain('150')
        expect(statValue('Оборот').replace(/\s/g, '')).toContain('100')
    })

    /**
     * `stats.contactsTruncated` — единственный признак того, что связи контактов
     * неполные (свип на gateway ограничен потолком страниц). Если карточка его не
     * читает, пользователь видит заниженное число молча.
     */
    it('доводит stats.contactsTruncated до карточки, а без флага молчит', async () => {
        const { unmount } = renderDetails()

        expect(await screen.findByText(/Иван Петров/)).toBeInTheDocument()
        expect(screen.queryByText(/Показаны не все связи/)).not.toBeInTheDocument()
        unmount()

        apiGetCompanyCard.mockResolvedValue({
            ...card,
            stats: { ...card.stats, contactsTruncated: true },
        })
        renderDetails()

        expect(await screen.findByText(/Показаны не все связи/)).toBeInTheDocument()
        // Счётчик секции подписан как нижняя граница.
        expect(screen.getByText('1+')).toBeInTheDocument()
    })
})
