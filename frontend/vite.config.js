import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL?.trim()
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID?.trim()
  const backendOrigin = new URL(apiUrl || 'https://api.gobooksuite.com/api').origin
  const metaProxy = {
    '/auth/meta': { target: backendOrigin, changeOrigin: true },
    '/meta': { target: backendOrigin, changeOrigin: true },
  }
  if (command === 'build' && (!apiUrl || !apiUrl.startsWith('https://') || /localhost|127\.0\.0\.1/i.test(apiUrl))) {
    throw new Error('Production build requires VITE_API_URL with the public HTTPS backend URL')
  }
  if (command === 'build' && !/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(googleClientId || '')) {
    throw new Error('Production build requires a valid VITE_GOOGLE_CLIENT_ID')
  }
  return {
    plugins: [
      {
        name: 'isolate-middleware-cache',
        config(config) {
          // Rendering tests create middleware servers in parallel with Vite dev.
          // Their dependency optimizer must not replace the browser's cache.
          if (config.server?.middlewareMode && !config.cacheDir) {
            return { cacheDir: `node_modules/.vite-ssr/${process.pid}` }
          }
        },
      },
      react(),
      tailwindcss(),
    ],
    server: { proxy: metaProxy },
    preview: { proxy: metaProxy },
  }
})
