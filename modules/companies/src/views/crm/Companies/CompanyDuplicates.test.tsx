import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

/**
 * Дедуп-подсказка компаний (TODO-362, контракт §3.12 / FR-MCOM-4).
 *
 * Регресс, который пинуется, — «домен умеет, а до пользователя не доходит»:
 *  1) ключ идентичности компании — ИНН ИЛИ домен, домен домен-сервис выводит из
 *     e-mail/сайта (deriveDomain), но фронт слал только ИНН — подсказка по
 *     e-mail/сайту не срабатывала никогда;
 *  2) домен намеренно возвращает и записи из корзины (`deleted: true`) — они держат
 *     ключ, поэтому сохранение упрётся в 409. Фронт флаг не читал: корзинный дубль
 *     выглядел обычным (клик вёл в «не найдено»), а выбор его лузером слияния падал,
 *     потому что merge работает только с живыми записями.
 */
const apiGetCompanies = vi.fn()
const apiGetMembers = vi.fn()
const apiFindCompanyDuplicates = vi.fn()
const apiRestoreCompany = vi.fn()
const apiGetCompany = vi.fn()
const apiGetCompanyCard = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: (...args: unknown[]) => apiGetCompanies(...args),
    apiGetMembers: (...args: unknown[]) => apiGetMembers(...args),
    apiFindCompanyDuplicates: (...args: unknown[]) => apiFindCompanyDuplicates(...args),
    apiRestoreCompany: (...args: unknown[]) => apiRestoreCompany(...args),
    apiGetCompany: (...args: unknown[]) => apiGetCompany(...args),
    apiGetCompanyCard: (...args: unknown[]) => apiGetCompanyCard(...args),
    apiCreateCompany: vi.fn(),
    apiDeleteCompany: vi.fn(),
    apiReassignCompanyOwner: vi.fn(),
    apiGetContacts: vi.fn(),
    apiGetDeals: vi.fn(),
    apiGetOrders: vi.fn(),
    apiGetActivities: vi.fn(),
    apiGetCompanyHistory: vi.fn(),
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({ options: [], unavailable: false }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string) => subject === 'companies' || subject === 'activities',
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { userId: string } }) => unknown) =>
        selector({ user: { userId: 'u1' } }),
}))
// toast монтирует свой портал (ToastWrapper) — в jsdom он падает на рендере и
// шумит Unhandled Error, при этом к проверяемому поведению отношения не имеет.
vi.mock('@/components/ui/toast', () => ({ default: { push: vi.fn() } }))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
// Кнопки-иконки подписаны только тултипом (он рисуется по ховеру) — подменяем на
// обычный title, чтобы тест кликал по человекочитаемому имени, а не по svg.
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
        <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useParams: () => ({ id: 'c1' }), useNavigate: () => vi.fn() }
})

const { default: CompanyList } = await import('./CompanyList')
const { default: CompanyDetails } = await import('./CompanyDetails')

const renderIn = (node: ReactNode) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies']}>{node}</MemoryRouter>
        </SWRConfig>,
    )

const openCreateDrawer = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('Компаний ещё нет')
    await user.click(screen.getByRole('button', { name: 'Создать компанию' }))
    return screen.findByPlaceholderText('email@example.com')
}

/**
 * Подсказка триггерится по `onBlur` поля. `user.tab()` внутри Drawer в jsdom
 * до обработчика не доходит (проверено: вызовов дедупа 0), поэтому расфокус
 * подаём событием напрямую — проверяем логику формы, а не поведение фокус-ловушки.
 */
const blurField = (el: HTMLElement) => fireEvent.blur(el)

describe('CompanyList — дедуп-подсказка по e-mail/сайту (TODO-362)', () => {
    beforeEach(() => {
        apiGetCompanies.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetMembers.mockReset().mockResolvedValue([])
        apiFindCompanyDuplicates.mockReset().mockResolvedValue({ candidates: [] })
        apiRestoreCompany.mockReset().mockResolvedValue({})
    })

    it(
        'шлёт e-mail и сайт, а не только ИНН',
        async () => {
        const user = userEvent.setup()
        renderIn(<CompanyList />)

        const emailInput = await openCreateDrawer(user)
        await user.type(emailInput, 'sales@alpha.ru')
        blurField(emailInput)

        expect(apiFindCompanyDuplicates).toHaveBeenCalledWith({
            projectId: 'proj-1',
            inn: undefined,
            email: 'sales@alpha.ru',
            website: undefined,
        })

        apiFindCompanyDuplicates.mockClear()
        const siteInput = screen.getByPlaceholderText('example.com')
        await user.type(siteInput, 'alpha.ru')
        blurField(siteInput)

        expect(apiFindCompanyDuplicates).toHaveBeenCalledWith({
            projectId: 'proj-1',
            inn: undefined,
            email: 'sales@alpha.ru',
            website: 'alpha.ru',
        })
    },
        15000,
    )

    it(
        'помечает кандидата из корзины и даёт его восстановить, а не «открыть»',
        async () => {
        apiFindCompanyDuplicates.mockResolvedValue({
            candidates: [
                { id: 'c-live', name: 'ООО Альфа', inn: '7700000001', matchReason: 'domain' },
                { id: 'c-trashed', name: 'ООО Альфа (старая)', matchReason: 'domain', deleted: true },
            ],
        })
        const user = userEvent.setup()
        renderIn(<CompanyList />)

        const emailInput = await openCreateDrawer(user)
        await user.type(emailInput, 'sales@alpha.ru')
        blurField(emailInput)

        expect(await screen.findByText('в корзине')).toBeInTheDocument()
        // Живой кандидат кликабелен (переход в карточку), корзинный — нет.
        expect(screen.getByRole('button', { name: 'ООО Альфа' })).toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'ООО Альфа (старая)' }),
        ).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Восстановить' }))

        expect(apiRestoreCompany).toHaveBeenCalledWith('c-trashed', undefined, {
            projectId: 'proj-1',
        })
    },
        15000,
    )
})

describe('CompanyDetails — кандидаты слияния (TODO-362)', () => {
    beforeEach(() => {
        apiGetMembers.mockReset().mockResolvedValue([])
        apiFindCompanyDuplicates.mockReset().mockResolvedValue({ candidates: [] })
        const company = {
            id: 'c1',
            name: 'ООО Ромашка',
            inn: '7700000001',
            email: 'sales@romashka.ru',
            website: 'romashka.ru',
            createdAt: 1_700_000_000,
            updatedAt: 1_700_000_000,
        }
        apiGetCompany.mockReset().mockResolvedValue(company)
        apiGetCompanyCard.mockReset().mockResolvedValue({
            company,
            contacts: [],
            deals: [],
            orders: [],
            activities: [],
            history: [],
            stats: {},
        })
    })

    it('ищет дубли и по e-mail/сайту, но корзинные в лузеры слияния не предлагает', async () => {
        apiFindCompanyDuplicates.mockResolvedValue({
            candidates: [
                { id: 'c1', name: 'ООО Ромашка', matchReason: 'inn' },
                { id: 'c2', name: 'Ромашка Торг', inn: '7700000002', matchReason: 'domain' },
                { id: 'c3', name: 'Ромашка (архив)', matchReason: 'domain', deleted: true },
            ],
        })
        const user = userEvent.setup()
        renderIn(<CompanyDetails />)

        await user.click(await screen.findByRole('button', { name: /Объединить дубль/ }))

        expect(apiFindCompanyDuplicates).toHaveBeenCalledWith({
            projectId: 'proj-1',
            inn: '7700000001',
            name: undefined,
            email: 'sales@romashka.ru',
            website: 'romashka.ru',
        })

        // Живой дубль предлагается, корзинный — нет (merge читает только живые),
        // но пользователь про него узнаёт из подсказки.
        expect(await screen.findByText('Ромашка Торг')).toBeInTheDocument()
        expect(screen.queryByText('Ромашка (архив)')).not.toBeInTheDocument()
        expect(screen.getByText(/1 похожая запись в корзине/)).toBeInTheDocument()
    })
})
