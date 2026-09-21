import { describe, it, expect } from 'vitest'
import type { Activity } from '@/@types/crm'
import {
    toSafeString,
    toSafeNumber,
    normalizeList,
    normalizeActivity,
    isOverdue,
    isTerminal,
    toEpochMs,
    errMessage,
    personDisplayName,
    linkEntityPath,
    typeLabel,
    statusLabel,
} from './activityShared'

describe('activityShared', () => {
    it('toSafeString раскодирует Long-обёртку gRPC', () => {
        expect(toSafeString({ low: 42, high: 0, unsigned: true })).toBe('42')
        expect(toSafeString('deal-1')).toBe('deal-1')
        expect(toSafeString(7)).toBe('7')
        expect(toSafeString(null)).toBe('')
    })

    it('toSafeNumber нормализует Long, строки и числа', () => {
        expect(toSafeNumber({ low: 1000, high: 0, unsigned: true })).toBe(1000)
        expect(toSafeNumber('1700000000')).toBe(1700000000)
        expect(toSafeNumber('')).toBeUndefined()
        expect(toSafeNumber(undefined)).toBeUndefined()
    })

    it('normalizeList принимает массив и обёртку { list }', () => {
        expect(normalizeList([1, 2])).toEqual([1, 2])
        expect(normalizeList({ list: ['a'] })).toEqual(['a'])
        expect(normalizeList(null)).toEqual([])
    })

    it('normalizeActivity подставляет дефолты и assignee.name', () => {
        const raw = {
            id: { low: 5, high: 0, unsigned: true },
            title: '',
            type: 'unknown',
            status: 'bogus',
            priority: 'bogus',
            assignee: { name: 'Иван' },
            dueDate: '1700000000',
        }
        const a = normalizeActivity(raw)
        expect(a?.id).toBe('5')
        expect(a?.title).toBe('Без названия')
        expect(a?.type).toBe('task')
        expect(a?.status).toBe('planned')
        expect(a?.priority).toBe('medium')
        expect(a?.assigneeName).toBe('Иван')
        expect(a?.dueDate).toBe(1700000000)
    })

    it('isOverdue учитывает флаг overdue и секундные dueDate', () => {
        const open: Activity = {
            id: '1',
            type: 'task',
            title: 't',
            status: 'planned',
            priority: 'medium',
            dueDate: 1_700_000_000,
            createdAt: 0,
            updatedAt: 0,
        }
        expect(isOverdue(open)).toBe(true)
        expect(isOverdue({ ...open, status: 'completed' })).toBe(false)
        expect(isOverdue({ ...open, overdue: true, dueDate: undefined })).toBe(true)
    })

    it('isTerminal и toEpochMs', () => {
        expect(isTerminal({ status: 'completed' } as Activity)).toBe(true)
        expect(isTerminal({ status: 'planned' } as Activity)).toBe(false)
        expect(toEpochMs(1700000000)).toBe(1700000000000)
        expect(toEpochMs(1700000000000)).toBe(1700000000000)
        expect(toEpochMs(0)).toBeUndefined()
    })

    it('errMessage извлекает сообщение из axios-ответа', () => {
        expect(
            errMessage({ response: { data: { error: { message: 'Конфликт' } } } }),
        ).toBe('Конфликт')
        expect(errMessage(new Error('Сеть'))).toBe('Сеть')
        expect(errMessage({})).toBe('Не удалось выполнить операцию')
    })

    it('personDisplayName: имя → email → id → «—»', () => {
        expect(personDisplayName('Анна', 'a@x.ru', 'u1')).toBe('Анна')
        expect(personDisplayName('', 'a@x.ru', 'u1')).toBe('a@x.ru')
        expect(personDisplayName('', '', 'u1')).toBe('u1')
        expect(personDisplayName('', '', '')).toBe('—')
    })

    it('linkEntityPath строит URL для известных сущностей', () => {
        expect(linkEntityPath('deal', 'd1')).toBe('/deals/d1')
        expect(linkEntityPath('contact', 'c1')).toBe('/contacts/c1')
        expect(linkEntityPath('company', 'co1')).toBe('/companies/co1')
        expect(linkEntityPath('order', 'o1')).toBe('/orders/o1')
        expect(linkEntityPath('product', 'p1')).toBeNull()
    })

    it('typeLabel и statusLabel содержат доменные подписи', () => {
        expect(typeLabel.task).toBe('Задача')
        expect(statusLabel.completed).toBe('Завершено')
    })
})
