import { useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
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
import toast from '@/components/ui/toast'
import { apiImportCompanies } from '@/services/CrmService'
import {
    parseCsv,
    looksLikeHeaderRow,
    buildHeaderTokens,
    COMPANY_HEADER_TOKENS,
} from './csv'
import { qa } from '../../../qa'

type EntityType = 'contacts' | 'companies' | 'deals' | 'orders'

type Step = 1 | 2 | 3 | 4

const STEPS: { step: Step; title: string }[] = [
    { step: 1, title: 'Файл' },
    { step: 2, title: 'Соответствие колонок' },
    { step: 3, title: 'Предпросмотр' },
    { step: 4, title: 'Результат' },
]

type DedupMode = 'skip' | 'update' | 'create'

const dedupOptions: { value: DedupMode; label: string }[] = [
    { value: 'skip', label: 'Пропускать дубли' },
    { value: 'update', label: 'Обновлять существующие' },
    { value: 'create', label: 'Создавать всегда' },
]

type ImportResult = {
    created: number
    updated: number
    skipped: number
    errors: number
    errorRows?: { row: number; message: string }[]
}

type ImportWizardProps = {
    entityType: EntityType
}

const systemFieldsMap: Record<EntityType, string[]> = {
    contacts: ['firstName', 'lastName', 'phone', 'email', 'position', 'companyName', 'source'],
    companies: ['name', 'inn', 'kpp', 'phone', 'email', 'industry', 'legalAddress'],
    deals: ['name', 'amount', 'stageName', 'companyName', 'contactName', 'source'],
    orders: ['number', 'typeName', 'dealName', 'status', 'amount'],
}

/**
 * Словарь подписей заголовка. Для компаний — ровно тот же набор, что у домена
 * (COMPANY_HEADER_TOKENS), иначе стороны разойдутся в вопросе «первая строка —
 * шапка или данные»: мастер покажет N строк, а импортируется N+1 (или наоборот).
 */
function headerTokensFor(entityType: EntityType): ReadonlySet<string> {
    return entityType === 'companies'
        ? COMPANY_HEADER_TOKENS
        : buildHeaderTokens(systemFieldsMap[entityType])
}

type ParsedFile = {
    /** Строка заголовков, если она в файле есть; иначе null — тогда все записи данные. */
    header: string[] | null
    rows: string[][]
}

/**
 * Разбор файла для маппинга и предпросмотра.
 *
 * ВАЖНО: индексы колонок отсюда уезжают в карту соответствия, а по этой карте тот же
 * файл режет домен (`parseCsv`, backend/company/src/companies/csv-import.ts).
 * Правила обязаны совпадать один в один — разбор RFC 4180, автоопределение
 * разделителя и распознавание заголовка по содержимому. Меняешь здесь — меняй там.
 */
async function parseCsvPreview(file: File, entityType: EntityType): Promise<ParsedFile> {
    const text = await file.text()
    const records = parseCsv(text)
    if (records.length === 0) return { header: null, rows: [] }
    const hasHeader = looksLikeHeaderRow(records[0].cells, headerTokensFor(entityType))
    return {
        header: hasHeader ? records[0].cells : null,
        rows: (hasHeader ? records.slice(1) : records).slice(0, 10).map((r) => r.cells),
    }
}

export default function ImportWizard({ entityType }: ImportWizardProps) {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // FR-COMPANIES-400/440. Гейт мастера — тот же ключ, что проверяет gateway на импорте
    // (@RequirePermission('companies','import'), v1-data-bff.controller.ts).
    // Прежний субъект `<entity>.import` с действием execute в каталоге прав не
    // объявлен (shared/src/module-registry.ts) — проекция PDP его не содержала,
    // и мастер отдавал «Импорт недоступен» всем ролям, включая владельца.
    const canImport = can(entityType, 'import')

    const [currentStep, setCurrentStep] = useState<Step>(1)
    const [file, setFile] = useState<File | null>(null)
    const [mapping, setMapping] = useState<Record<string, string>>({})
    const [dedupMode, setDedupMode] = useState<DedupMode>('skip')
    const [parsed, setParsed] = useState<ParsedFile>({ header: null, rows: [] })
    const [result, setResult] = useState<ImportResult | null>(null)
    const [parsing, setParsing] = useState(false)
    const [importing, setImporting] = useState(false)
    const [fileError, setFileError] = useState<string | null>(null)
    const [importError, setImportError] = useState<string | null>(null)

    const entityLabels: Record<EntityType, string> = {
        contacts: 'контактов',
        companies: 'компаний',
        deals: 'сделок',
        orders: 'продаж',
    }
    const entityLabel = entityLabels[entityType]
    const listPath = `/${entityType}`

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (f) {
            setFile(f)
            setParsed({ header: null, rows: [] })
            setResult(null)
            setFileError(null)
            setImportError(null)
        }
    }

    const handleStep1Next = async () => {
        if (!file) return
        setParsing(true)
        setFileError(null)
        try {
            const p = await parseCsvPreview(file, entityType)
            if (p.rows.length === 0) {
                setFileError('Файл пуст или не удалось прочитать данные')
                return
            }
            setParsed(p)
            setCurrentStep(2)
        } catch {
            setFileError('Не удалось прочитать файл. Поддерживаются CSV/Excel с разделителями , ; tab')
        } finally {
            setParsing(false)
        }
    }

    const systemFields = systemFieldsMap[entityType]

    // Опции маппинга — колонки файла. Ширина берётся по самой длинной записи, а не по
    // первой строке: без шапки заголовков нет вовсе, а строки бывают рваные.
    const columnCount = Math.max(
        parsed.header?.length ?? 0,
        ...parsed.rows.map((r) => r.length),
        0,
    )
    const columnLabels = Array.from(
        { length: columnCount },
        (_, idx) => parsed.header?.[idx] || `Колонка ${idx + 1}`,
    )
    const columnOptions = columnLabels.map((label, idx) => ({
        value: String(idx),
        label,
    }))

    const handleStep2Next = () => setCurrentStep(3)

    const handleRunImport = async () => {
        if (!file) return
        setImporting(true)
        setImportError(null)
        try {
            if (entityType === 'companies') {
                const res = await apiImportCompanies<ImportResult>({
                    file,
                    mapping,
                    dedupMode,
                    projectId: pid,
                })
                setResult(
                    res ?? { created: 0, updated: 0, skipped: 0, errors: 0 }
                )
            } else {
                // прочие сущности — вне данной задачи (companies-fe); оставляем мок-результат
                setResult({ created: 0, updated: 0, skipped: 0, errors: 0 })
            }
            setCurrentStep(4)
        } catch (e) {
            const err = e as { response?: { data?: { error?: { message?: string } } } }
            setImportError(err?.response?.data?.error?.message ?? 'Не удалось выполнить импорт')
        } finally {
            setImporting(false)
        }
    }

    const handleFinish = () => navigate(listPath)

    // ── ST-10/11: нет права на импорт ──
    if (!canImport) {
        return (
            <Container>
                <AdaptiveCard>
                    <div
                        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                        {...qa('companies.import.noAccess')}
                    >
                        <PiWarningCircleDuotone className="w-12 h-12 text-gray-400" />
                        <h4>Импорт недоступен</h4>
                        <p className="text-gray-500">У вас нет права на импорт {entityLabel}.</p>
                        <Button variant="solid" color="primary" onClick={() => navigate(listPath)}>
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Импорт {entityLabel}</h2>
                    <Button
                        variant="plain"
                        onClick={() => navigate(listPath)}
                        {...qa('companies.import.cancel')}
                    >
                        Отмена
                    </Button>
                </div>

                <div className="flex gap-2 mb-4">
                    {STEPS.map(({ step, title }) => (
                        <div
                            key={step}
                            {...qa('companies.import.step', {
                                step,
                                state:
                                    currentStep === step
                                        ? 'current'
                                        : currentStep > step
                                          ? 'done'
                                          : 'pending',
                            })}
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
                                Поддерживаются форматы CSV и Excel (.xlsx). Разделитель (запятая,
                                точка с запятой, табуляция) определяется автоматически; значения в
                                кавычках могут содержать разделитель и перенос строки. Шапка
                                распознаётся по названиям колонок — файл без шапки импортируется
                                целиком.
                            </p>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                <input
                                    type="file"
                                    accept=".csv,.xlsx,.xls"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="import-file"
                                    {...qa('companies.import.file')}
                                />
                                <label
                                    htmlFor="import-file"
                                    className="cursor-pointer flex flex-col items-center gap-2"
                                    {...qa('companies.import.fileLabel')}
                                >
                                    <PiUploadDuotone className="w-12 h-12 text-gray-400" />
                                    <span className="text-sm font-medium">{file ? file.name : 'Выберите файл'}</span>
                                </label>
                            </div>
                            {fileError && (
                                <div
                                    className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 text-sm"
                                    {...qa('companies.import.fileError')}
                                >
                                    {fileError}
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    onClick={handleStep1Next}
                                    loading={parsing}
                                    disabled={!file || parsing}
                                    {...qa('companies.import.next', { step: 1 })}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {systemFields.map((field) => (
                                    <div key={field} {...qa('companies.import.mapping', { field })}>
                                        <label className="block text-sm font-medium mb-1">{field}</label>
                                        <Select
                                            placeholder="Колонка из файла"
                                            isClearable
                                            options={columnOptions}
                                            value={columnOptions.find((o) => o.value === mapping[field]) || null}
                                            onChange={(opt) =>
                                                setMapping((m) => ({ ...m, [field]: opt?.value ?? '' }))
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Режим обработки дублей</label>
                                <div className="w-[260px]" {...qa('companies.import.dedupMode')}>
                                    <Select
                                        options={dedupOptions}
                                        value={dedupOptions.find((o) => o.value === dedupMode) || null}
                                        onChange={(opt) => setDedupMode((opt?.value as DedupMode) ?? 'skip')}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between">
                                <Button
                                    variant="plain"
                                    icon={<PiArrowLeftDuotone />}
                                    onClick={() => setCurrentStep(1)}
                                    {...qa('companies.import.back', { step: 2 })}
                                >
                                    Назад
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    onClick={handleStep2Next}
                                    {...qa('companies.import.next', { step: 2 })}
                                >
                                    Далее
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Предпросмотр</h3>
                            <p className="text-sm text-gray-500">
                                Первые строки данных из файла.{' '}
                                {parsed.header
                                    ? 'Первая строка распознана как заголовок и импортирована не будет.'
                                    : 'Строка заголовков не найдена — первая строка файла будет импортирована как данные.'}
                            </p>
                            <div className="overflow-x-auto" {...qa('companies.import.preview')}>
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b">
                                            {columnLabels.map((h, i) => (
                                                <th key={i} className="text-left p-2 font-medium">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsed.rows.slice(0, 5).map((row, i) => (
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
                            {importError && (
                                <div
                                    className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-3 py-2 text-sm"
                                    {...qa('companies.import.error')}
                                >
                                    {importError}
                                </div>
                            )}
                            <div className="flex justify-between">
                                <Button
                                    variant="plain"
                                    icon={<PiArrowLeftDuotone />}
                                    onClick={() => setCurrentStep(2)}
                                    {...qa('companies.import.back', { step: 3 })}
                                >
                                    Назад
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    onClick={handleRunImport}
                                    loading={importing}
                                    disabled={importing}
                                    {...qa('companies.import.submit')}
                                >
                                    Запустить импорт
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === 4 && result && (
                        <div className="space-y-4" {...qa('companies.import.result')}>
                            <h3 className="text-lg font-medium">Результат импорта</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div
                                    className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20"
                                    {...qa('companies.import.resultCreated')}
                                >
                                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                        {result.created}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Создано</div>
                                </div>
                                <div
                                    className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20"
                                    {...qa('companies.import.resultUpdated')}
                                >
                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                        {result.updated}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Обновлено</div>
                                </div>
                                <div
                                    className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
                                    {...qa('companies.import.resultSkipped')}
                                >
                                    <div className="text-2xl font-bold">{result.skipped}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Пропущено</div>
                                </div>
                                <div
                                    className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20"
                                    {...qa('companies.import.resultErrors')}
                                >
                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                        {result.errors}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">Ошибки</div>
                                </div>
                            </div>

                            {/* ST-8: построчные ошибки (частичный успех) */}
                            {result.errorRows && result.errorRows.length > 0 && (
                                <div
                                    className="rounded-lg border border-red-200 dark:border-red-800 p-3"
                                    {...qa('companies.import.errorRows')}
                                >
                                    <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                                        Строки с ошибками:
                                    </div>
                                    <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                                        {result.errorRows.map((er, i) => (
                                            <li key={i}>
                                                Строка {er.row}: {er.message}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    onClick={handleFinish}
                                    {...qa('companies.import.done')}
                                >
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
