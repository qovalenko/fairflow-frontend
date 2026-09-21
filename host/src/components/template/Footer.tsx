import Container from '@/components/shared/Container'
import classNames from '@/utils/classNames'
import { PAGE_CONTAINER_GUTTER_X } from '@/constants/theme.constant'

export type FooterPageContainerType = 'gutterless' | 'contained'

type FooterProps = {
    pageContainerType: FooterPageContainerType
    className?: string
}

const FooterContent = () => {
    return (
        <div className="flex items-center justify-between flex-auto w-full">
            <span>
                Copyright &copy; {`${new Date().getFullYear()}`}{' '}
                <span className="font-semibold">Fairflow</span>
            </span>
            <div className="">
                <a
                    className="text-gray hover:text-gray-900 dark:hover:text-gray-100"
                    href="/help"
                >
                    Центр поддержки
                </a>
                <span className="mx-2 text-muted"> | </span>
                <a
                    className="text-gray hover:text-gray-900 dark:hover:text-gray-100"
                    href="/terms"
                >
                    Правила использования
                </a>
            </div>
        </div>
    )
}

export default function Footer({
    pageContainerType = 'contained',
    className,
}: FooterProps) {
    return (
        <footer
            className={classNames(
                `footer flex flex-auto items-center h-16 ${PAGE_CONTAINER_GUTTER_X}`,
                className,
            )}
        >
            {pageContainerType === 'contained' ? (
                <Container>
                    <FooterContent />
                </Container>
            ) : (
                <FooterContent />
            )}
        </footer>
    )
}
