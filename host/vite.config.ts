import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import dynamicImport from 'vite-plugin-dynamic-import'
import federation from '@originjs/vite-plugin-federation'
// TODO-460/519: единый реестр remote-папок и slot-экспозов. Тот же файл читают
// host/src/utils/loadRemoteComponent.ts и тест-сверка d.ts — три списка больше
// не расходятся. Файл намеренно без `@/`-импортов: vite.config исполняется в
// Node до применения resolve.alias.
import {
  REMOTE_FOLDERS,
  REMOTE_SLOT_EXPOSES,
} from './src/configs/slot-exposes.config'

const DEV_REMOTE_PORTS: Record<keyof typeof REMOTE_FOLDERS, number> = {
  remoteContacts: 5011,
  remoteCompanies: 5012,
  remoteDeals: 5013,
  remoteOrders: 5014,
  remoteActivities: 5015,
  remoteProducts: 5016,
  remoteReports: 5017,
  remoteDocuments: 5018,
  remoteAutomation: 5019,
  remoteStatistics: 5020,
  remoteSearch: 5021,
  remoteChat: 5022,
}

/**
 * Build remote entry URLs.
 * - VITE_LOCAL_REMOTES (comma-separated folder names, e.g. "contacts,deals")
 *   overrides specific remotes to localhost dev ports.
 * - Everything else falls back to baseUrl (S3/CDN) when set,
 *   or all localhost when baseUrl is empty.
 */
/** folder -> exposed component name (matches loadRemoteModule + module exposes). */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const exposedName = (folder: string) => `${cap(folder)}Module`

/**
 * Dev direct-import alias map for VITE_DIRECT_REMOTES (csv of folder names).
 * Maps the federation virtual id `remote<Mod>/<Mod>Module` straight to the module
 * source file so the host loads it from source with full HMR — no federation,
 * no separate remote dev server. For local realtime development/verification only.
 */
function buildDirectAliases(directRemotes: Set<string>): Record<string, string> {
  const pairs = Object.entries(REMOTE_FOLDERS) as [keyof typeof REMOTE_FOLDERS, string][]
  const entries: [string, string][] = []
  for (const [key, folder] of pairs) {
    if (!directRemotes.has(folder)) continue
    const main = exposedName(folder)
    entries.push([`${key}/${main}`, path.join(__dirname, `../modules/${folder}/src/${main}.tsx`)])
    // `expose.source` — путь относительно `src/` (у activities слот-компоненты
    // лежат в `src/Activities/`), поэтому формула `src/<name>.tsx` не годится.
    for (const expose of REMOTE_SLOT_EXPOSES[key] ?? []) {
      entries.push([
        `${key}/${expose.name}`,
        path.join(__dirname, `../modules/${folder}/src/${expose.source}.tsx`),
      ])
    }
  }
  return Object.fromEntries(entries)
}

function buildRemotes(
  baseUrl: string | undefined,
  localRemotes: Set<string>,
  manifestMode: boolean,
  directRemotes: Set<string>,
): Record<string, unknown> {
  const pairs = (Object.entries(REMOTE_FOLDERS) as [keyof typeof REMOTE_FOLDERS, string][])
    // direct-import remotes are resolved via resolve.alias, not federation.
    .filter(([, folder]) => !directRemotes.has(folder))
  const root = baseUrl?.replace(/\/$/, '')

  return Object.fromEntries(
    pairs.map(([key, folder]) => {
      if (localRemotes.has(folder)) {
        return [key, `http://localhost:${DEV_REMOTE_PORTS[key]}/assets/remoteEntry.js`]
      }
      if (manifestMode) {
        // Runtime resolution: remoteEntry URL comes from /fe-manifest.json (preloaded in index.html).
        // Enables independent per-remote deploys + rollback without rebuilding the host.
        return [key, {
          external: `window.__MF_MANIFEST_READY__.then(function(m){return m.remotes[${JSON.stringify(folder)}]})`,
          externalType: 'promise',
          from: 'vite',
        }]
      }
      if (root) {
        return [key, `${root}/${folder}/assets/remoteEntry.js`]
      }
      return [key, `http://localhost:${DEV_REMOTE_PORTS[key]}/assets/remoteEntry.js`]
    }),
  )
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fromFile = env.VITE_REMOTES_BASE_URL
  const raw = process.env.VITE_REMOTES_BASE_URL || fromFile
  const remotesBase = raw?.trim() ? raw.trim().replace(/\/$/, '') : undefined

  const localRemotesRaw = process.env.VITE_LOCAL_REMOTES || env.VITE_LOCAL_REMOTES || ''
  const localRemotes = new Set(
    localRemotesRaw.split(',').map(s => s.trim()).filter(Boolean),
  )

  const manifestMode = (process.env.VITE_REMOTES_MANIFEST || env.VITE_REMOTES_MANIFEST || '').trim() === 'true'

  const directRemotesRaw = process.env.VITE_DIRECT_REMOTES || env.VITE_DIRECT_REMOTES || ''
  const directRemotes = new Set(
    directRemotesRaw.split(',').map(s => s.trim()).filter(Boolean),
  )
  const directAliases = buildDirectAliases(directRemotes)

  const remotes = buildRemotes(remotesBase, localRemotes, manifestMode, directRemotes)
  const proxyTarget = (process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000').trim()
  // automation-v2 dev: /api/v1/automation/* можно отвести на ОТДЕЛЬНЫЙ (локальный)
  // gateway, а логин/проекты/прочее оставить на основном target (стенд). Минимум
  // риска: end-to-end проверяется только для automation. По умолчанию = proxyTarget.
  const automationApiTarget = (process.env.VITE_AUTOMATION_API_TARGET || env.VITE_AUTOMATION_API_TARGET || proxyTarget).trim()
  // Hybrid-dev: remote UI assets (manifest + /frontend/*) may come from a DIFFERENT
  // origin than the API — e.g. API from a local backend, остальные ремоуты со стенда.
  // Defaults to proxyTarget when unset.
  const remotesTarget = (process.env.VITE_REMOTES_PROXY_TARGET || env.VITE_REMOTES_PROXY_TARGET || proxyTarget).trim()

  // data-qa-id (e2e selectors, T-028): ON for dev/standalone serve and any build
  // with VITE_QA_IDS=true (test/standalone); OFF for a plain prod `vite build`.
  // Injected as a build-time constant so the disabled branch is tree-shaken out.
  const qaFlag = process.env.VITE_QA_IDS ?? env.VITE_QA_IDS
  const qaIdsEnabled = qaFlag === 'true' || (mode !== 'production' && qaFlag !== 'false')

  return {
    define: {
      __QA_IDS_ENABLED__: JSON.stringify(qaIdsEnabled),
    },
    plugins: [
      react(),
      dynamicImport(),
      federation({
        name: 'host',
        remotes,
        shared: {
          react: { singleton: true, requiredVersion: '^19.0.0' },
          'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
          'react-router': { singleton: true, requiredVersion: '^7.0.0' },
          zustand: { singleton: true, requiredVersion: '^5.0.0' },
          swr: { singleton: true, requiredVersion: '^2.3.0' },
        },
      }),
    ],
    assetsInclude: ['**/*.md'],
    resolve: {
      alias: {
        ...directAliases,
        '@': path.join(__dirname, 'src'),
        '@fairflow/slot-catalog': path.join(
          __dirname,
          '../../be-r3-ui-shell/shared/src/slot-catalog.ts',
        ),
      },
    },
    server: {
      proxy: {
        /**
         * automation-v2: отвести ТОЛЬКО automation BFF на локальный gateway
         * (VITE_AUTOMATION_API_TARGET), не трогая логин/проекты. Должно идти
         * ПЕРЕД '/api' — более специфичный префикс матчится первым.
         */
        '/api/v1/automation': {
          target: automationApiTarget,
          changeOrigin: true,
          secure: automationApiTarget.startsWith('https://'),
        },
        /** Единый ingress: gateway (auth, control, CRM BFF, gRPC backend). */
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyTarget.startsWith('https://'),
        },
        /**
         * Hybrid-dev против стенда с per-MF манифестом (VITE_REMOTES_MANIFEST=true):
         * манифест и ассеты ремоутов раздаёт стенд по относительным путям
         * (`/fe-manifest.json`, `/frontend/<mod>/<sha>/...`) — проксируем их на стенд,
         * чтобы они были same-origin (без CORS). Локальные ремоуты (VITE_LOCAL_REMOTES)
         * грузятся напрямую с localhost-портов и сюда не попадают. WS-чат — `/ws`.
         */
        '/fe-manifest.json': {
          target: remotesTarget,
          changeOrigin: true,
          secure: remotesTarget.startsWith('https://'),
        },
        '/frontend': {
          target: remotesTarget,
          changeOrigin: true,
          secure: remotesTarget.startsWith('https://'),
        },
        '/ws': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          secure: proxyTarget.startsWith('https://'),
        },
      },
    },
    base: process.env.VITE_HOST_BASE || '/',
    build: {
      outDir: 'build',
      target: 'esnext',
    },
  }
})
