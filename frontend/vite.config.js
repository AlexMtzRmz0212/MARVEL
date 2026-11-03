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
        // A new deploy installs in the background and waits; UpdateToast tells
        // the visitor and swaps it in when they tap Reload. It registers the
        // worker itself (and checks for updates on a timer), so the plugin must
        // not inject a second registration.
        registerType: 'prompt',
        injectRegister: false,
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
          // The editor is a lazy chunk (features/admin/AdminPage.jsx) that only
          // the owner ever loads; precaching it would make every installed app
          // download it.
          globIgnores: ['**/EditorApp-*.js'],
          // Deep links open offline too, but /api is never answered with the
          // app shell.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // The catalog is the same for everybody and changes only when the
              // editor saves: serve the last copy at once and refresh it behind
              // the scenes, which is what makes the installed app open instantly
              // and keeps it browsable offline (an edit reaches a returning
              // visitor on their next load). Anything per-user (/api/auth,
              // /api/me, /api/share) and the editor (/api/admin) is deliberately
              // left off this list and always goes to the network.
              urlPattern: ({ url, request }) =>
                request.method === 'GET' &&
                url.origin === self.location.origin &&
                /^\/api\/(movies|orders\/(release|chronological|recommended)|graph)(\/|$)/.test(url.pathname),
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
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{js,jsx}'],
    },
  }
})
