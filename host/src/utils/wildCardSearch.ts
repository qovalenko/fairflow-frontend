export default function wildCardSearch<T extends Record<string, unknown>>(
    list: T[],
    input: string,
    specifyKey?: string,
): T[] {
    const searchText = (item: T) => {
        for (const key in item) {
            const val = item[specifyKey ? specifyKey : key]
            if (val == null) {
                continue
            }
            if (
                String(val)
                    .toUpperCase()
                    .indexOf(input.toString().toUpperCase()) !== -1
            ) {
                return true
            }
        }
    }
    const result = list.filter((value) => searchText(value))
    return result
}
