import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { viteRemoteBase, fixFederationImportPaths } from '../../vite.remote-base'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => ({
  base: viteRemoteBase(command, moduleDir),
  define: {
    __QA_IDS_ENABLED__: JSON.stringify(
      process.env.VITE_QA_IDS === 'true' ||
        (mode !== 'production' && process.env.VITE_QA_IDS !== 'false'),
    ),
  },
  plugins: [
    react(),
    fixFederationImportPaths(),
    federation({
      name: 'remoteSearch',
      filename: 'remoteEntry.js',
      // TODO-258: `./GlobalSearchDialog` СНЯТ. Overlay глобального поиска живёт в
      // chrome оболочки (`shell.header.action` — `accessKind:"host-only"`,
      // RFC-3 §1.3), куда вклад не-system модуля отвергается контрактом
      // (`HOST_ONLY_SLOT_FORBIDDEN`), а `search` — `kind:"business"`. Экспоуз
      // собирался в бандл, но смонтировать его было нельзя ничем: единственная
      // живая реализация SCR-SEARCH-DIALOG — host-локальный
      // `host/src/components/template/Search.tsx`. Модуль отдаёт полноэкранный
      // SCR-SEARCH-RESULTS и вкладку настроек.
      exposes: {
        './SearchModule': './src/SearchModule.tsx',
        './SearchSettingsTab': './src/SearchSettingsTab.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.0.0' },
        'react-router': { singleton: true, requiredVersion: '^7.0.0' },
        zustand: { singleton: true, requiredVersion: '^5.0.0' },
        swr: { singleton: true, requiredVersion: '^2.3.0' },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.join(__dirname, '../../host/src'),
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5021,
    strictPort: true,
  },
  preview: {
    port: 5021,
    strictPort: true,
  },
}))
