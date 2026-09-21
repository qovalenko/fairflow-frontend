import { useMemo } from 'react'
import { Link } from 'react-router'
import { PiArrowLeftDuotone } from 'react-icons/pi'
import { searchArticles } from '../../articles'
import ArticleListItem from './ArticleListItem'

type Props = {
    query: string
}

const SearchResults = ({ query }: Props) => {
    const results = useMemo(() => searchArticles(query), [query])

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link
                    to="/help"
                    className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Назад к разделам"
                >
                    <PiArrowLeftDuotone className="h-5 w-5" />
                </Link>
                <h3 className="text-lg font-semibold">
                    Результаты по запросу:{' '}
                    <span className="font-bold">{query}</span>
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        ({results.length})
                    </span>
                </h3>
            </div>

            {results.length === 0 ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                    <p className="text-lg font-medium">Ничего не найдено</p>
                    <p className="mt-1 text-sm">
                        Попробуйте другой запрос или вернитесь к{' '}
                        <Link to="/help" className="text-primary font-medium">
                            списку разделов
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    {results.map((article, index) => (
                        <ArticleListItem
                            key={article.slug}
                            article={article}
                            isLast={index === results.length - 1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default SearchResults
