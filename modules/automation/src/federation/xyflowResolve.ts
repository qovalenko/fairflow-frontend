import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** Resolve aliases so @xyflow/react → zustand/traditional never bundles a second React. */
export const xyflowFederationResolve = {
  alias: {
    'use-sync-external-store/shim/with-selector.js': path.join(
      moduleDir,
      'useSyncExternalStoreWithSelector.ts',
    ),
    'use-sync-external-store/shim/with-selector': path.join(
      moduleDir,
      'useSyncExternalStoreWithSelector.ts',
    ),
    // React 19 has native useSyncExternalStore — skip CJS shim that inlines React.
    'use-sync-external-store/shim': 'react',
  },
  dedupe: ['react', 'react-dom', 'zustand', 'use-sync-external-store'] as string[],
}
