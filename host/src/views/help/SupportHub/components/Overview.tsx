import { PiStarDuotone } from 'react-icons/pi'
import {
    helpCategories,
    articlesByCategory,
    recommendedArticles,
} from '../../articles'
import ArticleCard from './ArticleCard'
import ArticleListItem from './ArticleListItem'

const Overview = () => (
    <div className="flex flex-col gap-10">
        {recommendedArticles.length > 0 && (
            <div>
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold heading-text">
                    <PiStarDuotone className="h-5 w-5 text-amber-500" />
                    Рекомендуем начать с этого
                </h3>
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                    {recommendedArticles.map((article, index) => (
                        <ArticleListItem
                            key={article.slug}
                            article={article}
                            isLast={index === recommendedArticles.length - 1}
                        />
                    ))}
                </div>
            </div>
        )}

        {helpCategories.map((category) => {
            const articles = articlesByCategory(category.key)
            if (articles.length === 0) return null
            return (
                <div key={category.key}>
                    <h3 className="mb-4 text-lg font-semibold heading-text">
                        {category.name}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {articles.map((article) => (
                            <ArticleCard key={article.slug} article={article} />
                        ))}
                    </div>
                </div>
            )
        })}
    </div>
)

export default Overview
