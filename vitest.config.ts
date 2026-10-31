import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'app/shared'), '@': resolve(__dirname, 'app/renderer/src') } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['tests/unit/setup.ts']
  }
})
