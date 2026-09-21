import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import NavItemBadge from './NavItemBadge'

const useNotifications = vi.fn()

vi.mock('@/utils/hooks/useNotifications', () => ({
    default: (...args: unknown[]) => useNotifications(...args),
}))

describe('NavItemBadge (nav.item.badge)', () => {
    beforeEach(() => {
        useNotifications.mockReturnValue({
            canRead: true,
            unreadCount: 0,
        })
    })

    it('ничего не рендерит при нулевом счётчике', () => {
        const { container } = render(<NavItemBadge moduleId="notifications" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('показывает счётчик непрочитанных', () => {
        useNotifications.mockReturnValue({
            canRead: true,
            unreadCount: 4,
        })
        const { container } = render(<NavItemBadge moduleId="notifications" />)
        expect(container.textContent).toContain('4')
    })

    it('скрыт без права notifications:read', () => {
        useNotifications.mockReturnValue({
            canRead: false,
            unreadCount: 5,
        })
        const { container } = render(<NavItemBadge moduleId="notifications" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('не рисуется на чужом пункте меню (context.moduleId)', () => {
        useNotifications.mockReturnValue({
            canRead: true,
            unreadCount: 4,
        })
        const { container } = render(<NavItemBadge moduleId="deals" />)
        expect(container).toBeEmptyDOMElement()
    })

    it('без moduleId не рисуется (fail-closed)', () => {
        useNotifications.mockReturnValue({
            canRead: true,
            unreadCount: 4,
        })
        const { container } = render(<NavItemBadge />)
        expect(container).toBeEmptyDOMElement()
    })
})
