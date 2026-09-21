import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const defaultViewRef = vi.hoisted(() => ({ value: 'list' as string | undefined }))

vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { defaultActivitiesView?: string } }) => unknown) =>
        sel({ user: { defaultActivitiesView: defaultViewRef.value } }),
}))
vi.mock('./Activities/ActivityList', () => ({
    default: () => <div>ActivityList</div>,
}))
vi.mock('./Activities/ActivityCalendar', () => ({
    default: () => <div>ActivityCalendar</div>,
}))
vi.mock('./Activities/ActivityDetails', () => ({
    default: () => <div>ActivityDetails</div>,
}))
vi.mock('./Activities/ActivityEdit', () => ({
    default: () => <div>ActivityEdit</div>,
}))
vi.mock('./Activities/ActivityTrash', () => ({
    default: () => <div>ActivityTrash</div>,
}))

import ActivitiesModule from './ActivitiesModule'

describe('ActivitiesModule', () => {
    beforeEach(() => {
        defaultViewRef.value = 'list'
    })

    it('index ведёт на список по умолчанию', () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/*" element={<ActivitiesModule />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('ActivityList')).toBeInTheDocument()
    })

    it('index с defaultActivitiesView=calendar ведёт на календарь', () => {
        defaultViewRef.value = 'calendar'
        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/*" element={<ActivitiesModule />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('ActivityCalendar')).toBeInTheDocument()
    })

    it('маршрут calendar открывает календарь', () => {
        render(
            <MemoryRouter initialEntries={['/calendar']}>
                <Routes>
                    <Route path="/*" element={<ActivitiesModule />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('ActivityCalendar')).toBeInTheDocument()
    })

    it('маршрут trash открывает корзину', () => {
        render(
            <MemoryRouter initialEntries={['/trash']}>
                <Routes>
                    <Route path="/*" element={<ActivitiesModule />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('ActivityTrash')).toBeInTheDocument()
    })

    it('маршрут :id/edit открывает форму редактирования', () => {
        render(
            <MemoryRouter initialEntries={['/a1/edit']}>
                <Routes>
                    <Route path="/*" element={<ActivitiesModule />} />
                </Routes>
            </MemoryRouter>,
        )

        expect(screen.getByText('ActivityEdit')).toBeInTheDocument()
    })
})
