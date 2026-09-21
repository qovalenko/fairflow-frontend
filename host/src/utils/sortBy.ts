export type Primitive = string | number | boolean

export type Primer = (value: Primitive) => Primitive

const sortBy = <T extends Record<string, unknown>>(
    field: keyof T & string,
    reverse: boolean,
    primer?: Primer,
) => {
    const isReverse = !reverse ? 1 : -1
    return function (a: T, b: T) {
        const rawA = a[field] as Primitive
        const rawB = b[field] as Primitive
        const valueA = primer ? primer(rawA) : rawA
        const valueB = primer ? primer(rawB) : rawB
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return isReverse * valueA.localeCompare(valueB)
        }
        return isReverse * (valueA > valueB ? 1 : valueB > valueA ? -1 : 0)
    }
}

export default sortBy
