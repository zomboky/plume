import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import pkg from './package.json'

const shared = { '@shared': resolve(__dirname, 'app/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'app/main/index.ts') } } }
  },
  preload: {
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'app/preload/index.ts') } } }
  },
  renderer: {
    root: resolve(__dirname, 'app/renderer'),
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: { alias: { ...shared, '@': resolve(__dirname, 'app/renderer/src') } },
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: { input: { index: resolve(__dirname, 'app/renderer/index.html') } }
    }
  }
})
