import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompanyInfoWidget from './CompanyInfoWidget'
import type { Company, Contact } from '@/@types/crm'

/**
 * Секция «Связанные компании» (TODO-368).
 *
 * Регресс, который пинуется: секция рендерилась безусловно, а её источник —
 * `company.relatedCompanies` — не существует ни в proto Company, ни в mapCompany
 * на gateway, т.е. массив ВСЕГДА пуст. Пользователь стабильно видел заголовок
 * «Связанные компании» и текст «Нет связанных компаний» — обещание
 * функциональности, которой нет. Секция должна появляться только при данных.
 */
const company = (over: Partial<Company> = {}): Company => ({
    id: 'c1',
    name: 'ООО Ромашка',
    phone: '+7 999 000-00-00',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const contacts: Contact[] = []

describe('CompanyInfoWidget — секция «Связанные компании»', () => {
    it('не рендерит секцию, пока бэкенд не отдаёт relatedCompanies', () => {
        render(<CompanyInfoWidget company={company()} contacts={contacts} />)

        expect(screen.queryByText('Связанные компании')).not.toBeInTheDocument()
        expect(screen.queryByText('Нет связанных компаний')).not.toBeInTheDocument()
        // Остальная карточка на месте.
        expect(screen.getByText('Общая информация')).toBeInTheDocument()
    })

    it('рендерит дерево, когда связанные компании пришли', () => {
        render(
            <CompanyInfoWidget
                company={company({
                    relatedCompanies: [
                        {
                            id: 'c0',
                            name: 'ООО Головная',
                            inn: '7700000000',
                            relationType: 'head',
                            children: [
                                { id: 'c1', name: 'ООО Ромашка', relationType: 'current' },
                            ],
                        },
                    ],
                })}
                contacts={contacts}
            />,
        )

        expect(screen.getByText('Связанные компании')).toBeInTheDocument()
        expect(screen.getByText('ООО Головная')).toBeInTheDocument()
        expect(screen.getByText('ГОЛОВНОЙ ОФИС')).toBeInTheDocument()
    })
})

/**
 * Неполнота связей контактов (замечание ревью круга 2).
 *
 * Регресс, который пинуется: gateway уже отдаёт `stats.contactsTruncated` (свип
 * контактов на BFF ограничен потолком страниц, у домена контактов нет фильтра по
 * company_id), но карточка флаг не читала — пользователь в большом проекте видел
 * заниженное число связей без единого признака неполноты. Ровно класс дефекта
 * «домен умеет, а до пользователя не доходит».
 */
describe('CompanyInfoWidget — неполнота списка контактов', () => {
    const twoContacts: Contact[] = [
        {
            id: 'ct1',
            firstName: 'Иван',
            lastName: 'Петров',
            phone: '',
            email: '',
            createdAt: 0,
            updatedAt: 0,
        },
        {
            id: 'ct2',
            firstName: 'Пётр',
            lastName: 'Иванов',
            phone: '',
            email: '',
            createdAt: 0,
            updatedAt: 0,
        },
    ]

    it('без флага показывает точный счётчик и ничего не обещает', () => {
        render(<CompanyInfoWidget company={company()} contacts={twoContacts} />)

        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.queryByText(/Показаны не все связи/)).not.toBeInTheDocument()
    })

    it('при contactsTruncated помечает счётчик «+» и говорит о неполноте вслух', () => {
        render(
            <CompanyInfoWidget company={company()} contacts={twoContacts} contactsTruncated />,
        )

        // Счётчик — нижняя граница: «2+», а не «2».
        expect(screen.getByText('2+')).toBeInTheDocument()
        expect(screen.queryByText('2')).not.toBeInTheDocument()
        expect(screen.getByText(/Показаны не все связи/)).toBeInTheDocument()
    })
})
