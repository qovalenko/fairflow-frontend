import { Link } from 'react-router'
import {
    PiFileArrowUpDuotone,
    PiUploadSimpleDuotone,
    PiSparkleDuotone,
    PiArrowRightDuotone,
} from 'react-icons/pi'
import { qa } from '@/shared/qa'

const STEPS = [
    {
        icon: PiFileArrowUpDuotone,
        title: 'Загрузите DOCX с {{переменными}}',
        text: 'В тексте шаблона расставьте плейсхолдеры вида {{имя}} — они подставятся автоматически.',
    },
    {
        icon: PiUploadSimpleDuotone,
        title: 'Опубликуйте шаблон',
        text: 'Только опубликованный шаблон доступен для генерации документов.',
    },
    {
        icon: PiSparkleDuotone,
        title: 'Генерируйте на карточке записи',
        text: 'На карточке сделки, компании или заказа нажмите «Сгенерировать» — переменные заполнятся из записи.',
    },
]

/**
 * Компактный разбор «как это работает» из 3 шагов (BX-DOCS-6, §2.7/G6).
 * Делает модель шаблонов→документов очевидной в точке использования:
 * пустой список шаблонов и диалог генерации без опубликованных шаблонов.
 */
const DocumentsHowTo = ({ compact = false }: { compact?: boolean }) => (
    <div className="text-left" {...qa('documents.howTo')}>
        <ol className="flex flex-col gap-3">
            {STEPS.map((step, i) => {
                const Icon = step.icon
                return (
                    <li key={i} className="flex items-start gap-3">
                        <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-primary-subtle text-primary font-semibold text-sm">
                            {i + 1}
                        </span>
                        <div className="flex-1">
                            <div className="flex items-center gap-1.5 font-medium">
                                <Icon className="w-4 h-4 text-primary" />
                                <span>{step.title}</span>
                            </div>
                            {!compact && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    {step.text}
                                </p>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
        <Link
            to="/help/article/documents"
            className="inline-flex items-center gap-1 mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
            Подробнее в справке
            <PiArrowRightDuotone className="w-4 h-4" />
        </Link>
    </div>
)

export default DocumentsHowTo
