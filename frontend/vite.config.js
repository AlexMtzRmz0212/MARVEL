import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This file runs in Node, so it reads loadEnv/process.env -- never import.meta.env.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // '/' for a subdomain root (marvel.bittobyte.qzz.io). Overridable so the app
    // can still be served from a subpath without editing this file.
    base: env.VITE_BASE_PATH || '/',

    plugins: [react(), tailwindcss()],

    server: {
      // Mirrors production exactly: in both environments the SPA and the API
      // share an origin and the /api prefix is forwarded verbatim.
      proxy: {
        '/api': { target: 'http://localhost:8000', changeOrigin: true },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{js,jsx}'],
    },
  }
})
