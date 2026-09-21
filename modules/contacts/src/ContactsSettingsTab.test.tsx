import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

const apiGetContactsModuleSettings = vi.fn()
const apiPutContactsModuleSettings = vi.fn()
const toastPush = vi.fn()

let permissions = new Set<string>()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContactsModuleSettings: (...a: unknown[]) => apiGetContactsModuleSettings(...a),
    apiPutContactsModuleSettings: (...a: unknown[]) => apiPutContactsModuleSettings(...a),
    DEFAULT_CONTACTS_MODULE_SETTINGS: {
        defaultCountry: '7',
        trashTtlDays: 7,
        shadowTtlDays: 30,
        driftDetectionEnabled: true,
    },
}))

import ContactsSettingsTab from './ContactsSettingsTab'

const renderTab = (props: { projectId?: string; moduleDisabled?: boolean } = {}) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <ContactsSettingsTab projectId="p1" {...props} />
        </SWRConfig>,
    )

describe('ContactsSettingsTab', () => {
    beforeEach(() => {
        permissions = new Set(['project:manage'])
        apiGetContactsModuleSettings.mockReset()
        apiPutContactsModuleSettings.mockReset()
        toastPush.mockClear()
        apiGetContactsModuleSettings.mockResolvedValue({
            defaultCountry: '7',
            trashTtlDays: 7,
            shadowTtlDays: 30,
            driftDetectionEnabled: true,
        })
        apiPutContactsModuleSettings.mockResolvedValue({
            defaultCountry: '375',
            trashTtlDays: 14,
            shadowTtlDays: 30,
            driftDetectionEnabled: false,
        })
    })

    it('moduleDisabled — модуль выключен', () => {
        renderTab({ moduleDisabled: true })
        expect(screen.getByText(/Модуль «Контакты» выключен/)).toBeInTheDocument()
    })

    it('без projectId — «Проект не выбран»', () => {
        render(
            <SWRConfig value={{ provider: () => new Map() }}>
                <ContactsSettingsTab />
            </SWRConfig>,
        )
        expect(screen.getByText('Проект не выбран.')).toBeInTheDocument()
    })

    it('без project:manage — заглушка прав', () => {
        permissions = new Set()

        renderTab()

        expect(screen.getByText(/Нужно право project:manage/)).toBeInTheDocument()
    })

    it('ошибка загрузки настроек', async () => {
        apiGetContactsModuleSettings.mockRejectedValue(new Error('500'))

        renderTab()

        expect(await screen.findByText(/Не удалось загрузить настройки/)).toBeInTheDocument()
    })

    it('изменение формы и сохранение вызывают PUT и toast', async () => {
        renderTab()

        await waitFor(() =>
            expect(screen.getByText('Настройки модуля «Контакты»')).toBeInTheDocument(),
        )

        const countryInput = screen.getByPlaceholderText('7')
        fireEvent.change(countryInput, { target: { value: '375' } })

        const saveBtn = screen.getByRole('button', { name: 'Сохранить' })
        expect(saveBtn).not.toBeDisabled()

        fireEvent.click(saveBtn)

        await waitFor(() => expect(apiPutContactsModuleSettings).toHaveBeenCalledTimes(1))
        expect(apiPutContactsModuleSettings.mock.calls[0][1]).toMatchObject({
            defaultCountry: '375',
        })
        expect(toastPush).toHaveBeenCalled()
    })
})
