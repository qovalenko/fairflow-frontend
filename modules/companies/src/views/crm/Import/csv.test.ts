/**
 * TODO-361: разбор CSV мастера импорта по RFC 4180.
 *
 * Регресс, который пинуется: наивный `line.split(/[,;\t]/)` резал «ООО Ромашка, Инк»
 * по запятой и сдвигал все последующие колонки строки, перевод строки внутри
 * закавыченного адреса рвал запись, `""` оставалось удвоенным, а первая строка
 * считалась заголовком безусловно — файл без шапки терял первую компанию.
 *
 * Инвариант ПАРНОСТИ: набор кейсов зеркалит доменный
 * backend/company/src/companies/csv-import.spec.ts. Мастер строит карту колонок по
 * своему разбору, а применяет её к тому же файлу домен — разъедутся правила,
 * разъедутся и колонки (ИНН в КПП) без единой ошибки.
 */
import { describe, it, expect } from 'vitest'
import {
    parseCsv,
    detectCsvDelimiter,
    looksLikeHeaderRow,
    normalizeHeaderToken,
    COMPANY_HEADER_TOKENS,
} from './csv'

describe('parseCsv (RFC 4180)', () => {
    it('запятая внутри кавычек не расщепляет ячейку и не сдвигает колонки', () => {
        const rows = parseCsv('name,inn,phone\n"ООО Ромашка, Инк",7701,+7999\n')
        expect(rows).toHaveLength(2)
        expect(rows[1].cells).toEqual(['ООО Ромашка, Инк', '7701', '+7999'])
    })

    it('удвоенная кавычка разворачивается в одну', () => {
        const rows = parseCsv('name\n"ООО ""Ромашка"""\n')
        expect(rows[1].cells).toEqual(['ООО "Ромашка"'])
    })

    it('перевод строки внутри закавыченного поля остаётся частью значения', () => {
        const rows = parseCsv('name,legalAddress\n"Альфа","г. Москва,\nул. Ленина, 1"\nБета,\n')
        expect(rows).toHaveLength(3)
        expect(rows[1].cells).toEqual(['Альфа', 'г. Москва,\nул. Ленина, 1'])
        expect(rows[2].cells).toEqual(['Бета', ''])
        expect(rows[2].line).toBe(4)
    })

    it('CRLF, BOM и пустые строки не создают лишних записей', () => {
        const rows = parseCsv('﻿name,inn\r\nАльфа,7701\r\n\r\nБета,7702\r\n')
        expect(rows.map((r) => r.cells)).toEqual([
            ['name', 'inn'],
            ['Альфа', '7701'],
            ['Бета', '7702'],
        ])
        expect(rows.map((r) => r.line)).toEqual([1, 2, 4])
    })

    it('незакрытая кавычка в конце файла не роняет разбор', () => {
        const rows = parseCsv('name,inn\n"Альфа,7701')
        expect(rows[1].cells).toEqual(['Альфа,7701'])
    })

    it('незакавыченные ячейки триммятся, закавыченные — нет', () => {
        const rows = parseCsv('name,inn\n  Альфа  ," 7701 "')
        expect(rows[1].cells).toEqual(['Альфа', ' 7701 '])
    })
})

describe('detectCsvDelimiter', () => {
    it('точка с запятой выигрывает у запятой внутри кавычек (экспорт 1С/Excel RU)', () => {
        expect(detectCsvDelimiter('name;inn\n"Рога, копыта";7701')).toBe(';')
    })

    it('таб распознаётся как разделитель', () => {
        expect(detectCsvDelimiter('name\tinn\nАльфа\t7701')).toBe('\t')
    })

    it('одноколоночный файл — запятая по умолчанию', () => {
        expect(detectCsvDelimiter('name\nАльфа')).toBe(',')
    })

    it('разделитель считается только по первой записи и вне кавычек', () => {
        expect(detectCsvDelimiter('name;inn\n"а,б,в,г";7701')).toBe(';')
    })
})

describe('looksLikeHeaderRow', () => {
    it('узнаёт англоязычные имена полей и русские подписи', () => {
        expect(looksLikeHeaderRow(['name', 'inn'])).toBe(true)
        expect(looksLikeHeaderRow(['Название', 'ИНН', 'Телефон'])).toBe(true)
        expect(looksLikeHeaderRow(['Юридический адрес'])).toBe(true)
    })

    it('строка данных заголовком не считается (файл без шапки не теряет компанию)', () => {
        expect(looksLikeHeaderRow(['ООО Ромашка', '7701234567'])).toBe(false)
    })

    it('нормализация токена снимает регистр, пробелы и разделители', () => {
        expect(normalizeHeaderToken(' Legal_Address ')).toBe('legaladdress')
        expect(normalizeHeaderToken('E-Mail')).toBe('email')
    })

    it('словарь компаний покрывает все поля, маппируемые доменом', () => {
        // Домен разрешает к заполнению из файла ровно эти поля
        // (IMPORT_MAPPABLE_FIELDS, backend/company/src/companies/companies.service.ts).
        for (const field of [
            'name',
            'inn',
            'kpp',
            'ogrn',
            'legalAddress',
            'phone',
            'email',
            'website',
            'industry',
            'region',
            'notes',
            'tags',
        ]) {
            expect(COMPANY_HEADER_TOKENS.has(normalizeHeaderToken(field))).toBe(true)
        }
    })
})
