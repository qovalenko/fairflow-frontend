/**
 * Detects Vite/Webpack dynamic-import failures after a deploy changed chunk hashes
 * (stale tab) or when a lazy route chunk is missing (404).
 */
export function isChunkLoadError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    const message = error.message
    if (/Failed to fetch dynamically imported module/i.test(message)) {
        return true
    }
    if (/Importing a module script failed/i.test(message)) {
        return true
    }
    if (/error loading dynamically imported module/i.test(message)) {
        return true
    }
    if (error.name === 'ChunkLoadError') {
        return true
    }

    return false
}
