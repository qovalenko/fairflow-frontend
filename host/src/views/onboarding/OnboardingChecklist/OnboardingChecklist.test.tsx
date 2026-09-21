import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import { useProjectStore } from '@/store/projectStore'

const apiGetContacts = vi.fn()
const apiGetDeals = vi.fn()
const apiGetInvitations = vi.fn()

let permissions: Record<string, boolean> = {
    'contacts:write': true,
    'deals:write': true,
}

vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject?: string, action?: string) => {
        if (typeof subject === 'string' && typeof action === 'string') {
            return permissions[`${subject}:${action}`] ?? false
        }
        return (s: string, a: string) => permissions[`${s}:${a}`] ?? false
    },
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContacts: (...a: unknown[]) => apiGetContacts(...a),
    apiGetDeals: (...a: unknown[]) => apiGetDeals(...a),
    apiGetInvitations: (...a: unknown[]) => apiGetInvitations(...a),
}))

import OnboardingChecklist from './OnboardingChecklist'

describe('OnboardingChecklist (FR-ONB-14)', () => {
    beforeEach(() => {
        permissions = { 'contacts:write': true, 'deals:write': true }
        apiGetContacts.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetDeals.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetInvitations.mockReset().mockResolvedValue([])
        useProjectStore.setState({
            currentProject: {
                id: 'p-1',
                name: 'Demo',
                enabledModules: ['contacts', 'deals'],
            },
            currentProjectId: 'p-1',
        })
    })

    const renderChecklist = () =>
        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                    <OnboardingChecklist />
                </SWRConfig>
            </MemoryRouter>,
        )

    it('returns null without current project', () => {
        useProjectStore.setState({ currentProject: null, currentProjectId: null })
        const { container } = renderChecklist()
        expect(container).toBeEmptyDOMElement()
    })

    it('renders checklist items with progress once signals resolve', async () => {
        renderChecklist()
        expect(
            await screen.findByRole('heading', { name: 'Первые шаги' }),
        ).toBeInTheDocument()
        expect(screen.getByText('Готово! Проект «Demo» создан')).toBeInTheDocument()
        expect(screen.getByText('Добавить первый контакт')).toBeInTheDocument()
        expect(screen.getByText('Создать первую сделку')).toBeInTheDocument()
        expect(screen.getByText('Пригласить коллегу')).toBeInTheDocument()
    })

    it('hides module-gated items when module is disabled', async () => {
        useProjectStore.setState({
            currentProject: {
                id: 'p-1',
                name: 'Demo',
                enabledModules: ['contacts'],
            },
            currentProjectId: 'p-1',
        })
        renderChecklist()
        expect(await screen.findByText('Добавить первый контакт')).toBeInTheDocument()
        expect(screen.queryByText('Создать первую сделку')).toBeNull()
    })

    it('auto-hides after dismiss click', async () => {
        renderChecklist()
        expect(
            await screen.findByRole('heading', { name: 'Первые шаги' }),
        ).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }))
        await waitFor(() =>
            expect(
                screen.queryByRole('heading', { name: 'Первые шаги' }),
            ).not.toBeInTheDocument(),
        )
    })

    it('shows provisioning loader on deal step', async () => {
        render(
            <MemoryRouter>
                <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                    <OnboardingChecklist provisioning />
                </SWRConfig>
            </MemoryRouter>,
        )
        expect(await screen.findByText('Настраиваем ваш проект…')).toBeInTheDocument()
    })
})
