import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Deploys run on a pushed v* tag; elsewhere describe the checkout relative to the latest tag.
function appVersion(): string {
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME
  }
  try {
    return execSync('git describe --tags --always', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // src/app/registerAppUpdates.ts registers the worker and decides when to reload onto a new version.
      injectRegister: false,
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
        // Activate a new deploy as soon as it is installed; the page then reloads onto it when that's harmless.
        skipWaiting: true,
        clientsClaim: true,
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
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' http://127.0.0.1:43781 http://localhost:43781 https:; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; script-src 'self' https://accounts.google.com/gsi/client; frame-src https://accounts.google.com/gsi/; worker-src 'self' blob: data:; font-src 'self' data:;" />`,
          )
        }
        return html
      },
    },
    {
      name: 'polyfill-document-in-worker',
      renderChunk(code, chunk) {
        if (chunk.fileName.includes('preload-helper')) {
          return `if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      relList: { supports: () => false },
      setAttribute: () => {},
      addEventListener: (type, cb) => { if (type === 'load') setTimeout(cb, 0); }
    }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    head: { appendChild: () => {} }
  };
  globalThis.window = { dispatchEvent: () => {} };
}
` + code;
        }
        return null;
      }
    }
  ],
  build: {
    modulePreload: false,
    assetsInlineLimit: 0,
    // cubing/twisty ships a large 3D chunk and WASM binary that are lazily loaded
    // only by the desktop scramble preview and therefore not on the initial path.
    chunkSizeWarningLimit: 800,
  },
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
    testTimeout: 20000,
  },
})
