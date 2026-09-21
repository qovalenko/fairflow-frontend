/** SCR-DEALS-DISABLE-CASCADE-DIALOG — human-readable preview body (pure, testable). */

export type DealsCascadeModule = { id: string; name: string }

export function dealsDisableCascadeMessage(
    cascadeModules: DealsCascadeModule[],
    openDealCount: number | null,
): string {
    const moduleNames = cascadeModules.map((m) => m.name).filter(Boolean)
    const cascadePart =
        moduleNames.length > 0
            ? `Выключение «Сделок» отключит зависимые модули: ${moduleNames.join(', ')}.`
            : 'Выключение «Сделок» скроет модуль из проекта.'

    if (openDealCount == null) {
        return `${cascadePart} Незавершённые сделки станут недоступны (число не загрузилось).`
    }
    if (openDealCount === 0) {
        return `${cascadePart} Открытых сделок нет.`
    }
    return `${cascadePart} Станут недоступны ${openDealCount} незавершённых сделок.`
}
