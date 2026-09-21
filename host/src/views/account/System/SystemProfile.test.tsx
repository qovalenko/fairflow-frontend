import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as CrmService from '@/services/CrmService'

const orgPermission = vi.fn((_subject: string, _action: string) => true)
const toastPush = vi.fn()

vi.mock('@/utils/hooks/useOrgPermission', () => ({
    default: () => orgPermission,
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({
        system: { role: 'platform_owner', name: 'Acme Corp' },
    }),
}))
vi.mock('@/utils/hooks/useNotifications', () => ({
    default: () => ({ unreadCount: 0 }),
}))
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import SystemProfile from './SystemProfile'

const sampleOrg: CrmService.OrganizationDetail = {
    id: 'org-1',
    name: 'Acme Corp',
    role: 'platform_owner',
    inn: '7701234567',
    email: 'info@acme.local',
}

describe('SystemProfile (SCR-MORG-PROFILE)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
        orgPermission.mockImplementation(() => true)
    })

    it('shows loading spinner while organization loads', () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockImplementation(() => new Promise(() => {}))

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        expect(screen.getByRole('heading', { name: 'Реквизиты' })).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error when organization load fails', async () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockRejectedValue(new Error('network'))

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        expect(
            await screen.findByText('Не удалось загрузить данные организации.'),
        ).toBeInTheDocument()
    })

    it('shows read-only view for employee without manage permission', async () => {
        orgPermission.mockImplementation((subject, action) => {
            if (subject === 'organization' && action === 'manage') return false
            return true
        })
        vi.spyOn(CrmService, 'apiGetOrganization').mockResolvedValue({
            ...sampleOrg,
            role: 'employee',
        })

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
        expect(screen.getByText('Сотрудник')).toBeInTheDocument()
        expect(
            screen.getByText('Для изменения настроек организации обратитесь к администратору.'),
        ).toBeInTheDocument()
        expect(screen.queryByLabelText('Редактировать')).not.toBeInTheDocument()
    })

    it('shows organization requisites for owner', async () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockResolvedValue(sampleOrg)

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        expect(await screen.findByText('7701234567')).toBeInTheDocument()
        expect(screen.getByText('info@acme.local')).toBeInTheDocument()
        expect(screen.getByLabelText('Редактировать')).toBeInTheDocument()
    })

    it('saves edited requisites after owner confirms changes', async () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockResolvedValue(sampleOrg)
        vi.spyOn(CrmService, 'apiUpdateOrganization').mockResolvedValue({
            ...sampleOrg,
            name: 'Acme Updated',
        })

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByLabelText('Редактировать'))
        const nameInput = screen.getByPlaceholderText('Название организации')
        await userEvent.clear(nameInput)
        await userEvent.type(nameInput, 'Acme Updated')
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

        expect(await screen.findByText('Acme Updated')).toBeInTheDocument()
        expect(CrmService.apiUpdateOrganization).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Acme Updated' }),
        )
    })

    it('shows save error when organization update fails', async () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockResolvedValue(sampleOrg)
        vi.spyOn(CrmService, 'apiUpdateOrganization').mockRejectedValue(new Error('network'))
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        await userEvent.click(await screen.findByLabelText('Редактировать'))
        const nameInput = screen.getByPlaceholderText('Название организации')
        await user.clear(nameInput)
        await user.type(nameInput, 'Acme Broken')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        expect(
            await screen.findByText('Не удалось сохранить изменения. Попробуйте позже.'),
        ).toBeInTheDocument()
    })

    it('uploads organization logo in edit mode', async () => {
        vi.spyOn(CrmService, 'apiGetOrganization').mockResolvedValue(sampleOrg)
        vi.spyOn(CrmService, 'apiCreateLogoUploadUrl').mockResolvedValue({
            uploadUrl: 'https://storage.test/logo',
            logoUrl: 'https://cdn.test/logo.png',
            objectKey: 'org/logo.png',
            expiresAt: 9999999999,
        })
        vi.spyOn(CrmService, 'apiUpdateOrganization').mockResolvedValue({
            ...sampleOrg,
            logoUrl: 'https://cdn.test/logo.png',
        })
        vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <SystemProfile />
            </MemoryRouter>,
        )

        await user.click(await screen.findByLabelText('Редактировать'))
        expect(screen.getByRole('button', { name: 'Загрузить логотип' })).toBeInTheDocument()

        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
        const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' })
        await user.upload(fileInput, logoFile)

        await waitFor(() => {
            expect(CrmService.apiCreateLogoUploadUrl).toHaveBeenCalledWith(
                expect.objectContaining({ contentType: 'image/png', fileName: 'logo.png' }),
            )
            expect(global.fetch).toHaveBeenCalledWith(
                'https://storage.test/logo',
                expect.objectContaining({ method: 'PUT' }),
            )
            expect(toastPush).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ placement: 'top-center' }),
            )
            expect(screen.getByAltText('Логотип')).toHaveAttribute(
                'src',
                'https://cdn.test/logo.png',
            )
        })
    })
})
