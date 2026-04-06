import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Прокси /api → Node (тот же порт, что в server/index.js и в .env PORT). */
function apiProxyTarget(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  const p = String(env.PORT || '3002').trim()
  return `http://127.0.0.1:${p}`
}

export default defineConfig(({ mode }) => {
  const apiTarget = apiProxyTarget(mode)
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    },
    '/uploads/help': {
      target: apiTarget,
      changeOrigin: true,
      secure: false
    }
  }
  return {
    plugins: [react()],
    build: {
      /** Тяжёлый бандл (three.js и др.); порог только для предупреждения в консоли сборки. */
      chunkSizeWarningLimit: 1700
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
    },
    server: {
      port: 5173,
      proxy
    },
    /** `vite preview` без этого не проксирует /api — запросы «в никуда». */
    preview: {
      port: 4173,
      proxy
    }
  }
})
