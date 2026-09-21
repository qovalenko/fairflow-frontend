import { describe, it, expect } from 'vitest'
import { accessSaveErrorMessage, moduleSaveErrorMessage } from './settingsErrors'

describe('moduleSaveErrorMessage', () => {
    it('maps DEPENDENTS_ENABLED with dependent module list', () => {
        const msg = moduleSaveErrorMessage({
            response: {
                status: 409,
                data: {
                    code: 'DEPENDENTS_ENABLED',
                    details: { dependents: ['orders', 'reports'] },
                },
            },
        })

        expect(msg).toBe(
            'Модуль нельзя выключить: от него зависят включённые модули — orders, reports',
        )
    })

    it('maps MODULE_DISABLED code', () => {
        expect(
            moduleSaveErrorMessage({
                response: { status: 403, data: { code: 'MODULE_DISABLED' } },
            }),
        ).toBe('Модуль недоступен в этом проекте')
    })

    it('maps PERMISSION_DENIED and bare 403', () => {
        expect(
            moduleSaveErrorMessage({
                response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
            }),
        ).toBe('Недостаточно прав для изменения состава модулей проекта')

        expect(moduleSaveErrorMessage({ response: { status: 403, data: {} } })).toBe(
            'Недостаточно прав для изменения состава модулей проекта',
        )
    })

    it('falls back to backend message or generic text', () => {
        expect(
            moduleSaveErrorMessage({
                response: { status: 500, data: { message: 'upstream timeout' } },
            }),
        ).toBe('Не удалось сохранить состав модулей: upstream timeout')

        expect(moduleSaveErrorMessage(new Error('boom'))).toBe(
            'Не удалось сохранить состав модулей',
        )
    })
})

describe('accessSaveErrorMessage', () => {
    it('maps PERMISSION_DENIED and bare 403', () => {
        expect(
            accessSaveErrorMessage({
                response: { status: 403, data: { code: 'PERMISSION_DENIED' } },
            }),
        ).toBe('Недостаточно прав для изменения охвата записей (нужно project:manage)')
    })

    it('falls back to backend message or generic text', () => {
        expect(
            accessSaveErrorMessage({
                response: { status: 422, data: { message: 'invalid scope' } },
            }),
        ).toBe('Не удалось сохранить охват: invalid scope')

        expect(accessSaveErrorMessage(null)).toBe('Не удалось сохранить охват')
    })
})
