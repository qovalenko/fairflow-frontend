import Steps from '@/components/ui/Steps'
import classNames from 'classnames'
import { qa, qaWithAlias } from '@/shared/qa'
import { ONBOARDING_STAGES } from './deriveOnboardingStage'
import type { OnboardingStage } from './deriveOnboardingStage'

export interface OnboardingProgressProps {
    /** Активный этап (1–3). Задаётся явно вызывающим экраном. */
    stage: OnboardingStage
    className?: string
}

/**
 * Общий каркас онбординг-хребта box (BX-ONB-1, BOX-ONBOARDING §4). Презентационный
 * степпер трёх этапов «Аккаунт → Проект → Первые шаги» с единым копирайтом/
 * брендингом. Подключается заголовком на /bootstrap (этап 1), в мастере проекта
 * (этап 2) и на первом заходе на дашборд (этап 3). Фундамент для BX-ONB-4/6.
 *
 * Пройденные этапы — «complete», текущий — «in-progress», следующие — «pending».
 * Компонент чистый: этап приходит извне пропом `stage` от места подключения.
 */
const OnboardingProgress = ({ stage, className }: OnboardingProgressProps) => {
    return (
        <Steps
            current={stage - 1}
            className={classNames('onboarding-progress', className)}
            {...qaWithAlias('host.onboarding.progress', 'host.onboardingProgress')}
            {...qa('host.onboarding.progress', { stage })}
        >
            {ONBOARDING_STAGES.map(({ stage: s, title }) => (
                <Steps.Item key={s} title={title} />
            ))}
        </Steps>
    )
}

export default OnboardingProgress
