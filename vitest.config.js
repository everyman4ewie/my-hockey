import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/vitest.setup.js'],
    include: ['shared/**/*.test.js', 'server/**/*.test.js', 'tests/**/*.test.js', 'src/**/*.test.{js,jsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: ['node_modules', 'dist', '**/*.test.*', 'tests/**', 'vite.config.js', 'vitest.config.js']
    },
    fileParallelism: false,
    pool: 'forks'
  }
})
