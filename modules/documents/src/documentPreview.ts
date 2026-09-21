/** TODO-396: определяет, можно ли показать inline PDF preview. */
export function isPdfMime(mimeType?: string | null): boolean {
    return Boolean(mimeType?.toLowerCase().includes('pdf'))
}
