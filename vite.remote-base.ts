import path from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Production `base` for federated remotes: path on the public origin only (e.g. stand.example.com),
 * e.g. `/frontend/main/landing/`. Must match how the host loads remotes (`VITE_REMOTES_BASE_URL` + module folder).
 * Set at build: `VITE_FRONTEND_PUBLIC_PATH=/frontend/main` (path only, no origin).
 */
export function viteRemoteBase(command: string, moduleDirname: string): string {
  if (command !== 'build') {
    return '/'
  }
  const raw = process.env.VITE_FRONTEND_PUBLIC_PATH?.trim()
  if (!raw) {
    return './'
  }
  const prefix = raw.replace(/\/$/, '')
  const withSlash = prefix.startsWith('/') ? prefix : `/${prefix}`
  const folder = path.basename(moduleDirname)
  // Versioned deploys: VITE_BUILD_ID nests assets under <prefix>/<folder>/<id>/ so every build
  // is immutable and addressable (independent deploy + rollback). Absent -> unversioned (legacy).
  const id = process.env.VITE_BUILD_ID?.trim()
  return id ? `${withSlash}/${folder}/${id}/` : `${withSlash}/${folder}/`
}

/**
 * When index.html is present (standalone mode), Vite places remoteEntry.js
 * inside assets/ alongside other chunks. But vite-plugin-federation generates
 * import paths like './assets/chunk.js' assuming remoteEntry is at the output
 * root. This plugin rewrites those paths so co-located imports resolve correctly.
 */
export function fixFederationImportPaths(): Plugin {
  return {
    name: 'fix-federation-import-paths',
    enforce: 'post',
    writeBundle(options, bundle) {
      const outDir = options.dir || 'dist'
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (
          chunk.type === 'chunk' &&
          fileName.includes('remoteEntry') &&
          fileName.startsWith('assets/')
        ) {
          const filePath = path.join(outDir, fileName)
          if (existsSync(filePath)) {
            let code = readFileSync(filePath, 'utf8')
            if (code.includes("('./assets/")) {
              code = code.replace(/\('\.\/assets\//g, "('./")
              writeFileSync(filePath, code, 'utf8')
            }
          }
        }
      }
    },
  }
}
