import classNames from '@/utils/classNames'
import Card from '@/components/ui/Card'
import { LayoutContext } from '@/utils/hooks/useLayout'
import type { CardProps } from '@/components/ui/Card'
import { useContext } from 'react'

type AdaptableCardProps = CardProps

const AdaptiveCard = (props: AdaptableCardProps) => {
    // Some remotes can render this component outside host layout provider.
    // In that case keep default Card behavior instead of throwing.
    const layout = useContext(LayoutContext)
    const adaptiveCardActive = Boolean(layout?.adaptiveCardActive)

    const { className, bodyClass, ...rest } = props

    return (
        <Card
            className={classNames(
                className,
                adaptiveCardActive && 'border-none dark:bg-transparent',
            )}
            bodyClass={classNames(bodyClass, adaptiveCardActive && 'p-0')}
            {...rest}
        />
    )
}

export default AdaptiveCard
