import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    errMessage,
    errCode,
    httpStatus,
    isModuleDisabledError,
    NoPermissionState,
    NoPresetsState,
    EmptyDataState,
    EmptyFilterState,
    ModuleSourceDisabledState,
    ErrorState,
} from './shared'

describe('shared helpers', () => {
    it('errMessage достаёт message из axios-конверта', () => {
        const e = { response: { data: { error: { message: 'Отказ' } } } }
        expect(errMessage(e, 'fallback')).toBe('Отказ')
        expect(errMessage(new Error('x'), 'fallback')).toBe('fallback')
    })

    it('errCode и httpStatus читают вложенные поля', () => {
        const e = {
            response: {
                status: 409,
                data: { error: { code: 'FAILED_PRECONDITION' } },
            },
        }
        expect(errCode(e)).toBe('FAILED_PRECONDITION')
        expect(httpStatus(e)).toBe(409)
    })

    it('isModuleDisabledError — FAILED_PRECONDITION или HTTP 409', () => {
        expect(
            isModuleDisabledError({
                response: { status: 409, data: { error: { code: 'FAILED_PRECONDITION' } } },
            }),
        ).toBe(true)
        expect(
            isModuleDisabledError({
                response: { status: 500, data: { error: { code: 'INTERNAL' } } },
            }),
        ).toBe(false)
    })
})

describe('shared state components', () => {
    it('NoPermissionState показывает переданное сообщение', () => {
        render(<NoPermissionState message="Нет права reports:read." />)
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(screen.getByText('Нет права reports:read.')).toBeInTheDocument()
    })

    it('NoPermissionState без message — дефолтный текст', () => {
        render(<NoPermissionState />)
        expect(
            screen.getByText('У вас нет прав для просмотра этого раздела.'),
        ).toBeInTheDocument()
    })

    it('NoPresetsState — ST-3 контейнер без доступных отчётов', () => {
        render(<NoPresetsState />)
        expect(screen.getByText('Нет доступных отчётов')).toBeInTheDocument()
    })

    it('EmptyDataState — кастомное сообщение', () => {
        render(<EmptyDataState message="Нет данных за период." />)
        expect(screen.getByText('Нет данных за период.')).toBeInTheDocument()
    })

    it('EmptyDataState без message — дефолтный текст', () => {
        render(<EmptyDataState />)
        expect(screen.getByText('Нет данных за период.')).toBeInTheDocument()
    })

    it('EmptyFilterState вызывает onReset', async () => {
        const user = userEvent.setup()
        const onReset = vi.fn()
        render(<EmptyFilterState onReset={onReset} />)
        await user.click(screen.getByRole('button', { name: 'Сбросить фильтр' }))
        expect(onReset).toHaveBeenCalledOnce()
    })

    it('ModuleSourceDisabledState — ST-17 выключенный модуль-источник', () => {
        render(<ModuleSourceDisabledState missing="deals" />)
        expect(screen.getByText('Отчёт недоступен')).toBeInTheDocument()
        expect(screen.getByText(/deals/)).toBeInTheDocument()
    })

    it('ErrorState — ST-6 retry', async () => {
        const user = userEvent.setup()
        const onRetry = vi.fn()
        render(<ErrorState message="Не удалось загрузить" onRetry={onRetry} />)
        await user.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(onRetry).toHaveBeenCalledOnce()
    })

    it('ErrorState без message — дефолтный текст', () => {
        render(<ErrorState />)
        expect(screen.getByText('Не удалось загрузить отчёт')).toBeInTheDocument()
    })

    it('ModuleSourceDisabledState без missing — общий текст', () => {
        render(<ModuleSourceDisabledState />)
        expect(
            screen.getByText('Модуль-источник этого отчёта выключен в проекте.'),
        ).toBeInTheDocument()
    })

    it('EmptyFilterState без onReset — только сообщение', () => {
        render(<EmptyFilterState />)
        expect(
            screen.getByText('Ничего не найдено по заданным фильтрам.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сбросить фильтр' })).not.toBeInTheDocument()
    })
})
