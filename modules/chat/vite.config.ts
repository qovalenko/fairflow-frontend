import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { viteRemoteBase, fixFederationImportPaths } from '../../vite.remote-base'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

// dev-порт 5022 — следующий за remoteSearch:5021 (06-frontend-contract §1.2)
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
      name: 'remoteChat',
      filename: 'remoteEntry.js',
      exposes: {
        './ChatModule': './src/ChatModule.tsx',
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
    ],
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5022,
    strictPort: true,
  },
  preview: {
    port: 5022,
    strictPort: true,
  },
}))
