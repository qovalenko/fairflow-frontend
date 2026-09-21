/**
 * Host-only routes that must stay usable when `/fe-manifest.json` is missing or empty.
 * Sign-in and other pre-auth screens do not depend on federated remotes.
 */
export function isAuthShellRoute(pathname: string): boolean {
    return (
        pathname === '/bootstrap' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/account/logout-forced')
    )
}
