import { describe, it, expect } from 'vitest'
import { resolveCreateProjectSubmitError } from './createProjectErrors'

describe('resolveCreateProjectSubmitError (FR-PROJ-400)', () => {
    it('maps PERMISSION_DENIED to a human-readable create denial', () => {
        const error = {
            isAxiosError: true,
            response: {
                status: 403,
                data: {
                    code: 'PERMISSION_DENIED',
                    message: 'access',
                },
            },
        }
        expect(resolveCreateProjectSubmitError(error)).toBe(
            'Создание проектов доступно только владельцу или администратору системы.',
        )
    })
})
