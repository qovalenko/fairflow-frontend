import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { viteRemoteBase, fixFederationImportPaths } from '../../vite.remote-base'
import { xyflowFederationResolve } from './src/federation/xyflowResolve'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => ({
  base: viteRemoteBase(command, moduleDir),
  // data-qa-id (e2e selectors, T-028): нужен и здесь — ремоут компилирует в себя
  // host-компоненты (DataTable, EntityCreateDrawer), которые вызывают qa().
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
      name: 'remoteAutomation',
      filename: 'remoteEntry.js',
        exposes: {
        './AutomationModule': './src/AutomationModule.tsx',
        './NavDlqBadge': './src/NavDlqBadge.tsx',
        './EntityRuleHistoryTab': './src/EntityRuleHistoryTab.tsx',
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
      // NFR-090 / TODO: кросс-модульный alias на host/src — standalone remote
      // зависит от 100+ импортов `@/…` (UI-kit, hooks, services). Отвязка —
      // вынос standalone-рантайма и дизайн-системы в @fairflow/shared-ui
      // (кросс-модульная задача уровня host+shared-ui, см. companies/vite.config.ts).
      '@': path.join(__dirname, '../../host/src'),
      ...xyflowFederationResolve.alias,
    },
    dedupe: xyflowFederationResolve.dedupe,
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5019,
    strictPort: true,
  },
  preview: {
    port: 5019,
    strictPort: true,
  },
}))
