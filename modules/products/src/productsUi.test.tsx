import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import {
    extractApiError,
    isModuleDisabledError,
    ModuleDisabledState,
    categoryTagClass,
    unitLabel,
    toUnitEnum,
    formatPrice,
    notifySuccess,
    notifyError,
} from './productsUi'

const toastPush = vi.fn()
const navigateMock = vi.fn()

let permissions = new Set<string>()
const pidRef = vi.hoisted(() => ({ value: 'p1' as string | null }))

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...args: unknown[]) => toastPush(...args) },
}))

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => pidRef.value,
}))

vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))

describe('extractApiError', () => {
    it('достаёт message и code из error{}', () => {
        expect(
            extractApiError({
                response: {
                    status: 422,
                    data: { error: { code: 'FAILED_PRECONDITION', message: 'Занято' } },
                },
            }),
        ).toEqual({ message: 'Занято', code: 'FAILED_PRECONDITION', status: 422 })
    })

    it('достаёт top-level message', () => {
        expect(
            extractApiError({
                response: { status: 400, data: { message: 'Плохой запрос' } },
            }),
        ).toEqual({ message: 'Плохой запрос', status: 400 })
    })

    it('фолбэк на Error.message', () => {
        expect(extractApiError(new Error('boom'))).toEqual({
            message: 'boom',
            status: undefined,
        })
    })

    it('полный фолбэк без деталей', () => {
        expect(extractApiError({})).toEqual({ message: 'Произошла ошибка', status: undefined })
    })
})

describe('isModuleDisabledError', () => {
    it('true для error.code MODULE_DISABLED', () => {
        expect(
            isModuleDisabledError({
                response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
            }),
        ).toBe(true)
    })

    it('true для плоского data.code MODULE_DISABLED', () => {
        expect(
            isModuleDisabledError({
                response: { status: 403, data: { code: 'MODULE_DISABLED' } },
            }),
        ).toBe(true)
    })

    it('true для 403 с текстом module … disabled', () => {
        expect(
            isModuleDisabledError({
                response: {
                    status: 403,
                    data: { message: 'Module "products" is disabled for this project' },
                },
            }),
        ).toBe(true)
    })

    it('false для обычной 500', () => {
        expect(
            isModuleDisabledError({
                response: { status: 500, data: { error: { code: 'INTERNAL' } } },
            }),
        ).toBe(false)
    })
})

describe('ModuleDisabledState', () => {
    beforeEach(() => {
        permissions = new Set()
        pidRef.value = 'p1'
        navigateMock.mockReset()
    })

    it('рисует сообщение о выключенном модуле', () => {
        render(
            <MemoryRouter>
                <ModuleDisabledState />
            </MemoryRouter>,
        )

        expect(screen.getByText('Модуль «Продукты» выключен')).toBeInTheDocument()
        expect(
            screen.getByText(/Каталог продуктов станет доступен после включения модуля/),
        ).toBeInTheDocument()
    })

    it('с project:manage показывает CTA в настройки модулей', () => {
        permissions = new Set(['project:manage'])

        render(
            <MemoryRouter>
                <ModuleDisabledState />
            </MemoryRouter>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Настройки модулей' }))
        expect(navigateMock).toHaveBeenCalledWith('/p/p1/settings/modules')
    })

    it('без project:manage не показывает CTA', () => {
        render(
            <MemoryRouter>
                <ModuleDisabledState />
            </MemoryRouter>,
        )

        expect(screen.queryByRole('button', { name: 'Настройки модулей' })).not.toBeInTheDocument()
    })
})

describe('productsUi helpers', () => {
    it('unitLabel нормализует enum и kebab-case', () => {
        expect(unitLabel('MONTHLY')).toBe('Ежемесячно')
        expect(unitLabel('one-time')).toBe('Разовый')
        expect(unitLabel(undefined)).toBe('')
    })

    it('toUnitEnum приводит к proto-enum', () => {
        expect(toUnitEnum('monthly')).toBe('MONTHLY')
        expect(toUnitEnum('yearly')).toBe('YEARLY')
        expect(toUnitEnum(undefined)).toBe('ONE_TIME')
    })

    it('formatPrice форматирует в рублях', () => {
        expect(formatPrice(15000)).toMatch(/15\s*000/)
    })

    it('categoryTagClass знает CRM и неизвестную категорию', () => {
        expect(categoryTagClass('CRM')).toContain('blue')
        expect(categoryTagClass('Другое')).toContain('gray')
    })
})

describe('notifySuccess / notifyError', () => {
    beforeEach(() => {
        toastPush.mockClear()
    })

    it('notifySuccess пушит success-тост с текстом', () => {
        notifySuccess('Готово')

        expect(toastPush).toHaveBeenCalledTimes(1)
        const [notification, options] = toastPush.mock.calls[0]
        expect(options).toEqual({ placement: 'top-center' })
        expect(notification.props.type).toBe('success')
        expect(notification.props.children).toBe('Готово')
    })

    it('notifyError пушит danger-тост с текстом', () => {
        notifyError('Ошибка')

        expect(toastPush).toHaveBeenCalledTimes(1)
        const [notification, options] = toastPush.mock.calls[0]
        expect(options).toEqual({ placement: 'top-center' })
        expect(notification.props.type).toBe('danger')
        expect(notification.props.children).toBe('Ошибка')
    })
})
