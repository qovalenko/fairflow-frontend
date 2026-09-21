import { Link } from 'react-router'
import { PiClockDuotone, PiCaretRightDuotone } from 'react-icons/pi'
import classNames from 'classnames'
import { helpCategoryLabel } from '../../articles'
import type { HelpArticle } from '../../articles'

type Props = {
    article: HelpArticle
    isLast?: boolean
}

const ArticleListItem = ({ article, isLast }: Props) => {
    const Icon = article.icon
    return (
        <Link
            to={`/help/article/${article.slug}`}
            className={classNames(
                'group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                !isLast && 'border-b border-gray-200 dark:border-gray-700',
            )}
        >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
                <h6 className="truncate text-sm font-semibold heading-text group-hover:text-primary transition-colors">
                    {article.title}
                </h6>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{helpCategoryLabel[article.category]}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <PiClockDuotone className="h-3.5 w-3.5" />
                        {article.timeToRead} мин
                    </span>
                </div>
            </div>
            <PiCaretRightDuotone className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
    )
}

export default ArticleListItem
