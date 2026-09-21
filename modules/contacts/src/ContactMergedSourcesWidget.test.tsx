import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Contact, MergedSource } from '@/@types/crm'

const apiUnmergeContact = vi.fn()
const notifyError = vi.fn()
const onUnmerged = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiUnmergeContact: (...a: unknown[]) => apiUnmergeContact(...a),
}))
vi.mock('./contactsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifyError: (m: string) => notifyError(m),
    notifySuccess: vi.fn(),
}))

import ContactMergedSourcesWidget from './ContactMergedSourcesWidget'

const source: MergedSource = {
    id: 'src-1',
    firstName: 'Пётр',
    lastName: 'Петров',
    email: 'petr@example.com',
    mergedAt: 1_700_000_000,
    unmergeUntil: 1_700_000_000 + 30 * 24 * 60 * 60,
}

describe('ContactMergedSourcesWidget — откат слияния (TODO-161)', () => {
    beforeEach(() => {
        apiUnmergeContact.mockReset()
        apiUnmergeContact.mockResolvedValue({ id: 'src-1' } as Contact)
        notifyError.mockClear()
        onUnmerged.mockClear()
    })

    it('показывает донора слияния', () => {
        render(
            <ContactMergedSourcesWidget
                sources={[source]}
                projectId="p1"
                canUnmerge
                onUnmerged={onUnmerged}
            />,
        )

        expect(screen.getByText('Петров Пётр')).toBeInTheDocument()
        expect(screen.getByText('Слитые контакты')).toBeInTheDocument()
    })

    it('подтверждение вызывает apiUnmergeContact по id донора', async () => {
        render(
            <ContactMergedSourcesWidget
                sources={[source]}
                projectId="p1"
                canUnmerge
                onUnmerged={onUnmerged}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Отменить слияние' }))
        const confirmButtons = await screen.findAllByRole('button', { name: 'Отменить слияние' })
        fireEvent.click(confirmButtons[confirmButtons.length - 1])

        await waitFor(() =>
            expect(apiUnmergeContact).toHaveBeenCalledWith('src-1', { projectId: 'p1' }),
        )
        expect(onUnmerged).toHaveBeenCalledWith(expect.objectContaining({ id: 'src-1' }), 'src-1')
    })

    it('без canUnmerge кнопка disabled и RPC не вызывается', () => {
        render(
            <ContactMergedSourcesWidget
                sources={[source]}
                projectId="p1"
                canUnmerge={false}
                onUnmerged={onUnmerged}
            />,
        )

        const button = screen.getByRole('button', { name: 'Отменить слияние' })
        expect(button.className).toContain('cursor-not-allowed')
        fireEvent.click(button)

        expect(apiUnmergeContact).not.toHaveBeenCalled()
        expect(screen.getAllByRole('button', { name: 'Отменить слияние' })).toHaveLength(1)
    })

    it('ошибка API (409 unmerge_expired) показывается пользователю', async () => {
        apiUnmergeContact.mockRejectedValueOnce({
            response: { data: { error: { message: 'Срок отката истёк' } } },
        })

        render(
            <ContactMergedSourcesWidget
                sources={[source]}
                projectId="p1"
                canUnmerge
                onUnmerged={onUnmerged}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Отменить слияние' }))
        const confirmButtons = await screen.findAllByRole('button', { name: 'Отменить слияние' })
        fireEvent.click(confirmButtons[confirmButtons.length - 1])

        await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Срок отката истёк'))
    })
})
