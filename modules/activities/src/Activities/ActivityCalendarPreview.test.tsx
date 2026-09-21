import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Activity } from '@/@types/crm'

import ActivityCalendarPreview from './ActivityCalendarPreview'

const previewActivity = (): Activity => ({
    id: 'act-1',
    type: 'meeting',
    title: 'Встреча с клиентом',
    status: 'planned',
    priority: 'medium',
    assigneeName: 'Анна Смирнова',
    startDate: 1_756_300_800,
    endDate: 1_756_304_400,
    dealId: 'd1',
    dealName: 'Сделка Alpha',
    createdAt: 0,
    updatedAt: 0,
})

describe('ActivityCalendarPreview', () => {
    it('не рендерится без activity или anchorEl', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        const { rerender } = render(
            <ActivityCalendarPreview
                activity={null}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        rerender(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={null}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        anchor.remove()
    })

    it('показывает заголовок, тип, время, статус и ответственного', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.getByRole('dialog', { name: 'Предпросмотр активности' })).toBeInTheDocument()
        expect(screen.getByText('Встреча с клиентом')).toBeInTheDocument()
        expect(screen.getByText('Встреча')).toBeInTheDocument()
        expect(screen.getByText('Запланировано')).toBeInTheDocument()
        expect(screen.getByText('Анна Смирнова')).toBeInTheDocument()
        expect(screen.getByText(/—/)).toBeInTheDocument()

        anchor.remove()
    })

    it('без связей показывает «Нет связей»', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={{
                    ...previewActivity(),
                    dealId: undefined,
                    dealName: undefined,
                    links: [],
                }}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.getByText('Нет связей')).toBeInTheDocument()
        anchor.remove()
    })

    it('клик по связи вызывает onEntityClick', async () => {
        const user = userEvent.setup()
        const onEntityClick = vi.fn()
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={onEntityClick}
            />,
        )

        await user.click(screen.getByRole('button', { name: 'Сделка Alpha' }))
        expect(onEntityClick).toHaveBeenCalledWith('deal', 'd1')

        anchor.remove()
    })

    it('«Открыть» вызывает onOpen с id активности', async () => {
        const user = userEvent.setup()
        const onOpen = vi.fn()
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={onOpen}
                onEntityClick={vi.fn()}
            />,
        )

        await user.click(screen.getByRole('button', { name: 'Открыть' }))
        expect(onOpen).toHaveBeenCalledWith('act-1')

        anchor.remove()
    })

    it('Escape закрывает предпросмотр', () => {
        const onClose = vi.fn()
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={onClose}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        fireEvent.keyDown(document, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)

        anchor.remove()
    })

    it('клик вне поповера вызывает onClose', () => {
        const onClose = vi.fn()
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={onClose}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        fireEvent.mouseDown(document.body, { bubbles: true })
        expect(onClose).toHaveBeenCalledTimes(1)

        anchor.remove()
    })

    it('поповер открывается вверх, если под якорем мало места', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)
        vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
            left: 100,
            top: 900,
            bottom: 920,
            right: 150,
            width: 50,
            height: 20,
            x: 100,
            y: 900,
            toJSON: () => ({}),
        } as DOMRect)
        vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)

        render(
            <ActivityCalendarPreview
                activity={previewActivity()}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        const dialog = screen.getByRole('dialog', { name: 'Предпросмотр активности' })
        expect(dialog.style.bottom).not.toBe('')
        expect(dialog.style.top).toBe('')

        anchor.remove()
        vi.restoreAllMocks()
    })

    it('связь без id показывается текстом, не кнопкой', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={{
                    ...previewActivity(),
                    dealId: undefined,
                    dealName: 'Сделка без id',
                    links: [],
                }}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.getByText('Сделка без id')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сделка без id' })).not.toBeInTheDocument()

        anchor.remove()
    })

    it('для задачи со сроком показывает строку «Срок:»', () => {
        const anchor = document.createElement('button')
        document.body.appendChild(anchor)

        render(
            <ActivityCalendarPreview
                activity={{
                    ...previewActivity(),
                    type: 'task',
                    startDate: undefined,
                    endDate: undefined,
                    dueDate: 1_756_300_800_000,
                }}
                anchorEl={anchor}
                onClose={vi.fn()}
                onOpen={vi.fn()}
                onEntityClick={vi.fn()}
            />,
        )

        expect(screen.getByText(/^Срок:/)).toBeInTheDocument()

        anchor.remove()
    })
})
