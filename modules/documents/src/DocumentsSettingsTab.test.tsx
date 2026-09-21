import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'

const apiGet = vi.fn()
const apiPut = vi.fn()
const toastPush = vi.fn()

let canManageProject = true
let canManageDocuments = true

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

vi.mock('@/services/ApiService', () => ({
    default: {
        fetchDataWithAxios: (opts: { method?: string; data?: unknown }) =>
            opts.method === 'put' ? apiPut(opts) : apiGet(opts),
    },
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => 'proj-1',
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (s: string, a: string) => {
        if (s === 'project' && a === 'manage') return canManageProject
        if (s === 'documents' && a === 'manage') return canManageDocuments
        return false
    },
}))

import DocumentsSettingsTab from './DocumentsSettingsTab'

const renderTab = (props: { projectId?: string; moduleDisabled?: boolean } = {}) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <DocumentsSettingsTab projectId="proj-1" {...props} />
        </SWRConfig>,
    )

describe('DocumentsSettingsTab (FR-DOCS-410)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        canManageProject = true
        canManageDocuments = true
        apiGet.mockResolvedValue({
            folderView: 'tree',
            downloadTtlSec: 900,
            storageProvider: 's3',
            maxTemplateSizeBytes: 10485760,
        })
        apiPut.mockResolvedValue({
            folderView: 'list',
            downloadTtlSec: 1200,
            storageProvider: 'minio',
            maxTemplateSizeBytes: 10485760,
        })
    })

    it('рендерит форму настроек и сохраняет merged payload', async () => {
        renderTab()

        await waitFor(() => {
            expect(screen.getByText('Персональные настройки')).toBeInTheDocument()
        })
        expect(screen.getByText('Интеграционные настройки')).toBeInTheDocument()

        const ttlInput = await screen.findByDisplayValue('900')
        fireEvent.change(ttlInput, { target: { value: '1200' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1))
        expect(apiPut.mock.calls[0]?.[0]).toMatchObject({
            method: 'put',
            data: expect.objectContaining({ downloadTtlSec: 1200 }),
        })
        expect(toastPush).toHaveBeenCalled()
    })

    it('без project:manage — NoPermissionState', async () => {
        canManageProject = false
        renderTab()
        expect(await screen.findByText('Раздел недоступен')).toBeInTheDocument()
    })

    it('moduleDisabled — ModuleDisabledState', () => {
        renderTab({ moduleDisabled: true })
        expect(screen.getByText(/Модуль «Документы» выключен/)).toBeInTheDocument()
    })

    it('ошибка загрузки — ErrorState с «Повторить»', async () => {
        apiGet.mockRejectedValue(new Error('fail'))
        renderTab()
        expect(await screen.findByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('без documents:manage — подсказка «Только просмотр»', async () => {
        canManageDocuments = false
        renderTab()
        await screen.findByText('Персональные настройки')
        expect(
            screen.getByText(/Только просмотр: для изменения интеграционных параметров/),
        ).toBeInTheDocument()
    })

    it('первичная загрузка: форма появляется после ответа API', async () => {
        let resolve!: (value: unknown) => void
        apiGet.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderTab()
        expect(screen.queryByText('Персональные настройки')).not.toBeInTheDocument()
        resolve({
            folderView: 'tree',
            downloadTtlSec: 900,
            storageProvider: 's3',
            maxTemplateSizeBytes: 10485760,
        })
        expect(await screen.findByText('Персональные настройки')).toBeInTheDocument()
    })

    it('ошибка сохранения показывает toast', async () => {
        apiPut.mockRejectedValue(new Error('save failed'))
        renderTab()
        const ttlInput = await screen.findByDisplayValue('900')
        fireEvent.change(ttlInput, { target: { value: '1200' } })
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(apiPut).toHaveBeenCalled())
        await waitFor(() => expect(toastPush).toHaveBeenCalled())
        const notification = toastPush.mock.calls.at(-1)?.[0] as {
            props?: { title?: string; type?: string }
        }
        expect(notification?.props?.title).toBe('Не удалось сохранить')
        expect(notification?.props?.type).toBe('danger')
    })
})
