import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StateView from './StateView'

describe('StateView', () => {
    it('loading: рисует скелетон без текста заголовка', () => {
        const { container } = render(<StateView kind="loading" />)
        expect(container.querySelectorAll('[style*="linear-gradient"]').length).toBeGreaterThan(0)
        expect(screen.queryByText('Загрузка…')).not.toBeInTheDocument()
    })

    it('empty: дефолтный заголовок и кастомный title', () => {
        render(<StateView kind="empty" />)
        expect(screen.getByText('Пусто')).toBeInTheDocument()

        render(<StateView kind="empty" title="Нет бесед" description="начните диалог" />)
        expect(screen.getByText('Нет бесед')).toBeInTheDocument()
        expect(screen.getByText('начните диалог')).toBeInTheDocument()
    })

    it('error: показывает описание и вызывает onRetry', () => {
        const onRetry = vi.fn()
        render(<StateView kind="error" onRetry={onRetry} />)
        expect(screen.getByText('Ошибка')).toBeInTheDocument()
        expect(screen.getByText('Не удалось загрузить данные')).toBeInTheDocument()
        fireEvent.click(screen.getByText('Повторить'))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('no-permission и disabled-module: дефолтные тексты', () => {
        render(<StateView kind="no-permission" />)
        expect(screen.getByText('Нет доступа')).toBeInTheDocument()
        expect(screen.getByText('У вас нет права на просмотр чата')).toBeInTheDocument()

        render(<StateView kind="disabled-module" />)
        expect(screen.getByText('Модуль выключен')).toBeInTheDocument()
    })

    it('not-member и billing-readonly', () => {
        render(<StateView kind="not-member" />)
        expect(screen.getByText('Нет доступа к беседе')).toBeInTheDocument()

        render(<StateView kind="billing-readonly" />)
        expect(screen.getByText('Только просмотр')).toBeInTheDocument()
    })

    it('empty с CTA рендерит переданную кнопку', () => {
        render(<StateView kind="empty" cta={<button type="button">Новый диалог</button>} />)
        expect(screen.getByText('Новый диалог')).toBeInTheDocument()
    })
})
