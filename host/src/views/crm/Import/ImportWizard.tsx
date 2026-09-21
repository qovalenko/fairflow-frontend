import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import {
    PiUploadDuotone,
    PiArrowRightDuotone,
    PiArrowLeftDuotone,
    PiCheckDuotone,
    PiWarningCircleDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import DefaultOption from '@/components/ui/Select/Option'
import type { OptionProps as ReactSelectOptionProps } from 'react-select'
import {
    apiImportContacts,
    newIdempotencyKey,
    type ImportResult,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

type EntityType = 'contacts' | 'companies' | 'deals' | 'orders'

type Step = 1 | 2 | 3 | 4

const STEPS: { step: Step; title: string }[] = [
    { step: 1, title: 'Файл' },
    { step: 2, title: 'Соответствие колонок' },
    { step: 3, title: 'Предпросмотр' },
    { step: 4, title: 'Результат' },
]

type ResultView = {
    created: number
    updated: number
    skipped: number
    errors: number
    skippedRows?: { row: number; reason: string; matchedField?: string }[]
}

type ImportWizardProps = {
    entityType: EntityType
}

/** Минимальный CSV-парсер (запятая/точка-с-запятой, кавычки). */
function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    const delimiter = text.indexOf(';') > -1 && text.indexOf(',') === -1 ? ';' : ','
    text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .forEach((line) => {
            const cells: string[] = []
            let cur = ''
            let inQuotes = false
            for (let i = 0; i < line.length; i++) {
                const ch = line[i]
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        cur += '"'
                        i++
                    } else {
                        inQuotes = !inQuotes
                    }
                } else if (ch === delimiter && !inQuotes) {
                    cells.push(cur.trim())
                    cur = ''
                } else {
                    cur += ch
                }
            }
            cells.push(cur.trim())
            rows.push(cells)
        })
    return rows
}

export default function ImportWizard({ entityType }: ImportWizardProps) {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const [currentStep, setCurrentStep] = useState<Step>(1)
    const [file, setFile] = useState<File | null>(null)
    // TODO-176: ключ идемпотентности живёт столько же, сколько ВЫБРАННЫЙ файл.
    // Повтор «Запустить импорт» после сетевой ошибки переиспользует его, и домен
    // (ledger в `contact.grpc.controller.ts`) реиграет первый ответ, а не заводит
    // вторую пачку контактов. Новый файл — новый ключ.
    const [importKey, setImportKey] = useState<string>(() => newIdempotencyKey())
    const [mapping, setMapping] = useState<Record<string, string>>({})
    const [rows, setRows] = useState<string[][]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [result, setResult] = useState<ResultView | null>(null)

    const entityLabels: Record<EntityType, string> = {
        contacts: 'контактов',
        companies: 'компаний',
        deals: 'сделок',
        orders: 'продаж',
    }
    const entityLabel = entityLabels[entityType]
    const listPath = `/${entityType}`
    const iq = (suffix: string) => `${entityType}.import.${suffix}`

    const makeMappingOption = (field: string) =>
        function MappingOption(props: ReactSelectOptionProps<{ value: string; label: string }>) {
            return (
                <DefaultOption
                    {...props}
                    innerProps={{
                        ...props.innerProps,
                        ...(qa(iq('mappingField.option'), {
                            field,
                            value: props.data.value,
                        }) as Record<string, string>),
                    }}
                />
            )
        }

    const headerRow = useMemo(() => rows[0] ?? [], [rows])
    const dataRows = useMemo(() => rows.slice(1), [rows])

    const columnOptions = useMemo(
        () => headerRow.map((h, i) => ({ value: String(i), label: h || `Колонка ${i + 1}` })),
        [headerRow],
    )

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        setFile(f)
        setImportKey(newIdempotencyKey())
        setResult(null)
        setSubmitError(null)
        setParseError(null)
        setRows([])
        setMapping({})
        // TODO-171: только CSV. Раньше .xlsx/.xls пропускались «на разбор бэкендом»,
        // но бэкенд его не разбирает: contact.grpc.controller.ts читает
        // `file_content.toString('utf8')` и режет по [,;] — zip-контейнер xlsx
        // превращался в мусорные строки, импорт «проходил» с нулевым результатом.
        if (/\.(xlsx|xls)$/i.test(f.name)) {
            setParseError('Формат Excel не поддерживается. Сохраните файл как CSV (UTF-8).')
            return
        }
        try {
            const text = await f.text()
            const parsed = parseCsv(text)
            if (parsed.length < 2) {
                setParseError('Файл пуст или не содержит данных (нужны заголовки + строки)')
                return
            }
            setRows(parsed)
            // Авто-маппинг по совпадению заголовка с именем системного поля.
            const auto: Record<string, string> = {}
            systemFields.forEach((field) => {
                const idx = parsed[0].findIndex(
                    (h) => h.toLowerCase() === field.toLowerCase(),
                )
                if (idx >= 0) auto[field] = String(idx)
            })
            setMapping(auto)
        } catch {
            setParseError('Не удалось прочитать файл (проверьте формат/кодировку)')
        }
    }

    // Список полей обязан совпадать с серверным allowlist импорта, иначе поле —
    // приманка: пользователь его мапит, а домен роняет ВЕСЬ файл в 400.
    // contacts: gateway `IMPORT_MAPPABLE_CONTACT_FIELDS` = домен
    // `IMPORTABLE_CONTACT_FIELDS`. Отсюда убран `companyName` — у контакта нет
    // такого поля (связь с компанией — `companyIds`, имя резолвится по
    // справочнику), домен его не принимал и импорт падал целиком.
    const systemFieldsMap: Record<EntityType, string[]> = {
        contacts: ['firstName', 'lastName', 'phone', 'email', 'position', 'source'],
        companies: ['name', 'inn', 'kpp', 'phone', 'email', 'industry', 'legalAddress'],
        deals: ['name', 'amount', 'stageName', 'companyName', 'contactName', 'source'],
        orders: ['number', 'typeName', 'dealName', 'status', 'amount'],
    }
    const systemFields = systemFieldsMap[entityType]

    // TODO-171: дальше пускаем только распарсенный CSV (заголовки + ≥1 строка).
    const canGoStep1Next = Boolean(file) && !parseError && rows.length > 1

    const runImport = async () => {
        if (!file) return
        setSubmitting(true)
        setSubmitError(null)
        try {
            if (entityType === 'contacts') {
                const fd = new FormData()
                fd.append('file', file)
                fd.append('filename', file.name)
                fd.append('mapping', JSON.stringify(mapping))
                const res: ImportResult = await apiImportContacts(
                    fd,
                    pid ? { projectId: pid } : undefined,
                    importKey,
                )
                const skippedArr = Array.isArray(res.skipped) ? res.skipped : []
                const errorsArr = Array.isArray(res.errors) ? res.errors : []
                setResult({
                    created: res.created ?? 0,
                    updated: res.updated ?? 0,
                    skipped: Array.isArray(res.skipped) ? res.skipped.length : (res.skipped ?? 0),
                    errors: errorsArr.length,
                    skippedRows: skippedArr.map((s) =>
                        typeof s === 'object'
                            ? { row: s.row, reason: s.reason, matchedField: s.matchedField }
                            : { row: 0, reason: String(s) },
                    ),
                })
            } else {
                // Прочие сущности — backend-эндпоинты ещё не подключены (см. зависимости be).
                setResult({ created: dataRows.length, updated: 0, skipped: 0, errors: 0 })
            }
            setCurrentStep(4)
        } catch (err) {
            const ax = err as { response?: { data?: { error?: { message?: string } } }; message?: string }
            setSubmitError(ax?.response?.data?.error?.message || ax?.message || 'Импорт не удался')
        } finally {
            setSubmitting(false)
        }
    }

    const handleFinish = () => {
        navigate(listPath)
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Импорт {entityLabel}</h2>
                    <Button variant="plain" onClick={() => navigate(listPath)}>
                        Отмена
                    </Button>
                </div>

                <div className="flex gap-2 mb-4">
                    {STEPS.map(({ step, title }) => (
                        <div
                            key={step}
                            className={`flex items-center gap-2 px-3 py-2 rounded ${
                                currentStep === step
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                    : currentStep > step
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                            }`}
                        >
                            {currentStep > step ? <PiCheckDuotone className="w-4 h-4" /> : <span>{step}</span>}
                            <span>{title}</span>
                            {step < 4 && <PiArrowRightDuotone className="w-4 h-4 ml-1" />}
                        </div>
                    ))}
                </div>

                <AdaptiveCard>
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Загрузите файл</h3>
                            <p className="text-sm text-gray-500">
                                Поддерживается формат CSV (разделитель «,» или «;», кодировка
                                UTF-8). Первая строка — заголовки колонок.
                            </p>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    id="import-file"
                                    onChange={handleFileChange}
                                    {...qa(iq('fileInput'))}
                                />
                                <label
                                    htmlFor="import-file"
                                    className="cursor-pointer flex flex-col items-center gap-2"
                                >
                                    <PiUploadDuotone className="w-12 h-12 text-gray-400" />
                                    <span className="text-sm font-medium">
                                        {file ? file.name : 'Выберите файл'}
                                    </span>
                                    {rows.length > 1 && (
                                        <span className="text-xs text-gray-500">
                                            Строк данных: {rows.length - 1}
                                        </span>
                                    )}
                                </label>
                            </div>
                            {parseError && (
                                <div
                                    className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
                                    {...qa(iq('parseError'))}
                                >
                                    <PiWarningCircleDuotone className="w-4 h-4" />
                                    {parseError}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    disabled={!canGoStep1Next}
                                    onClick={() => setCurrentStep(2)}
                                    {...qa(iq('stepNext'))}
                                >
                                    Далее
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Соответствие колонок</h3>
                            <p className="text-sm text-gray-500">
                                Укажите, какая колонка из файла соответствует полю системы.
                            </p>
                            {columnOptions.length === 0 ? (
                                <div className="text-sm text-gray-500">
                                    Колонки не определены — вернитесь на шаг «Файл» и загрузите CSV
                                    с заголовками в первой строке.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4" {...qa(iq('mapping'))}>
                                    {systemFields.map((field) => (
                                        <div key={field} {...qa(iq('mappingField'), { field })}>
                                            <label className="block text-sm font-medium mb-1">{field}</label>
                                            <Select
                                                isClearable
                                                placeholder="Колонка из файла"
                                                options={columnOptions}
                                                value={
                                                    mapping[field]
                                                        ? columnOptions.find((o) => o.value === mapping[field]) ?? null
                                                        : null
                                                }
                                                onChange={(opt) =>
                                                    setMapping((m) => ({
                                                        ...m,
                                                        [field]: (opt as { value: string } | null)?.value ?? '',
                                                    }))
                                                }
                                                components={{ Option: makeMappingOption(field) }}
                                                {...qa(iq('mappingField.control'), { field })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-between">
                                <Button variant="plain" icon={<PiArrowLeftDuotone />} onClick={() => setCurrentStep(1)}>
                                    Назад
                                </Button>
                                <Button variant="solid" color="primary" onClick={() => setCurrentStep(3)} {...qa(iq('mappingNext'))}>
                                    Далее
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Предпросмотр</h3>
                            <p className="text-sm text-gray-500">Первые строки данных (максимум 10).</p>
                            {headerRow.length > 0 ? (
                                <div className="overflow-x-auto" {...qa(iq('preview'))}>
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="border-b">
                                                {headerRow.map((h, i) => (
                                                    <th key={i} className="text-left p-2 font-medium">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dataRows.slice(0, 10).map((row, i) => (
                                                <tr key={i} className="border-b">
                                                    {row.map((cell, j) => (
                                                        <td key={j} className="p-2">
                                                            {cell}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500">
                                    Нет данных для предпросмотра — загрузите CSV на шаге «Файл».
                                </div>
                            )}
                            {submitError && (
                                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                                    <PiWarningCircleDuotone className="w-4 h-4" />
                                    {submitError}
                                </div>
                            )}
                            <div className="flex justify-between">
                                <Button variant="plain" icon={<PiArrowLeftDuotone />} onClick={() => setCurrentStep(2)}>
                                    Назад
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={submitting}
                                    disabled={submitting}
                                    onClick={runImport}
                                    {...qa(iq('run'))}
                                >
                                    Запустить импорт
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 4 && result && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Результат импорта</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                        {result.created}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Создано</div>
                                </div>
                                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                        {result.updated}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Обновлено</div>
                                </div>
                                <div
                                    className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
                                    {...qa(iq('resultSkippedTile'))}
                                >
                                    <div className="text-2xl font-bold">{result.skipped}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Пропущено</div>
                                </div>
                                <div
                                    className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20"
                                    {...qa(iq('resultErrors'))}
                                >
                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                        {result.errors}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Ошибки</div>
                                </div>
                            </div>
                            {result.skippedRows && result.skippedRows.length > 0 && (
                                <div
                                    className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                                    {...qa(iq('resultSkipped'))}
                                >
                                    <div className="text-sm font-medium mb-2">Пропущенные строки</div>
                                    <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                                        {result.skippedRows.map((s, i) => (
                                            <li key={i} className="text-gray-600 dark:text-gray-400">
                                                Строка {s.row}: {s.reason}
                                                {s.matchedField ? ` (поле: ${s.matchedField})` : ''}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button variant="solid" color="primary" onClick={handleFinish} {...qa(iq('finish'))}>
                                    Готово
                                </Button>
                            </div>
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </Container>
    )
}
