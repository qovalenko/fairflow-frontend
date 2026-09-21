import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import * as CrmService from '@/services/CrmService'

vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))
vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => () => true,
}))

import Directory from './Directory'

describe('Directory (SCR-MORG-DIRECTORY)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('shows loading spinner while colleague directory loads', () => {
        vi.spyOn(CrmService, 'apiGetColleagueDirectory').mockImplementation(
            () => new Promise(() => {}),
        )

        render(
            <MemoryRouter>
                <Directory />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Коллеги' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when directory load fails', async () => {
        vi.spyOn(CrmService, 'apiGetColleagueDirectory').mockRejectedValue(new Error('network'))

        render(
            <MemoryRouter>
                <Directory />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Не удалось загрузить директорию коллег'),
        ).toBeInTheDocument()
    })

    it('shows empty state when there are no colleagues', async () => {
        vi.spyOn(CrmService, 'apiGetColleagueDirectory').mockResolvedValue([])

        render(
            <MemoryRouter>
                <Directory />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Пока нет активных коллег в системе.'),
        ).toBeInTheDocument()
    })

    it('shows colleague rows after successful load', async () => {
        vi.spyOn(CrmService, 'apiGetColleagueDirectory').mockResolvedValue([
            {
                userId: 'u-1',
                name: 'Анна Смирнова',
                avatarUrl: '',
                position: 'Менеджер',
                departmentId: 'd-1',
                departmentName: 'Продажи',
                managerUserId: 'u-2',
                managerName: 'Иван Петров',
            },
        ])

        render(
            <MemoryRouter>
                <Directory />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Анна Смирнова')).toBeInTheDocument()
        expect(screen.getByText('Менеджер')).toBeInTheDocument()
        expect(screen.getByText('Продажи')).toBeInTheDocument()
        expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    })
})
