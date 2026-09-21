import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import * as PermissionService from '@/services/PermissionService'

import SystemRolesReference from './SystemRolesReference'

const renderRoles = (ui: React.ReactElement) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            {ui}
        </SWRConfig>,
    )

const systemAdmin: PermissionService.ProjectRoleDef = {
    id: 'role-admin',
    name: 'Администратор',
    kind: 'system',
    permissions: ['deals:read', 'deals:write', 'contacts:read'],
    memberCount: 3,
}

const systemViewer: PermissionService.ProjectRoleDef = {
    id: 'role-viewer',
    name: 'Наблюдатель',
    kind: 'system',
    permissions: ['deals:read'],
    memberCount: 1,
}

const customRole: PermissionService.ProjectRoleDef = {
    id: 'role-custom',
    name: 'Кастомная роль',
    kind: 'custom',
    permissions: ['deals:read'],
}

describe('SystemRolesReference (SCR-PRJSET-SYSTEM-ROLES)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('shows empty reference when project is not selected', () => {
        renderRoles(<SystemRolesReference />)

        expect(screen.getByRole('heading', { name: 'Системные роли' })).toBeInTheDocument()
        expect(screen.queryByText('системная')).not.toBeInTheDocument()
    })

    it('shows loading spinner while roles load', () => {
        vi.spyOn(PermissionService, 'apiGetProjectRoles').mockImplementation(
            () => new Promise(() => {}),
        )

        renderRoles(<SystemRolesReference projectId="proj-loading" />)

        expect(screen.getByText('Загрузка ролей…')).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error and retries after failed load', async () => {
        const apiSpy = vi
            .spyOn(PermissionService, 'apiGetProjectRoles')
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce([systemAdmin])
        const user = userEvent.setup()

        renderRoles(<SystemRolesReference projectId="proj-retry" />)

        expect(
            await screen.findByText('Не удалось загрузить справочник ролей.'),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Повторить' }))

        await waitFor(() => {
            expect(apiSpy).toHaveBeenCalledTimes(2)
            expect(screen.getByText('Администратор')).toBeInTheDocument()
        })
    })

    it('shows only system roles sorted by name', async () => {
        vi.spyOn(PermissionService, 'apiGetProjectRoles').mockResolvedValue([
            systemViewer,
            customRole,
            systemAdmin,
        ])

        renderRoles(<SystemRolesReference projectId="proj-filter" />)

        expect(await screen.findByText('Администратор')).toBeInTheDocument()
        expect(screen.getByText('Наблюдатель')).toBeInTheDocument()
        expect(screen.queryByText('Кастомная роль')).not.toBeInTheDocument()
        expect(screen.getAllByText('системная')).toHaveLength(2)
    })

    it('shows role hints and permission summary', async () => {
        vi.spyOn(PermissionService, 'apiGetProjectRoles').mockResolvedValue([systemAdmin])

        renderRoles(<SystemRolesReference projectId="proj-summary" />)

        expect(await screen.findByText('Администратор')).toBeInTheDocument()
        expect(
            screen.getByText('Управление настройками, участниками и доступом.'),
        ).toBeInTheDocument()
        expect(screen.getByText(/3 прав · 3 носителей/)).toBeInTheDocument()
        expect(screen.getByText(/^Умеет:/)).toBeInTheDocument()
    })
})
