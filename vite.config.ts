import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { RuntimeCaching } from 'workbox-build'

/**
 * Regras de cache para o projecto Supabase (build-time via VITE_SUPABASE_URL).
 * - auth: nunca cachear (tokens / refresh).
 * - REST: NetworkFirst com fallback — última leitura disponível offline (por URL + cabeçalhos).
 * - Edge Functions: idem, TTL mais curto.
 * - Storage público: SWR para imagens/anexos servidos sem auth.
 */
function runtimeCachingSupabase(supabaseUrlRaw: string): RuntimeCaching[] {
  const base = supabaseUrlRaw.trim().replace(/\/+$/, '')
  if (!base) return []

  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const cacheable = { statuses: [0, 200] }

  return [
    {
      urlPattern: new RegExp(`^${escaped}/auth/v1/`),
      handler: 'NetworkOnly',
    },
    {
      urlPattern: new RegExp(`^${escaped}/rest/v1/`),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'rg-supabase-rest-v1',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: cacheable,
      },
    },
    {
      urlPattern: new RegExp(`^${escaped}/functions/v1/`),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'rg-supabase-functions-v1',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 3 },
        cacheableResponse: cacheable,
      },
    },
    {
      urlPattern: new RegExp(`^${escaped}/storage/v1/object/public/`),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'rg-supabase-storage-public',
        expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: cacheable,
      },
    },
  ]
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseCaching = runtimeCachingSupabase(env.VITE_SUPABASE_URL || '')

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'assets/logo/favicon.svg',
        'assets/logo/favicon.ico',
        'assets/logo/favicon-16x16.png',
        'assets/logo/favicon-32x32.png',
        'assets/logo/apple-touch-icon.png',
        'assets/logo/pwa-192.png',
        'assets/logo/pwa-512.png',
        'assets/logo/pwa-maskable-512.png',
        'assets/logo/favicon-source.png',
        'assets/logo/rg-ambiental-wordmark.png',
        'assets/logo/rg-ambiental-icon-square.png',
      ],
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        id: '/',
        name: 'RG Ambiental',
        short_name: 'RG Ambiental',
        description: 'Sistema RG Ambiental',
        theme_color: '#0f766e',
        background_color: '#f8fafc',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        dir: 'ltr',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/assets/logo/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/logo/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/logo/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        /** Respostas de navegação mais rápidas quando o SW está ativo. */
        navigationPreload: true,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          ...supabaseCaching,
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rg-ambiental-fonts-css',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rg-ambiental-fonts-files',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  }
})
