import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { viteRemoteBase, fixFederationImportPaths } from '../../vite.remote-base'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => ({
  base: viteRemoteBase(command, moduleDir),
  // data-qa-id (e2e selectors, T-028): ON for dev/standalone serve and any build
  // with VITE_QA_IDS=true; OFF for a plain prod `vite build`. Build-time constant
  // so the disabled branch is tree-shaken out of the remote bundle.
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
      name: 'remoteActivities',
      filename: 'remoteEntry.js',
      exposes: {
        './ActivitiesModule': './src/ActivitiesModule.tsx',
        './ActivityCardTab': './src/Activities/ActivityCardTab.tsx',
        './ActivityOverdueWidget': './src/Activities/ActivityOverdueWidget.tsx',
        './ActivityNextStepSidebar': './src/Activities/ActivityNextStepSidebar.tsx',
        './EntityListActionMenu': './src/Activities/EntityListActionMenu.tsx',
        './EntityListBulkActionMenu': './src/Activities/EntityListBulkActionMenu.tsx',
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
      // HostSlot/loadRemoteComponent dynamic imports — резолвим на локальные
      // exposes при prod-сборке remote (иначе Rollup не находит remoteActivities/*).
      'remoteActivities/ActivityCardTab': path.join(
        __dirname,
        'src/Activities/ActivityCardTab.tsx',
      ),
      'remoteActivities/ActivityOverdueWidget': path.join(
        __dirname,
        'src/Activities/ActivityOverdueWidget.tsx',
      ),
      'remoteActivities/ActivityNextStepSidebar': path.join(
        __dirname,
        'src/Activities/ActivityNextStepSidebar.tsx',
      ),
      'remoteActivities/EntityListActionMenu': path.join(
        __dirname,
        'src/Activities/EntityListActionMenu.tsx',
      ),
      'remoteActivities/EntityListBulkActionMenu': path.join(
        __dirname,
        'src/Activities/EntityListBulkActionMenu.tsx',
      ),
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5015,
    strictPort: true,
  },
  preview: {
    port: 5015,
    strictPort: true,
  },
}))
