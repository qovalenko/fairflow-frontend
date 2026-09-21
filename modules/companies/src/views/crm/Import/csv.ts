/**
 * Разбор CSV для мастера импорта — RFC 4180 (TODO-361 / FR-COMPANIES-440).
 *
 * ЗЕРКАЛО домена: backend/company/src/companies/csv-import.ts. Мастер строит карту
 * соответствия колонок по СВОЕМУ разбору файла, а пишет по этой карте домен, режущий
 * ТОТ ЖЕ файл своим разбором. Расходятся правила — карта собрана по одной раскладке,
 * а применяется к другой: ИНН уезжает в КПП, e-mail в отрасль, и никто не падает.
 * Поэтому правила разбиения, автоопределение разделителя и распознавание заголовка
 * обязаны совпадать один в один. Меняешь здесь — меняй и в домене.
 *
 * Наивный `line.split(/[,;\t]/)`, живший тут раньше, ломался на реальных данных:
 * «ООО Ромашка, Инк» расщеплялось по запятой, перевод строки внутри закавыченного
 * адреса рвал запись пополам, `""` оставалось удвоенным, а первая строка считалась
 * заголовком безусловно — файл без шапки терял первую компанию.
 */

const BOM = '\uFEFF'

/** Разделители, которые распознаём. `|` намеренно не входит: им разделяются теги ВНУТРИ ячейки. */
export const CSV_DELIMITERS = [',', ';', '\t'] as const

/** Запись файла + 1-based номер физической строки, с которой она начинается. */
export type CsvRecord = { cells: string[]; line: number }

/**
 * Разделитель файла — тот кандидат, который чаще встречается в ПЕРВОЙ записи вне
 * кавычек (`"Рога, копыта";7701` — файл с `;`, а не с `,`). Ни одного — берём `,`:
 * одноколоночный файл при любом разделителе даёт ту же одну ячейку.
 */
export function detectCsvDelimiter(text: string): string {
    const counts = new Map<string, number>(CSV_DELIMITERS.map((d) => [d, 0]))
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') i++
                else inQuotes = false
            }
            continue
        }
        if (ch === '"') {
            inQuotes = true
            continue
        }
        if (ch === '\n' || ch === '\r') break // первой записи достаточно
        const seen = counts.get(ch)
        if (seen !== undefined) counts.set(ch, seen + 1)
    }
    let best = ','
    let bestCount = 0
    for (const d of CSV_DELIMITERS) {
        const c = counts.get(d) ?? 0
        if (c > bestCount) {
            best = d
            bestCount = c
        }
    }
    return best
}

/**
 * Разбор по RFC 4180: закавыченное поле держит разделители и переводы строк, `""`
 * разворачивается в `"`, незакавыченные ячейки триммятся (Excel/1С дополняют
 * пробелами), пустые строки записей не образуют. Снисходительны к двум реальным
 * поломкам экспорта — незакрытой кавычке в конце файла и одиночной кавычке внутри
 * незакавыченного поля: импорт не должен умирать из-за одного символа.
 */
export function parseCsv(text: string, delimiter: string = detectCsvDelimiter(text)): CsvRecord[] {
    const src = text.startsWith(BOM) ? text.slice(1) : text
    const records: CsvRecord[] = []
    let cells: string[] = []
    let field = ''
    let fieldQuoted = false
    let recordQuoted = false
    let inQuotes = false
    let line = 1
    let recordLine = 1
    let recordStarted = false

    const startRecord = () => {
        if (!recordStarted) {
            recordStarted = true
            recordLine = line
        }
    }
    const endField = () => {
        cells.push(fieldQuoted ? field : field.trim())
        field = ''
        fieldQuoted = false
    }
    const endRecord = () => {
        endField()
        // Пустая строка записи не несёт; одинокое `""` — явная пустая ячейка, её оставляем.
        if (!(cells.length === 1 && cells[0] === '' && !recordQuoted)) {
            records.push({ cells, line: recordLine })
        }
        cells = []
        recordQuoted = false
        recordStarted = false
    }

    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') {
                    field += '"'
                    i++
                } else {
                    inQuotes = false
                }
                continue
            }
            // Перевод строки внутри кавычек — часть значения; CRLF нормализуем в LF.
            if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && src[i + 1] === '\n') i++
                field += '\n'
                line++
                continue
            }
            field += ch
            continue
        }
        if (ch === '"') {
            startRecord()
            if (field === '' && !fieldQuoted) {
                inQuotes = true
                fieldQuoted = true
                recordQuoted = true
            } else {
                field += ch // случайная кавычка внутри поля: оставляем, строку не переосмысливаем
            }
            continue
        }
        if (ch === delimiter) {
            startRecord()
            endField()
            continue
        }
        if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && src[i + 1] === '\n') i++
            if (recordStarted || field !== '' || cells.length) endRecord()
            line++
            continue
        }
        startRecord()
        field += ch
    }
    if (recordStarted || field !== '' || cells.length) endRecord()
    return records
}

/** Приводим ячейку заголовка к сравнимому виду: регистр, пробелы, `_`/`-` и BOM — шум. */
export function normalizeHeaderToken(cell: string): string {
    return cell
        .replace(/^\uFEFF/, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '')
}

/**
 * Словарь заголовков для файлов компаний: имена маппируемых полей + русские подписи,
 * которые кладут выгрузки Excel/1С. Список дословно повторяет домен
 * (backend/company/src/companies/csv-import.ts → COMPANY_HEADER_TOKENS).
 */
export const COMPANY_HEADER_TOKENS: ReadonlySet<string> = new Set([
    // имена полей (company.md §3.17)
    'name',
    'inn',
    'kpp',
    'ogrn',
    'legaladdress',
    'phone',
    'email',
    'website',
    'industry',
    'region',
    'notes',
    'tags',
    // русские подписи
    'название',
    'наименование',
    'компания',
    'организация',
    'инн',
    'кпп',
    'огрн',
    'юридическийадрес',
    'юрадрес',
    'адрес',
    'телефон',
    'тел',
    'почта',
    'эл.почта',
    'электроннаяпочта',
    'сайт',
    'вебсайт',
    'отрасль',
    'сфера',
    'регион',
    'заметки',
    'примечание',
    'примечания',
    'комментарий',
    'теги',
    'метки',
])

/** Словарь заголовков для прочих сущностей: их системные поля + общие русские подписи. */
export function buildHeaderTokens(fields: readonly string[]): ReadonlySet<string> {
    const base = new Set<string>([
        'название',
        'наименование',
        'имя',
        'фамилия',
        'телефон',
        'почта',
        'эл.почта',
        'email',
        'сумма',
        'статус',
        'источник',
        'должность',
        'компания',
        'номер',
        'этап',
    ])
    for (const f of fields) base.add(normalizeHeaderToken(f))
    return base
}

/**
 * Первая запись — заголовок? Решаем по содержимому, а не по позиции: иначе файл без
 * шапки теряет первую компанию (домен так же безусловно пропускал запись №0). Одной
 * узнанной подписи достаточно — частичные шапки обычны; строка данных не попадает ни
 * в один токен, потому что токены — это подписи полей.
 */
export function looksLikeHeaderRow(
    cells: readonly string[],
    tokens: ReadonlySet<string> = COMPANY_HEADER_TOKENS,
): boolean {
    return cells.some((c) => tokens.has(normalizeHeaderToken(c)))
}
