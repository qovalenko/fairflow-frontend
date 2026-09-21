import { useParams, Link } from 'react-router'
import {
    PiArrowLeftDuotone,
    PiClockDuotone,
    PiCaretRightDuotone,
    PiLifebuoyDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import Markdown from '../Markdown'
import { getArticle, relatedArticles, helpCategoryLabel } from '../articles'
import ArticleListItem from '../SupportHub/components/ArticleListItem'

/** Заголовок выводим отдельно (с мета-данными), поэтому убираем первый H1 из текста. */
const stripLeadingH1 = (markdown: string): string =>
    markdown.replace(/^\s*#\s+.*\r?\n+/, '')

const NotFound = () => (
    <Container>
        <div className="mx-auto max-w-[820px] px-4 py-16 text-center">
            <h3 className="mb-2 text-xl font-semibold heading-text">
                Статья не найдена
            </h3>
            <p className="mb-6 text-gray-500 dark:text-gray-400">
                Возможно, ссылка устарела или статья была перемещена.
            </p>
            <Link
                to="/help"
                className="inline-flex items-center gap-2 font-medium text-primary"
            >
                <PiArrowLeftDuotone className="h-5 w-5" />
                Вернуться в Центр поддержки
            </Link>
        </div>
    </Container>
)

const ArticleView = () => {
    const { slug } = useParams<{ slug: string }>()
    const article = getArticle(slug)

    if (!article) {
        return <NotFound />
    }

    const Icon = article.icon
    const related = relatedArticles(article)

    return (
        <Container>
            <div className="mx-auto max-w-[820px] px-4 py-8">
                {/* Хлебные крошки */}
                <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                    <Link to="/help" className="hover:text-primary">
                        Центр поддержки
                    </Link>
                    <PiCaretRightDuotone className="h-4 w-4" />
                    <span>{helpCategoryLabel[article.category]}</span>
                    <PiCaretRightDuotone className="h-4 w-4" />
                    <span className="truncate text-gray-700 dark:text-gray-200">
                        {article.title}
                    </span>
                </nav>

                <Card bodyClass="p-6 sm:p-8">
                    <header className="mb-6 border-b border-gray-200 pb-6 dark:border-gray-700">
                        <div className="mb-4 flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
                                <Icon className="h-7 w-7" />
                            </span>
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                {helpCategoryLabel[article.category]}
                            </span>
                        </div>
                        <h1 className="mb-2 text-2xl font-bold heading-text">
                            {article.title}
                        </h1>
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <PiClockDuotone className="h-4 w-4" />
                            {article.timeToRead} мин на чтение
                        </div>
                    </header>

                    <Markdown>{stripLeadingH1(article.body)}</Markdown>
                </Card>

                {/* Смежные статьи */}
                {related.length > 0 && (
                    <div className="mt-10">
                        <h3 className="mb-4 text-lg font-semibold heading-text">
                            Смежные статьи
                        </h3>
                        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                            {related.map((item, index) => (
                                <ArticleListItem
                                    key={item.slug}
                                    article={item}
                                    isLast={index === related.length - 1}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Не нашли ответ */}
                <div className="mt-10 flex flex-col items-center gap-3 rounded-xl bg-gray-50 p-8 text-center dark:bg-gray-800/50 sm:flex-row sm:justify-between sm:text-left">
                    <div className="flex items-center gap-3">
                        <PiLifebuoyDuotone className="h-8 w-8 text-primary" />
                        <div>
                            <p className="font-semibold heading-text">
                                Не нашли ответ?
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Вернитесь к разделам или воспользуйтесь поиском.
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/help"
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-deep"
                    >
                        <PiArrowLeftDuotone className="h-4 w-4" />
                        Все разделы
                    </Link>
                </div>
            </div>
        </Container>
    )
}

export default ArticleView
