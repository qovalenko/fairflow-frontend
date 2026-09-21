import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import EntityCreateDrawer from './EntityCreateDrawer'
import { useProjectStore } from '@/store/projectStore'
import {
    apiCreateDeal,
    apiGetPipelines,
    apiGetContacts,
    apiGetCompanies,
    apiGetMembers,
    apiGetDealSources,
} from '@/services/CrmService'

/**
 * TODO-114 / FR-SHELL-290: quick-create сделки из глобального «+» должен
 * вызывать POST /v1/deals, а не закрывать drawer через doCreate().
 */
vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: vi.fn(),
    apiGetContacts: vi.fn(),
    apiGetPipelines: vi.fn(),
    apiGetMembers: vi.fn(),
    apiGetDealSources: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiGetDeals: vi.fn(),
    apiGetOrders: vi.fn(),
    apiGetProducts: vi.fn(),
    apiCreateContact: vi.fn(),
    apiCreateCompany: vi.fn(),
    apiCreateDeal: vi.fn(),
    apiCreateOrder: vi.fn(),
    apiFindContactDuplicates: vi.fn(),
    apiCreateActivity: vi.fn(),
}))

vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))

const createDealMock = vi.mocked(apiCreateDeal)
const getPipelinesMock = vi.mocked(apiGetPipelines)
const getContactsMock = vi.mocked(apiGetContacts)
const getCompaniesMock = vi.mocked(apiGetCompanies)
const getMembersMock = vi.mocked(apiGetMembers)
const getDealSourcesMock = vi.mocked(apiGetDealSources)

const renderDrawer = () =>
    render(
        <MemoryRouter>
            <EntityCreateDrawer
                isOpen
                entityType="deal"
                onClose={() => undefined}
            />
        </MemoryRouter>,
    )

const fieldLabel = (text: string) => screen.getByText(text, { selector: 'label' })

describe('EntityCreateDrawer — создание сделки (TODO-114 / FR-SHELL-290)', () => {
    beforeEach(() => {
        getPipelinesMock.mockResolvedValue([
            { id: 'pl1', name: 'Основная', stages: [{ id: 's1', name: 'Новая' }] },
        ] as never)
        getContactsMock.mockResolvedValue({
            list: [{ id: 'c1', firstName: 'Иван', lastName: 'Петров' }],
            total: 1,
        } as never)
        getCompaniesMock.mockResolvedValue({
            list: [{ id: 'co1', name: 'ООО Ромашка' }],
            total: 1,
        } as never)
        getMembersMock.mockResolvedValue([{ id: 'u1', name: 'Менеджер' }] as never)
        getDealSourcesMock.mockResolvedValue([{ id: 'src1', name: 'Сайт' }] as never)
        createDealMock.mockResolvedValue({ id: 'deal-new' } as never)
        useProjectStore.setState({
            currentProjectId: 'p1',
            currentProject: {
                id: 'p1',
                name: 'Проект',
                enabledModules: ['deals'],
            },
        })
    })

    it(
        'отправляет apiCreateDeal с полями формы вместо mock doCreate()',
        async () => {
        const user = userEvent.setup()
        renderDrawer()

        await user.type(fieldLabel('Название сделки *').parentElement!.querySelector('input')!, 'Сделка из шапки')
        await user.type(fieldLabel('Сумма *').parentElement!.querySelector('input')!, '250000')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createDealMock).toHaveBeenCalled())
        expect(createDealMock.mock.calls[0][0]).toMatchObject({
            name: 'Сделка из шапки',
            amount: 250000,
        })
    },
    15000,
    )
})
