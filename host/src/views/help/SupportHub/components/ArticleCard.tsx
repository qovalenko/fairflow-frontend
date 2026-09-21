import { Link } from 'react-router'
import { PiClockDuotone } from 'react-icons/pi'
import type { HelpArticle } from '../../articles'

type Props = {
    article: HelpArticle
}

const ArticleCard = ({ article }: Props) => {
    const Icon = article.icon
    return (
        <Link
            to={`/help/article/${article.slug}`}
            className="group flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 transition-colors hover:border-primary hover:shadow-sm"
        >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                <Icon className="h-6 w-6" />
            </span>
            <h6 className="font-semibold heading-text group-hover:text-primary transition-colors">
                {article.title}
            </h6>
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {article.summary}
            </p>
            <span className="mt-auto flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <PiClockDuotone className="h-4 w-4" />
                {article.timeToRead} мин на чтение
            </span>
        </Link>
    )
}

export default ArticleCard
