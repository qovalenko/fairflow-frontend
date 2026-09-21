import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { SWRConfig } from 'swr'

const apiSearchQuery = vi.fn()
const apiGetSearchClientSettings = vi.fn()
const probeSearchHitAvailability = vi.fn()

let projectId: string | undefined = 'proj-1'
let searchPolicyFlags: Record<string, boolean> = {}

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => projectId,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
vi.mock('@/utils/hooks/useModulePolicy', () => ({
    default: (moduleId: string) => {
        const flags = moduleId === 'search' ? searchPolicyFlags : {}
        return {
            flags,
            flag: (key: string, defaultValue = true) =>
                key in flags ? flags[key] : defaultValue,
        }
    },
}))
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () => ({
        mode: 'all',
        level: 'custom',
        selfId: 'u1',
        departmentIds: ['d1'],
    }),
}))
vi.mock('@/services/SearchService', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/services/SearchService')>()
    return {
        ...actual,
        apiSearchQuery: (...a: unknown[]) => apiSearchQuery(...a),
        apiGetSearchClientSettings: (...a: unknown[]) =>
            apiGetSearchClientSettings(...a),
        probeSearchHitAvailability: (...a: unknown[]) =>
            probeSearchHitAvailability(...a),
    }
})

const toastPush = vi.fn()
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import SearchResults from './SearchResults'

const LocationProbe = () => {
    const loc = useLocation()
    return <div data-testid="loc">{loc.pathname}</div>
}

const hit = (id: string) => ({
    id: `contact:${id}`,
    entity_type: 'contact' as const,
    entity_id: id,
    title: `Иванов ${id}`,
    path: `/p/proj-1/contacts/${id}`,
    score: 1,
    updated_at: 1,
})

/** Ссылка на карточку хита — стабильный признак записи в DOM. */
const linkFor = (id: string) =>
    document.querySelector(`a[href="/contacts/${id}"]`)
const seeHit = (id: string) =>
    waitFor(() => expect(linkFor(id)).not.toBeNull(), { timeout: 3000 })

beforeEach(() => {
    projectId = 'proj-1'
    searchPolicyFlags = {}
    apiSearchQuery.mockReset()
    apiGetSearchClientSettings.mockReset()
    probeSearchHitAvailability.mockReset()
    toastPush.mockReset()
    apiGetSearchClientSettings.mockResolvedValue({
        minQueryChars: 2,
        perTypeLimit: 5,
        hotkeyEnabled: true,
        indexableTypes: ['contact'],
    })
})

describe('FR-SEARCH-110 stale hit from SearchResults', () => {
    it('открывает карточку, когда probe успешен', async () => {
        apiSearchQuery.mockResolvedValue({
            groups: [
                {
                    entity_type: 'contact',
                    type_total: 1,
                    list: [hit('ok')],
                },
            ],
            total: 1,
            total_by_type: { contact: 1 },
            has_more: false,
        })
        probeSearchHitAvailability.mockResolvedValue(true)

        render(
            <MemoryRouter initialEntries={['/search?q=ив']}>
                <SWRConfig value={{ provider: () => new Map() }}>
                    <SearchResults />
                    <LocationProbe />
                </SWRConfig>
            </MemoryRouter>,
        )

        await seeHit('ok')
        fireEvent.click(linkFor('ok') as HTMLElement)

        await waitFor(() =>
            expect(screen.getByTestId('loc').textContent).toBe('/contacts/ok'),
        )
        expect(probeSearchHitAvailability).toHaveBeenCalledWith(
            'proj-1',
            expect.objectContaining({ entity_id: 'ok' }),
        )
        expect(toastPush).not.toHaveBeenCalled()
    })

    it('не уводит на карточку при 403/404 probe — toast stale', async () => {
        apiSearchQuery.mockResolvedValue({
            groups: [
                {
                    entity_type: 'contact',
                    type_total: 1,
                    list: [hit('stale')],
                },
            ],
            total: 1,
            total_by_type: { contact: 1 },
            has_more: false,
        })
        probeSearchHitAvailability.mockResolvedValue(false)

        render(
            <MemoryRouter initialEntries={['/search?q=ив']}>
                <SWRConfig value={{ provider: () => new Map() }}>
                    <SearchResults />
                    <LocationProbe />
                </SWRConfig>
            </MemoryRouter>,
        )

        await seeHit('stale')
        fireEvent.click(linkFor('stale') as HTMLElement)

        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        expect(screen.getByTestId('loc').textContent).toBe('/search')
    })
})
