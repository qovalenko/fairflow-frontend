/**
 * Три этапа онбординг-хребта box (BOX-ONBOARDING §4): единый видимый путь
 * первого запуска. 1 — Аккаунт (первый админ + организация), 2 — Первый проект,
 * 3 — Первые шаги.
 */
export type OnboardingStage = 1 | 2 | 3

/** Порядок и человекочитаемые подписи этапов (единый копирайт box). */
export const ONBOARDING_STAGES: ReadonlyArray<{
    stage: OnboardingStage
    title: string
}> = [
    { stage: 1, title: 'Аккаунт' },
    { stage: 2, title: 'Проект' },
    { stage: 3, title: 'Первые шаги' },
]
