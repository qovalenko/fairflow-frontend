import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiGetProject = vi.fn()
const apiUpdateProjectSettings = vi.fn()
const apiMyVisibilitySummary = vi.fn()
vi.mock('@/services/CrmService', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/services/CrmService')>()),
    apiGetProject: (...a: unknown[]) => apiGetProject(...a),
    apiUpdateProjectSettings: (...a: unknown[]) => apiUpdateProjectSettings(...a),
    apiMyVisibilitySummary: (...a: unknown[]) => apiMyVisibilitySummary(...a),
}))

vi.mock('@/utils/hooks/usePermission', () => ({
    default: (s?: string, a?: string) =>
        typeof s === 'string' && typeof a === 'string' ? true : () => true,
    useRequiresPermission: () => true,
}))

vi.mock('@/utils/hooks/useRefreshModules', () => ({
    default: () => vi.fn(),
    platformModulesSwrKey: (id: string) => ['platform/modules', id],
}))

vi.mock('@/utils/loadRemoteComponent', () => ({
    getSlotComponentLoader: () => null,
    hasSlotComponent: () => false,
}))

const toastPush = vi.fn()
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

const { AccessOverviewSection } = await import('./Settings')

const saveButton = () =>
    screen.getAllByRole('button', { name: 'Сохранить' })[0]

beforeEach(() => {
    apiGetProject.mockReset()
    apiUpdateProjectSettings.mockReset()
    apiMyVisibilitySummary.mockReset()
    toastPush.mockReset()
    apiGetProject.mockResolvedValue({ visibility_config: { manager: 'team' } })
    apiMyVisibilitySummary.mockResolvedValue({ modules: [] })
})

afterEach(cleanup)

/**
 * TODO-452 — «Сохранить» на «Обзоре доступа» раньше молчал: `persist` глотал
 * ошибку (`catch { return false }`), а `handleSave` игнорировал результат, так
 * что пользователь видел форму со своими правками и считал охват сохранённым.
 */
describe('AccessOverviewSection — save failure is visible (TODO-452)', () => {
    it('shows an error banner and a danger toast when the PATCH fails', async () => {
        apiUpdateProjectSettings.mockRejectedValue({
            response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
        })
        render(<AccessOverviewSection projectId="p1" />)
        await waitFor(() => expect(apiGetProject).toHaveBeenCalled())

        await userEvent.click(saveButton())

        await waitFor(() =>
            expect(
                screen.getByText(/Недостаточно прав для изменения охвата записей/),
            ).toBeInTheDocument(),
        )
        expect(toastPush).toHaveBeenCalled()
        // «Сохранено» не показываем поверх ошибки.
        expect(screen.queryByText('Сохранено')).toBeNull()
    })

    it('shows the success marker when the PATCH succeeds', async () => {
        apiUpdateProjectSettings.mockResolvedValue({ id: 'p1' })
        render(<AccessOverviewSection projectId="p1" />)
        await waitFor(() => expect(apiGetProject).toHaveBeenCalled())

        await userEvent.click(saveButton())

        await waitFor(() =>
            expect(screen.getByText('Сохранено')).toBeInTheDocument(),
        )
        expect(
            screen.queryByText(/Не удалось сохранить охват/),
        ).toBeNull()
    })
})

describe('AccessOverviewSection — load failure is distinguished from empty config (TODO-452)', () => {
    it('renders a banner instead of silently showing the default scope', async () => {
        apiGetProject.mockRejectedValue(new Error('network'))
        render(<AccessOverviewSection projectId="p1" />)

        await waitFor(() =>
            expect(
                screen.getByText('Не удалось загрузить настройки охвата'),
            ).toBeInTheDocument(),
        )
    })

    it('does NOT show the banner when the project simply has no visibility_config', async () => {
        apiGetProject.mockResolvedValue({})
        render(<AccessOverviewSection projectId="p1" />)

        await waitFor(() => expect(apiGetProject).toHaveBeenCalled())
        expect(
            screen.queryByText('Не удалось загрузить настройки охвата'),
        ).toBeNull()
    })
})
