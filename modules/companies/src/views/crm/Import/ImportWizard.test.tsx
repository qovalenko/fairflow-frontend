import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

/**
 * Гейт мастера импорта (TODO-152 / FR-MCOM-31).
 *
 * Регресс, который пинуется: мастер спрашивал право по несуществующему субъекту
 * `companies.import` с действием `execute`. Такого ключа нет в каталоге прав
 * (backend/shared/src/module-registry.ts → subject 'companies', actions
 * [...,'export','import']), проекция PDP его не содержит, и fail-closed
 * usePermission возвращал false ВСЕМ ролям — экран за видимой в списке кнопкой
 * «Импорт» отдавал заглушку «Импорт недоступен» даже владельцу.
 *
 * Инвариант: кнопка/экран гейтятся ровно тем ключом, что проверяет сервер —
 * @RequirePermission('companies', 'import') на POST /v1/companies/import
 * (gateway/src/bff/v1-data-bff.controller.ts).
 */
const canMock = vi.fn<(subject: string, action: string) => boolean>()
const apiImportCompanies = vi.fn()

vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => canMock,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => 'proj-1',
}))
vi.mock('@/services/CrmService', () => ({
    apiImportCompanies: (...args: unknown[]) => apiImportCompanies(...args),
}))

const { default: ImportWizard } = await import('./ImportWizard')

const renderWizard = () =>
    render(
        <MemoryRouter initialEntries={['/companies/import']}>
            <ImportWizard entityType="companies" />
        </MemoryRouter>,
    )

describe('ImportWizard — гейт по праву импорта', () => {
    beforeEach(() => {
        canMock.mockReset()
    })

    it('открывает мастер, когда есть companies:import (ключ каталога прав)', () => {
        canMock.mockImplementation(
            (subject, action) => subject === 'companies' && action === 'import',
        )

        renderWizard()

        expect(screen.getByText('Импорт компаний')).toBeInTheDocument()
        expect(screen.queryByText('Импорт недоступен')).not.toBeInTheDocument()
        // Спрашиваем ровно тот ключ, что проверяет gateway…
        expect(canMock).toHaveBeenCalledWith('companies', 'import')
        // …и не спрашиваем несуществующий субъект (иначе гейт снова мёртвый).
        expect(canMock).not.toHaveBeenCalledWith('companies.import', 'execute')
    })

    it('показывает «Импорт недоступен», когда права нет', () => {
        canMock.mockReturnValue(false)

        renderWizard()

        expect(screen.getByText('Импорт недоступен')).toBeInTheDocument()
        expect(screen.queryByText('Импорт компаний')).not.toBeInTheDocument()
    })
})

/**
 * TODO-361: мастер режет файл тем же правилом, что домен (RFC 4180, ./csv.ts).
 *
 * Регресс: наивный split по `,`/`;`/tab расщеплял «ООО Ромашка, Инк» и сдвигал все
 * последующие колонки строки, а первая строка считалась заголовком безусловно —
 * файл без шапки терял первую компанию ещё в предпросмотре.
 */
describe('ImportWizard — разбор файла (RFC 4180)', () => {
    beforeEach(() => {
        canMock.mockReset()
        canMock.mockImplementation(
            (subject, action) => subject === 'companies' && action === 'import',
        )
    })

    const upload = async (content: string) => {
        const { container } = renderWizard()
        const input = container.querySelector('#import-file') as HTMLInputElement
        const file = new File([content], 'companies.csv', { type: 'text/csv' })
        // jsdom-шим: Blob.text() в jsdom не реализован (в браузерах есть с 2019).
        Object.defineProperty(file, 'text', { value: async () => content })
        // jsdom не наполняет FileList из fireEvent — подкладываем файл руками.
        Object.defineProperty(input, 'files', { value: [file] })
        fireEvent.change(input)
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Соответствие колонок' }),
            ).toBeInTheDocument(),
        )
        return container
    }

    it('закавыченная запятая не расщепляет колонку и не сдвигает предпросмотр', async () => {
        const container = await upload('name,inn,phone\n"ООО Ромашка, Инк",7701,+7999\n')

        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Предпросмотр' })).toBeInTheDocument(),
        )

        const table = container.querySelector('table') as HTMLTableElement
        const cells = Array.from(table.querySelectorAll('tbody td')).map((td) => td.textContent)
        // до фикса: ['ООО Ромашка', ' Инк', '7701'] → ИНН уезжал в телефон
        expect(cells).toEqual(['ООО Ромашка, Инк', '7701', '+7999'])
        expect(
            within(table).getByRole('columnheader', { name: 'phone' }),
        ).toBeInTheDocument()
    })

    it('файл без шапки: первая строка остаётся данными, о чём мастер и говорит', async () => {
        const container = await upload('ООО Ромашка,7701\nООО Василёк,7702\n')

        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Предпросмотр' })).toBeInTheDocument(),
        )

        expect(screen.getByText(/Строка заголовков не найдена/)).toBeInTheDocument()
        const table = container.querySelector('table') as HTMLTableElement
        const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
            Array.from(tr.querySelectorAll('td')).map((td) => td.textContent),
        )
        expect(rows).toEqual([
            ['ООО Ромашка', '7701'],
            ['ООО Василёк', '7702'],
        ])
        // подписи колонок — синтетические, шапки в файле нет
        expect(within(table).getByRole('columnheader', { name: 'Колонка 1' })).toBeInTheDocument()
    })
})

describe('ImportWizard — импорт на сервер', () => {
    beforeEach(() => {
        canMock.mockReset()
        apiImportCompanies.mockReset()
        canMock.mockImplementation(
            (subject, action) => subject === 'companies' && action === 'import',
        )
    })

    const goToPreview = async (content: string) => {
        const { container } = renderWizard()
        const input = container.querySelector('#import-file') as HTMLInputElement
        const file = new File([content], 'companies.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => content })
        Object.defineProperty(input, 'files', { value: [file] })
        fireEvent.change(input)
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Соответствие колонок' }),
            ).toBeInTheDocument(),
        )
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Предпросмотр' })).toBeInTheDocument(),
        )
        return container
    }

    it('пустой файл — ошибка на шаге 1', async () => {
        const { container } = renderWizard()
        const input = container.querySelector('#import-file') as HTMLInputElement
        const file = new File(['name,inn\n'], 'empty.csv', { type: 'text/csv' })
        Object.defineProperty(file, 'text', { value: async () => 'name,inn\n' })
        Object.defineProperty(input, 'files', { value: [file] })
        fireEvent.change(input)
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))
        expect(
            await screen.findByText('Файл пуст или не удалось прочитать данные'),
        ).toBeInTheDocument()
    })

    it('успешный импорт — шаг «Результат» с счётчиками', async () => {
        apiImportCompanies.mockResolvedValue({
            created: 2,
            updated: 1,
            skipped: 0,
            errors: 0,
        })
        await goToPreview('name,inn\nООО Альфа,7701\n')
        fireEvent.click(screen.getByRole('button', { name: 'Запустить импорт' }))
        expect(await screen.findByRole('heading', { name: 'Результат импорта' })).toBeInTheDocument()
        expect(screen.getByText('Создано').parentElement).toHaveTextContent('2')
        expect(screen.getByText('Обновлено').parentElement).toHaveTextContent('1')
        expect(apiImportCompanies).toHaveBeenCalledWith(
            expect.objectContaining({ dedupMode: 'skip', projectId: 'proj-1' }),
        )
    })

    it('ошибка API — сообщение на шаге предпросмотра', async () => {
        apiImportCompanies.mockRejectedValue({
            response: { data: { error: { message: 'Импорт запрещён' } } },
        })
        await goToPreview('name,inn\nООО Альфа,7701\n')
        fireEvent.click(screen.getByRole('button', { name: 'Запустить импорт' }))
        expect(await screen.findByText('Импорт запрещён')).toBeInTheDocument()
    })
})
