import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { DuplicatePair } from '@/services/CrmService'

const apiGetContactDuplicateQueue = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContactDuplicateQueue: (...a: unknown[]) => apiGetContactDuplicateQueue(...a),
}))

import ContactDuplicateQueue from './ContactDuplicateQueue'

const pair = (leftId: string, rightId: string): DuplicatePair => ({
    left: {
        contactId: leftId,
        displayName: `Контакт ${leftId}`,
        maskedValue: 'i***@example.com',
        matchedOn: 'email',
    },
    right: {
        contactId: rightId,
        displayName: `Контакт ${rightId}`,
        maskedValue: 'i***@example.com',
        matchedOn: 'email',
    },
    matchedOn: 'email',
})

const renderQueue = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <ContactDuplicateQueue />
        </SWRConfig>,
    )

describe('ContactDuplicateQueue — гейт и состояния (FR-MCON-15)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:manage'])
        apiGetContactDuplicateQueue.mockReset()
        navigate.mockClear()
    })

    it('loading — очередь ещё не показана', () => {
        apiGetContactDuplicateQueue.mockImplementation(() => new Promise(() => {}))
        renderQueue()
        expect(screen.getByText('Очередь дублей')).toBeInTheDocument()
        expect(screen.queryByText('Дублей не найдено')).not.toBeInTheDocument()
        expect(screen.queryByText(/Не удалось загрузить очередь/)).not.toBeInTheDocument()
    })

    it('без contacts:manage показывает «Раздел недоступен» и не ходит в API', () => {
        permissions = new Set(['contacts:read'])

        renderQueue()

        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(apiGetContactDuplicateQueue).not.toHaveBeenCalled()
    })

    it('пустая очередь — позитивное «Дублей не найдено»', async () => {
        apiGetContactDuplicateQueue.mockResolvedValue({ pairs: [], total: 0 })

        renderQueue()

        expect(await screen.findByText('Дублей не найдено')).toBeInTheDocument()
    })

    it('ошибка загрузки — «Повторить» перезапрашивает очередь', async () => {
        apiGetContactDuplicateQueue.mockRejectedValueOnce(new Error('500'))

        renderQueue()
        expect(await screen.findByText(/Не удалось загрузить очередь/)).toBeInTheDocument()

        apiGetContactDuplicateQueue.mockResolvedValueOnce({ pairs: [], total: 0 })
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

        await waitFor(() => expect(apiGetContactDuplicateQueue).toHaveBeenCalledTimes(2))
    })

    it('рендерит пары и «Слить» ведёт на экран merge', async () => {
        apiGetContactDuplicateQueue.mockResolvedValue({
            pairs: [pair('a1', 'a2')],
            total: 1,
        })

        renderQueue()

        expect(await screen.findByText('Контакт a1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Слить' }))

        expect(navigate).toHaveBeenCalledWith('/contacts/merge?source=a1&target=a2')
    })

    it('пагинация: «Далее» запрашивает следующую страницу', async () => {
        apiGetContactDuplicateQueue.mockResolvedValue({
            pairs: Array.from({ length: 25 }, (_, i) => pair(`l${i}`, `r${i}`)),
            total: 40,
        })

        renderQueue()
        await screen.findByText('Контакт l0')

        fireEvent.click(screen.getByRole('button', { name: 'Далее' }))

        await waitFor(() =>
            expect(apiGetContactDuplicateQueue).toHaveBeenCalledWith({
                projectId: 'p1',
                pageIndex: 1,
                pageSize: 25,
            }),
        )
    })
})
