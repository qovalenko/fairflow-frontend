import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
    ActivityEmptyState,
    ActivityEmptyFilterState,
    ActivityErrorState,
    ActivityNoPermissionState,
} from './ActivityStatePanels'

describe('ActivityStatePanels', () => {
    it('ST-3: пустой список показывает призыв создать активность', () => {
        const onCreate = vi.fn()
        render(<ActivityEmptyState onCreate={onCreate} />)

        expect(screen.getByText('Пока нет активностей')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Создать активность' }))
        expect(onCreate).toHaveBeenCalledTimes(1)
    })

    it('ST-3: без права write кнопка создания не рисуется', () => {
        render(<ActivityEmptyState />)

        expect(screen.getByText('Пока нет активностей')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Создать активность' })).not.toBeInTheDocument()
    })

    it('ST-4: пустой результат фильтра предлагает сброс', () => {
        const onReset = vi.fn()
        render(<ActivityEmptyFilterState onReset={onReset} />)

        expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        expect(onReset).toHaveBeenCalledTimes(1)
    })

    it('ST-6: ошибка загрузки даёт «Повторить»', () => {
        const onRetry = vi.fn()
        render(<ActivityErrorState onRetry={onRetry} />)

        expect(screen.getByText('Не удалось загрузить активности')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('ST-10: нет права read — экран «Недостаточно прав»', () => {
        render(<ActivityNoPermissionState />)

        expect(screen.getByText('Недостаточно прав')).toBeInTheDocument()
        expect(screen.getByText(/Активности/)).toBeInTheDocument()
    })
})
