import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CubeTimer',
        short_name: 'CubeTimer',
        description: 'Offline-first cube timer',
        theme_color: '#1d4ed8',
        background_color: '#0f1115',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/v1/') || url.pathname.startsWith('/health/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    {
      name: 'production-csp',
      transformIndexHtml(html, ctx) {
        if (!ctx.server) {
          return html.replace(
            '<meta charset="UTF-8" />',
            `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' http://127.0.0.1:43781 http://localhost:43781 https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; font-src 'self';" />`,
          )
        }
        return html
      },
    },
  ],
  server: {
    port: 43210,
    host: '127.0.0.1',
  },
  optimizeDeps: {
    exclude: ['cubing'],
  },
  preview: {
    port: 43210,
    host: '127.0.0.1',
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
