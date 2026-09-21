import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { DocumentGroup } from '@/services/DocumentsService'

const apiListDocuments = vi.fn()
const apiListTemplates = vi.fn()
const apiGetProjectMembers = vi.fn()

let permissions = new Set<string>()
let visibilityLevel: string | undefined = 'own_and_department'
const pidRef = vi.hoisted(() => ({ value: 'p-dept' }))

vi.mock('@/services/DocumentsService', () => ({
    apiListDocuments: (...a: unknown[]) => apiListDocuments(...a),
    apiListTemplates: (...a: unknown[]) => apiListTemplates(...a),
    contextRecordRoute: () => null,
    CONTEXT_LABELS: { deal: 'Сделка', order: 'Продажа', contact: 'Контакт', company: 'Компания', none: '—' },
}))
vi.mock('@/services/CrmService', () => ({
    apiGetProjectMembers: (...a: unknown[]) => apiGetProjectMembers(...a),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () =>
        visibilityLevel ? { level: visibilityLevel } : undefined,
}))
vi.mock('@/utils/hooks/useProjectMemberNames', () => ({
    default: () => ({ userName: (id: string) => (id === 'u2' ? 'Иван М.' : id) }),
}))

import DocumentsDept from './DocumentsDept'

const doc = (over: Partial<DocumentGroup> = {}): DocumentGroup => ({
    groupId: 'g1',
    projectId: 'p-dept',
    contextType: 'deal',
    contextRecordId: 'd1',
    name: 'Счёт на оплату',
    ownerId: 'u2',
    currentVersion: 1,
    generatedVia: 'manual',
    driftStale: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
})

const renderDept = (ui: ReactElement = <DocumentsDept />) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={['/documents/department']}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('DocumentsDept', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        permissions = new Set(['documents:read'])
        visibilityLevel = 'own_and_department'
        pidRef.value = 'p-dept'
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        apiListTemplates.mockResolvedValue({ items: [{ id: 't1', name: 'Договор' }] })
        apiGetProjectMembers.mockResolvedValue([
            { id: 'u2', name: 'Иван М.', email: 'ivan@test.ru' },
        ])
    })

    it('без documents:read — NoPermissionState', () => {
        permissions = new Set()
        renderDept()
        expect(screen.getByText('Нет права documents:read.')).toBeInTheDocument()
    })

    it('visibility only_own блокирует управленческий срез', () => {
        visibilityLevel = 'only_own'
        renderDept()
        expect(
            screen.getByText('Сводный журнал доступен руководящим ролям с подчинёнными.'),
        ).toBeInTheDocument()
    })

    it('пустой журнал — «За период нет документов отдела»', async () => {
        renderDept()
        expect(await screen.findByText('За период нет документов отдела.')).toBeInTheDocument()
    })

    it('ошибка загрузки — ErrorState', async () => {
        apiListDocuments.mockRejectedValue(new Error('fail'))
        renderDept()
        expect(await screen.findByText('Не удалось загрузить документы отдела')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('рендерит таблицу и KPI при данных', async () => {
        apiListDocuments.mockResolvedValue({
            list: [doc(), doc({ groupId: 'g2', name: 'Акт сверки', ownerId: 'u3', driftStale: false })],
            total: 2,
        })
        renderDept()
        expect(await screen.findAllByText('Счёт на оплату')).toHaveLength(1)
        expect(screen.getByText('Иван М.')).toBeInTheDocument()
        expect(screen.getByText(/выпущено за период \(в scope\)/)).toBeInTheDocument()
        expect(screen.getByText(/с устаревшими реквизитами/)).toBeInTheDocument()
    })

    it('KPI drift включает фильтр hasDrift', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderDept()
        await screen.findByText('Счёт на оплату')
        await user.click(screen.getByText(/с устаревшими реквизитами/))
        await waitFor(() => {
            expect(
                apiListDocuments.mock.calls.some((c) => c[0]?.hasDrift === true),
            ).toBe(true)
        })
    })

    it('активный фильтр без результатов — «Ничего не найдено»', async () => {
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        renderDept()
        await screen.findByText('За период нет документов отдела.')
        fireEvent.click(screen.getByLabelText('Есть drift'))
        expect(await screen.findByText('Ничего не найдено.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })

    it('первичная загрузка: журнал появляется после ответа API', async () => {
        let resolve!: (value: { list: DocumentGroup[]; total: number }) => void
        apiListDocuments.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderDept()
        expect(screen.queryByText('За период нет документов отдела.')).not.toBeInTheDocument()
        resolve({ list: [], total: 0 })
        expect(await screen.findByText('За период нет документов отдела.')).toBeInTheDocument()
    })
})
