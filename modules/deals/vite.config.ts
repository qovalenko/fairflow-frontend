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
      name: 'remoteDeals',
      filename: 'remoteEntry.js',
      exposes: {
        './DealsModule': './src/DealsModule.tsx',
        './DealsCardTab': './src/Deals/DealsCardTab',
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
    alias: [
      {
        find: '@',
        replacement: path.join(__dirname, '../../host/src'),
      },
      {
        find: '@fairflow/slot-catalog',
        replacement: path.join(
          __dirname,
          '../../../be-r3-ui-shell/shared/src/slot-catalog.ts',
        ),
      },
    ],
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      // EntityCreateDrawer / HostSlot pull federation `remote*` imports through the
      // `@` alias; they are satisfied at runtime by the host, not bundled into the remote.
      external: /^remote[A-Z][\w/]*$/,
    },
  },
  server: {
    port: 5013,
    strictPort: true,
  },
  preview: {
    port: 5013,
    strictPort: true,
  },
}))
