import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

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
    resolve: { alias: shared },
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: { input: { index: resolve(__dirname, 'app/renderer/index.html') } }
    }
  }
})
