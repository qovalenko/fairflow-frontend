import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * EXTRA-CONTACTS-3 — экран импорта гейтился на `contacts:write`, а ссылка на него
 * в списке и сервер — на `contacts:import` (gateway `crm-bff.controller.ts`
 * POST /v1/contacts/import, @RequirePermission('contacts','import')). Роль с
 * import без write видела ссылку и упиралась в заглушку; роль с write без import
 * проходила мастер и ловила 403 на сабмите.
 */
let permissions = new Set<string>()

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/views/crm/Import/ImportWizard', () => ({
    default: () => <div>Мастер импорта</div>,
}))

import ContactImport from './ContactImport'

describe('ContactImport — гейт (EXTRA-CONTACTS-3)', () => {
    it('право contacts:import (без write) открывает мастер', () => {
        permissions = new Set(['contacts:read', 'contacts:import'])

        render(<ContactImport />)

        expect(screen.getByText('Мастер импорта')).toBeInTheDocument()
    })

    it('право contacts:write без import мастер не открывает', () => {
        permissions = new Set(['contacts:read', 'contacts:write'])

        render(<ContactImport />)

        expect(screen.getByText('Импорт контактов недоступен')).toBeInTheDocument()
        expect(screen.queryByText('Мастер импорта')).not.toBeInTheDocument()
    })
})
