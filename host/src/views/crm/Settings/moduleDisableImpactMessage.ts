/** FR-PSET-055 / SCR-PRJSET-MODULE-DISABLE-IMPACT — human-readable preview body. */

export type DisableImpactModule = { id: string; name: string }
export type DisableImpactAutomation = { id: string; name: string }

export function moduleDisableImpactMessage(
    moduleName: string,
    dependents: DisableImpactModule[],
    unfinishedRecords: number,
    stoppedAutomations: DisableImpactAutomation[],
    webhookDlqSuspended = false,
): string {
    const parts: string[] = []

    if (dependents.length > 0) {
        parts.push(
            `Выключение «${moduleName}» также отключит зависимые модули: ${dependents.map((m) => m.name).join(', ')}.`,
        )
    } else {
        parts.push(`Модуль «${moduleName}» будет скрыт из проекта.`)
    }

    if (unfinishedRecords >= 0) {
        if (unfinishedRecords === 0) {
            parts.push('Незавершённых записей в этом модуле нет.')
        } else {
            parts.push(`Станут недоступны ${unfinishedRecords} незавершённых записей.`)
        }
    } else {
        parts.push('Число незавершённых записей сейчас неизвестно.')
    }

    if (stoppedAutomations.length > 0) {
        const names = stoppedAutomations.map((a) => a.name).slice(0, 5)
        const tail =
            stoppedAutomations.length > names.length
                ? ` и ещё ${stoppedAutomations.length - names.length}`
                : ''
        parts.push(`Остановятся автоматизации: ${names.join(', ')}${tail}.`)
    }

    if (webhookDlqSuspended) {
        parts.push(
            'Исходящие webhook и доставка из DLQ будут приостановлены и не возобновятся автоматически после повторного включения модуля.',
        )
    }

    return parts.join(' ')
}
