import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as CrmService from '@/services/CrmService'

const toastPush = vi.fn()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

import OffboardDrawer from './OffboardDrawer'

const sampleEmployee: CrmService.OrgEmployee = {
    id: 'emp-1',
    userId: 'u-1',
    role: 'platform_admin',
    departmentId: null,
    name: 'Иван Петров',
    email: 'ivan@acme.local',
    avatarUrl: '',
}

const samplePreview: CrmService.OffboardPreview = {
    userId: 'u-1',
    name: 'Иван Петров',
    projects: [{ projectId: 'proj-1', projectName: 'CRM Acme' }],
    reassign: [],
    isOwner: false,
    partial: true,
}

const reassignEmployee: CrmService.OrgEmployee = {
    id: 'emp-2',
    userId: 'u-2',
    role: 'employee',
    departmentId: null,
    name: 'Мария Сидорова',
    email: 'maria@acme.local',
    avatarUrl: '',
    isActive: true,
}

describe('OffboardDrawer (SCR-MORG-EMPLOYEE-OFFBOARD)', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        toastPush.mockReset()
    })

    it('shows loading spinner while offboard preview loads', () => {
        vi.spyOn(CrmService, 'apiGetOffboardPreview').mockImplementation(
            () => new Promise(() => {}),
        )
        vi.spyOn(CrmService, 'apiGetEmployees').mockImplementation(() => new Promise(() => {}))

        render(
            <OffboardDrawer
                isOpen
                employee={sampleEmployee}
                onClose={vi.fn()}
                onDone={vi.fn()}
            />,
        )

        expect(screen.getByText(/Увольнение: Иван Петров/)).toBeInTheDocument()
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows error and retries preview load', async () => {
        const previewSpy = vi
            .spyOn(CrmService, 'apiGetOffboardPreview')
            .mockRejectedValueOnce(new Error('network'))
            .mockResolvedValueOnce(samplePreview)
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([reassignEmployee])
        const user = userEvent.setup()

        render(
            <OffboardDrawer
                isOpen
                employee={sampleEmployee}
                onClose={vi.fn()}
                onDone={vi.fn()}
            />,
        )

        expect(
            await screen.findByText('Не удалось рассчитать последствия увольнения.'),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Повторить' }))

        expect(await screen.findByText('CRM Acme')).toBeInTheDocument()
        expect(previewSpy).toHaveBeenCalledTimes(2)
    })

    it('shows preview with project access loss and completes offboard', async () => {
        vi.spyOn(CrmService, 'apiGetOffboardPreview').mockResolvedValue(samplePreview)
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([reassignEmployee])
        vi.spyOn(CrmService, 'apiOffboardEmployee').mockResolvedValue({
            ok: true,
            reassigned: 2,
            unassigned: 0,
            processing: true,
        })
        const onClose = vi.fn()
        const onDone = vi.fn()
        const user = userEvent.setup()

        render(
            <OffboardDrawer
                isOpen
                employee={sampleEmployee}
                onClose={onClose}
                onDone={onDone}
            />,
        )

        expect(await screen.findByText('CRM Acme')).toBeInTheDocument()
        expect(
            screen.getByText(/Точное число записей на переназначение заранее не рассчитывается/),
        ).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Уволить' }))

        expect(await screen.findByText('Сотрудник уволен')).toBeInTheDocument()
        expect(screen.getByText(/текущему администратору/)).toBeInTheDocument()
        expect(screen.getByText(/Переназначено:/)).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Готово' }))

        expect(onClose).toHaveBeenCalled()
        expect(onDone).toHaveBeenCalled()
    })

    it('disables offboard button for organization owner', async () => {
        vi.spyOn(CrmService, 'apiGetOffboardPreview').mockResolvedValue({
            ...samplePreview,
            isOwner: true,
        })
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])

        render(
            <OffboardDrawer
                isOpen
                employee={sampleEmployee}
                onClose={vi.fn()}
                onDone={vi.fn()}
            />,
        )

        expect(await screen.findByText('CRM Acme')).toBeInTheDocument()
        const offboardButton = screen.getByRole('button', { name: 'Уволить' })
        expect(offboardButton).toHaveAttribute('title', 'Владельца организации нельзя уволить')
        expect(offboardButton.className).toMatch(/cursor-not-allowed/)
    })

    it('shows danger toast when offboard mutation returns 409', async () => {
        vi.spyOn(CrmService, 'apiGetOffboardPreview').mockResolvedValue(samplePreview)
        vi.spyOn(CrmService, 'apiGetEmployees').mockResolvedValue([])
        vi.spyOn(CrmService, 'apiOffboardEmployee').mockRejectedValue({
            response: { status: 409 },
        })
        const user = userEvent.setup()

        render(
            <OffboardDrawer
                isOpen
                employee={sampleEmployee}
                onClose={vi.fn()}
                onDone={vi.fn()}
            />,
        )

        await screen.findByText('CRM Acme')
        await user.click(screen.getByRole('button', { name: 'Уволить' }))

        await waitFor(() => {
            expect(toastPush).toHaveBeenCalled()
            const notification = toastPush.mock.calls.at(-1)?.[0] as {
                props: { title: string; children: string }
            }
            expect(notification.props.title).toBe('Не удалось')
            expect(notification.props.children).toBe('Владельца организации нельзя уволить.')
        })
    })
})
