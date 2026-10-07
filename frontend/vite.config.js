import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// This file runs in Node, so it reads loadEnv/process.env -- never import.meta.env.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // '/' for a subdomain root (marvel.bittobyte.qzz.io). Overridable so the app
    // can still be served from a subpath without editing this file.
    base: env.VITE_BASE_PATH || '/',

    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // A new deploy takes over on the next launch without asking. Nothing in
        // the app holds unsaved state worth a "reload to update?" prompt: watch
        // progress and orders are written as they change.
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Marvel Watch Order',
          short_name: 'Watch Order',
          description:
            'The Marvel catalog in release, chronological and custom viewing orders, with a prerequisite chain for every title.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // The masthead band, so the launch splash and the status bar match
          // the first thing the app draws.
          background_color: '#17171c',
          theme_color: '#17171c',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            // The same artwork: it is drawn full bleed with the mark inside the
            // safe zone (see pwa/icon.svg), so it survives any platform's mask.
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Deep links open offline too, but /api and the dev-only editor are
          // never answered with the app shell.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/editor/],
          runtimeCaching: [
            {
              // The catalog is the same for everybody and changes only between
              // deploys: serve the last copy at once and refresh it behind the
              // scenes, which is what makes the installed app open instantly
              // and keeps it browsable offline. Anything per-user (/api/auth,
              // /api/me, /api/share) is deliberately left off this list and
              // always goes to the network.
              urlPattern: ({ url, request }) =>
                request.method === 'GET' &&
                url.origin === self.location.origin &&
                /^\/api\/(movies|orders\/(release|chronological)|graph)(\/|$)/.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'catalog-api',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // Posters never change at a given URL.
              urlPattern: ({ url }) => url.origin === 'https://image.tmdb.org',
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images',
                // Opaque responses count against the storage quota at a padded
                // size, so let the browser drop this cache rather than fail.
                expiration: {
                  maxEntries: 600,
                  maxAgeSeconds: 60 * 60 * 24 * 60,
                  purgeOnQuotaError: true,
                },
                // 0 covers the opaque responses a cross-origin <img> produces.
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],

    server: {
      // Mirrors production exactly: in both environments the SPA and the API
      // share an origin and the /api prefix is forwarded verbatim.
      proxy: {
        '/api': { target: 'http://localhost:8000', changeOrigin: true },
        // The catalog editor's local backend (backend/scripts/catalog_api.py),
        // a separate process on its own port so nothing dev-only is ever
        // importable from the shipped app. Dev server only — `server.proxy`
        // has no effect on a build, and `editor.html` is not built anyway.
        '/editor-api': { target: 'http://127.0.0.1:8010', changeOrigin: true },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{js,jsx}'],
    },
  }
})
