import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    NotFoundState,
    ReadOnlyBanner,
    FreshnessLabel,
    errMessage,
    httpStatus,
} from './shared'

describe('shared — состояния и утилиты', () => {
    it('NoProjectState показывает подсказку выбрать проект', () => {
        render(<NoProjectState />)
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
        expect(
            screen.getByText('Выберите проект, чтобы работать с автоматизацией.'),
        ).toBeInTheDocument()
    })

    it('NoPermissionState показывает переданное сообщение', () => {
        render(<NoPermissionState message="Нет права automation:read." />)
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(screen.getByText('Нет права automation:read.')).toBeInTheDocument()
    })

    it('ErrorState вызывает onRetry по кнопке «Повторить»', async () => {
        const user = userEvent.setup()
        const onRetry = vi.fn()
        render(<ErrorState message="Сеть недоступна" onRetry={onRetry} />)
        await user.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(onRetry).toHaveBeenCalledOnce()
    })

    it('NotFoundState вызывает onBack', async () => {
        const user = userEvent.setup()
        const onBack = vi.fn()
        render(<NotFoundState message="Правило не найдено" onBack={onBack} />)
        await user.click(screen.getByRole('button', { name: 'К списку' }))
        expect(onBack).toHaveBeenCalledOnce()
    })

    it('ReadOnlyBanner показывает текст баннера', () => {
        render(<ReadOnlyBanner message="Только просмотр" />)
        expect(screen.getByText('Только просмотр')).toBeInTheDocument()
    })

    it('FreshnessLabel рендерит метку свежести', () => {
        render(<FreshnessLabel />)
        expect(screen.getByText(/Данные на \d{2}:\d{2}/)).toBeInTheDocument()
    })

    it('errMessage достаёт message из axios-ответа', () => {
        const err = { response: { data: { error: { message: 'Forbidden' } } } }
        expect(errMessage(err, 'fallback')).toBe('Forbidden')
        expect(errMessage({}, 'fallback')).toBe('fallback')
    })

    it('httpStatus читает status из ошибки', () => {
        expect(httpStatus({ response: { status: 404 } })).toBe(404)
        expect(httpStatus({})).toBeUndefined()
    })
})
