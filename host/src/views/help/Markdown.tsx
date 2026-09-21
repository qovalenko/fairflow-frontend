import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router'
import classNames from 'classnames'
import type { ComponentProps } from 'react'

type MarkdownProps = {
    children: string
    className?: string
}

/**
 * Рендер статьи Центра поддержки из markdown.
 *
 * - Оформление через Tailwind Typography (`prose`).
 * - Внутренние ссылки (`/help/...`, `/p/...`) открываются роутером без
 *   перезагрузки страницы; внешние — в новой вкладке.
 *
 * react-markdown v10 не поддерживает `className` на самом компоненте,
 * поэтому prose-обёртка вынесена в `div`.
 */
const MarkdownLink = ({ href, children }: ComponentProps<'a'>) => {
    if (href && href.startsWith('/')) {
        return <Link to={href}>{children}</Link>
    }
    return (
        <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
        </a>
    )
}

const Markdown = ({ children, className }: MarkdownProps) => (
    <div
        className={classNames(
            'prose prose-sm sm:prose-base dark:prose-invert max-w-none',
            'prose-headings:heading-text prose-a:text-primary prose-a:font-medium',
            className,
        )}
    >
        <ReactMarkdown components={{ a: MarkdownLink }}>
            {children}
        </ReactMarkdown>
    </div>
)

export default Markdown
